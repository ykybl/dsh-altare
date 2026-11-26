/**
 * 工具定义的公共外壳：统一的 JSON 输出、截断渲染、参数解析。
 * @module dsh-altare/tools/shared
 */
import { badParam, toErrorValue } from '../errors.js';

/**
 * 宿主的 `defineTool` 会把「属性映射」编译成 JSON Schema 并在执行前校验参数。
 * 这里保留一份等价编译，用于宿主缺少 `@deepseek-ai/dsh-tools` 的场景（例如离线自检），
 * 保证注册出去的形状与宿主路径一致，不会退化成模型读不懂的裸属性映射。
 */
function propertyMapToJsonSchema(map) {
    const properties = {};
    const required = [];
    for (const [key, spec] of Object.entries(map ?? {})) {
        if (spec === null || typeof spec !== 'object') {
            properties[key] = {};
            continue;
        }
        const { required: isRequired, ...rest } = spec;
        // `json` 是宿主的作者态写法，落到 JSON Schema 里等于“任意值”。
        if (rest.type === 'json')
            delete rest.type;
        properties[key] = rest;
        if (isRequired === true)
            required.push(key);
    }
    return { type: 'object', properties, ...(required.length > 0 ? { required } : {}) };
}

let defineTool;
try {
    ({ defineTool } = await import('@deepseek-ai/dsh-tools'));
}
catch {
    console.warn('[dsh-altare] 未找到 @deepseek-ai/dsh-tools，使用内置等价编译器注册工具。');
    defineTool = options => ({
        name: options.name,
        description: options.description,
        parameters: propertyMapToJsonSchema(options.parameters),
        output: {
            // 宿主里 `{type:"json"}` 编译为仅含注解的空 schema，即“任意 JSON”。
            schema: {},
            render: options.output.render,
        },
        ...(options.isConcurrencySafe ? { isConcurrencySafe: options.isConcurrencySafe } : {}),
        ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
        async execute(args, exec) {
            return options.execute(args, exec);
        },
    });
}

/**
 * 把工具描述编译成宿主可直接注册的定义。
 * 参数 schema 在这一步由属性映射编译成 JSON Schema，并挂上执行前校验。
 */
export function compileTool(descriptor) {
    return defineTool(descriptor);
}

/** 把规范值渲染成模型可读文本；超长时截断并说明原因。 */
export function renderJson(value, maxChars = 20_000) {
    let text;
    try {
        text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    }
    catch {
        text = String(value);
    }
    if (text === undefined)
        text = 'undefined';
    if (text.length <= maxChars)
        return text;
    return `${text.slice(0, maxChars)}\n…[输出已截断：原长 ${text.length} 字符。请用更精确的参数（缩小 limit / 指定路径 / 加过滤条件）重试。]`;
}

/** 描述一个返回 JSON 的工具：参数用属性映射书写，由 compileTool 编译。 */
export function tool(options) {
    const { name, description, parameters, concurrencySafe = false, timeoutMs, run, runtime } = options;
    const maxChars = runtime.settings.maxOutputChars;
    return {
        name,
        description,
        parameters,
        output: {
            schema: { type: 'json' },
            render: (_args, value) => [{ type: 'text', text: renderJson(value, maxChars) }],
        },
        isConcurrencySafe: () => concurrencySafe,
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
        async execute(args, exec) {
            try {
                return await run(args, exec);
            }
            catch (error) {
                return toErrorValue(error);
            }
        },
    };
}

/** 解析 JSON 字符串参数；允许已经是对象。 */
export function parseJsonArg(value, label) {
    if (value === undefined || value === null || value === '')
        return undefined;
    if (typeof value === 'object')
        return value;
    try {
        return JSON.parse(String(value));
    }
    catch (error) {
        throw badParam(`${label} 不是合法 JSON：${error.message}`, '传 JSON 对象字符串，例如 {"KEY":"value"}。');
    }
}

/** 把字符串或数组参数规整成字符串数组（支持换行 / 逗号分隔）。 */
export function listArg(value, label) {
    if (value === undefined || value === null || value === '')
        return undefined;
    if (Array.isArray(value))
        return value.map(item => String(item).trim()).filter(item => item !== '');
    const text = String(value).trim();
    if (text === '')
        return undefined;
    return text.split(/[\n,]+/).map(item => item.trim()).filter(item => item !== '');
}

/** 必填字符串。 */
export function requireString(args, key, label) {
    const value = String(args[key] ?? '').trim();
    if (value === '')
        throw badParam(`缺少必填参数 ${key}（${label}）。`);
    return value;
}

/** 在对象里挑出已定义的字段。 */
export function pick(source, keys) {
    const out = {};
    for (const key of keys) {
        if (source?.[key] !== undefined && source[key] !== null)
            out[key] = source[key];
    }
    return out;
}

/** 轮询直到条件满足或超时；返回最后一次结果与是否超时。 */
export async function pollUntil(read, isDone, { timeoutMs, intervalMs, signal }) {
    const deadline = Date.now() + timeoutMs;
    let last;
    for (;;) {
        last = await read();
        if (isDone(last) || Date.now() >= deadline)
            return { value: last, timedOut: !isDone(last) };
        await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, intervalMs);
            const onAbort = () => {
                clearTimeout(timer);
                reject(signal?.reason ?? new Error('aborted'));
            };
            if (signal?.aborted) {
                clearTimeout(timer);
                reject(signal.reason ?? new Error('aborted'));
                return;
            }
            signal?.addEventListener?.('abort', onAbort, { once: true });
        });
    }
}
