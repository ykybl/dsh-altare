/**
 * `altare_api`：原始端点兜底，覆盖文档里新增或未封装的任何调用。
 * @module dsh-altare/tools/raw
 */
import { badParam, okValue } from '../errors.js';
import { parseJsonArg, tool } from './shared.js';

const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'];

export function rawTool(runtime) {
    return tool({
        runtime,
        name: 'altare_api',
        description: '直接调用任意 Altare API 端点（兜底用，覆盖文档新增或未封装的能力）。'
            + 'path 相对 https://console.altare.gg/api，必须以 / 开头，可写 {tenantId} 占位符自动替换为当前团队 ID；'
            + 'query 传 JSON 对象或 a=b&c=d；body 传 JSON 字符串。鉴权、重试与错误翻译与其他工具一致。'
            + '先用 altare_whoami 确认 scope，403 时按 guidance 处理。',
        parameters: {
            method: { type: 'string', required: true, description: 'GET | POST | PATCH | PUT | DELETE' },
            path: { type: 'string', required: true, description: '以 / 开头的路径，如 /tenants/{tenantId}/servers/{serverId}/backups' },
            query: { type: 'string', description: '查询参数：JSON 对象字符串，或 a=b&c=d。' },
            body: { type: 'string', description: '请求体：JSON 字符串。' },
            unwrap: { type: 'boolean', description: 'true 时把响应体的字段直接提到结果顶层（默认 false，统一放在 data 下）。' },
        },
        async run(args, exec) {
            const method = String(args.method ?? '').trim().toUpperCase();
            if (!METHODS.includes(method))
                throw badParam(`method 必须是 ${METHODS.join(' | ')}。`);

            let path = String(args.path ?? '').trim();
            if (!path.startsWith('/') || path.startsWith('//'))
                throw badParam('path 必须以单个 / 开头，且不能是完整 URL。');
            if (path.includes('..'))
                throw badParam('path 不能包含 ..。');
            if (path.includes('{tenantId}')) {
                const tenant = await runtime.tenantBase({ signal: exec.signal });
                path = path.replaceAll('{tenantId}', tenant.slice('/tenants/'.length));
            }

            let query;
            if (args.query !== undefined && String(args.query).trim() !== '') {
                const text = String(args.query).trim();
                query = text.startsWith('{') ? parseJsonArg(text, 'query') : parseQueryString(text);
            }
            if (query !== undefined && (query === null || typeof query !== 'object' || Array.isArray(query)))
                throw badParam('query 必须是 JSON 对象，或 a=b&c=d 形式的查询串。');

            const body = args.body !== undefined && args.body !== '' ? parseJsonArg(args.body, 'body') : undefined;

            const res = await runtime.request(method, path, { signal: exec.signal, query, body });
            return args.unwrap === true
                ? okValue({ status: res.status, ...(res.data && typeof res.data === 'object' && !Array.isArray(res.data) ? res.data : { data: res.data }) })
                : okValue({ status: res.status, data: res.data });
        },
    });
}

/** 解析 a=b&c=d 形式的查询串。 */
function parseQueryString(text) {
    const params = new URLSearchParams(String(text).trim());
    if ([...params.keys()].length === 0)
        return undefined;
    const out = {};
    for (const [key, value] of params)
        out[key] = value;
    return out;
}
