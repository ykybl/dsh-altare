/**
 * Altare HTTP 客户端：拼 URL、带 Bearer、限速重试、把状态码翻译成结构化错误。
 *
 * 端点与错误码依据 https://docs.altare.gg/altare-api 与 /errors。
 * 令牌只在这里进入请求头，不落到返回值里。
 * @module dsh-altare/client
 */
import { AltareError } from './errors.js';

const CODE_GUIDANCE = {
    TOKEN_INVALID: '令牌不存在，或签发它的人已离开团队。到控制台 Team → Settings → API tokens 重新创建一个。',
    TOKEN_EXPIRED: '令牌已过期。到控制台重新签发，并把新值写回凭据库或环境变量。',
    TOKEN_REVOKED: '令牌已被吊销。到控制台重新签发后再试。',
    TOKEN_ROUTE_NOT_ALLOWED: '这个端点永久禁止 API token 调用（成员/角色/账单/令牌/审批/SSH/实时控制台等只能由人在控制台操作）。替代做法：用 altare_jobs 或 altare_schedules 在应用内执行命令。',
    TOKEN_WRONG_TEAM: '路径里的 tenantId 与令牌所属团队不一致。用 altare_whoami 取正确 team.id。',
};

const STATUS_GUIDANCE = {
    400: '请求参数不合法。按消息提示修正后重试。',
    403: '令牌缺少该操作所需的 scope，或该应用不在令牌的 app 范围内。用 altare_whoami 查看 scopes / serverIds，必要时在控制台重新签发。',
    404: '应用或资源不存在；git 系列端点对非 GitHub 部署型应用也会返回 404。',
    409: '状态冲突：应用正忙（部署/安装/恢复中）、备份已满 3 个、或预览数量到上限。稍后再试，或先清理占用。',
    429: '触发限速（每令牌 600 次/分钟，或归档 10 次/分钟、URL 拉取 20 次/分钟）。按 Retry-After 等待后重试。',
    502: '应用所在节点没有应答。稍等片刻后重试。',
};

function normalizeBaseUrl(value) {
    return String(value ?? 'https://console.altare.gg/api').trim().replace(/\/+$/, '');
}

/** 去掉 undefined / null / 空字符串的查询参数。 */
function cleanQuery(query) {
    if (!query || typeof query !== 'object')
        return undefined;
    const out = {};
    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '')
            continue;
        out[key] = value;
    }
    return Object.keys(out).length === 0 ? undefined : out;
}

function buildUrl(baseUrl, path, query) {
    const clean = cleanQuery(query);
    if (!clean)
        return baseUrl + path;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(clean))
        params.set(key, String(value));
    return `${baseUrl + path}?${params.toString()}`;
}

/** 响应头里的限速与重试信息。 */
function readMeta(response) {
    const header = (name) => response.headers?.get?.(name) ?? null;
    const retryAfterRaw = header('retry-after');
    const retryAfter = retryAfterRaw === null ? undefined : Number(retryAfterRaw);
    return {
        limit: header('x-ratelimit-limit'),
        remaining: header('x-ratelimit-remaining'),
        reset: header('x-ratelimit-reset'),
        retryAfter: Number.isFinite(retryAfter) ? retryAfter : undefined,
    };
}

/** 解析响应体：优先 JSON，失败则给原始文本。 */
async function parseBody(response) {
    const text = await response.text();
    if (text === '')
        return { data: undefined, raw: '' };
    try {
        return { data: JSON.parse(text), raw: text };
    }
    catch {
        return { data: undefined, raw: text };
    }
}

/** 把一次失败响应翻译成带指引的 AltareError。 */
function toApiError(method, path, response, parsed, meta) {
    const payload = parsed?.data ?? parsed ?? {};
    const code = payload?.code;
    const apiMessage = payload?.error ?? payload?.message ?? (typeof parsed?.raw === 'string' ? parsed.raw : '');
    let guidance = CODE_GUIDANCE[code] ?? STATUS_GUIDANCE[response.status];
    if (response.status === 403 && code === undefined) {
        guidance = '令牌缺少该操作所需的 scope，或该应用不在令牌的 app 范围内。用 altare_whoami 查看 scopes / serverIds。';
    }
    const retryHint = meta.retryAfter !== undefined ? `（Retry-After ${meta.retryAfter}s）` : '';
    return new AltareError(`Altare API ${response.status} ${method} ${path}: ${apiMessage}${retryHint}`, {
        status: response.status,
        code: code ?? `http-${response.status}`,
        retryAfter: meta.retryAfter,
        guidance,
    });
}

/**
 * 创建客户端。
 * @param options - baseUrl、getToken、超时、重试次数与可注入的 fetch。
 * @returns `{ request }`，`request(method, path, { query, body, signal, retry })`。
 */
export function createClient(options) {
    const baseUrl = normalizeBaseUrl(options.baseUrl);
    const getToken = options.getToken;
    const timeoutMs = options.timeoutMs ?? 30_000;
    const maxRetries = options.maxRetries ?? 2;
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;

    async function once(method, path, { query, body, signal } = {}) {
        const token = await getToken();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(new Error('Altare API request timed out')), timeoutMs);
        const onAbort = () => controller.abort(signal?.reason);
        if (signal) {
            if (signal.aborted)
                controller.abort(signal.reason);
            else
                signal.addEventListener('abort', onAbort, { once: true });
        }
        try {
            const headers = {
                Authorization: `Bearer ${token}`,
                Accept: 'application/json',
                'User-Agent': 'dsh-altare/1.0',
            };
            let payload;
            if (body !== undefined) {
                headers['Content-Type'] = 'application/json';
                payload = typeof body === 'string' ? body : JSON.stringify(body);
            }
            const response = await fetchImpl(buildUrl(baseUrl, path, query), {
                method,
                headers,
                body: payload,
                signal: controller.signal,
            });
            const parsed = await parseBody(response);
            const meta = readMeta(response);
            if (response.ok)
                return { data: parsed.data, raw: parsed.raw, status: response.status, meta };
            throw toApiError(method, path, response, parsed, meta);
        }
        finally {
            clearTimeout(timer);
            if (signal)
                signal.removeEventListener('abort', onAbort);
        }
    }

    async function request(method, path, opts = {}) {
        const retry = opts.retry !== false;
        const attempts = retry ? maxRetries + 1 : 1;
        let lastError;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
            try {
                return await once(method, path, opts);
            }
            catch (error) {
                lastError = error;
                const status = error?.status;
                const retryable = status === 429 || (status === 502 && method === 'GET') || status >= 500 && status < 600 && method === 'GET';
                if (!retryable || attempt === attempts - 1)
                    throw error;
                const waitMs = Math.min(30_000, (error.retryAfter ?? 1) * 1000 + attempt * 500);
                await sleep(waitMs, opts.signal);
            }
        }
        throw lastError;
    }

    return {
        baseUrl,
        request,
        get: (path, opts) => request('GET', path, opts),
        post: (path, body, opts) => request('POST', path, { ...opts, body }),
        patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
        put: (path, body, opts) => request('PUT', path, { ...opts, body }),
        delete: (path, opts) => request('DELETE', path, opts),
    };
}

/** 可中断的 sleep。 */
export function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(signal.reason ?? new Error('aborted'));
            return;
        }
        const timer = setTimeout(() => {
            cleanup();
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timer);
            cleanup();
            reject(signal.reason ?? new Error('aborted'));
        };
        function cleanup() {
            signal?.removeEventListener?.('abort', onAbort);
        }
        signal?.addEventListener?.('abort', onAbort, { once: true });
    });
}
