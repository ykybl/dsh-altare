/**
 * 运行时：令牌解析、令牌自描述缓存、应用名解析与 scope 鉴权。
 *
 * 每次工具调用都从这里拿三样东西：`request`、`requireScope`、`serverBase`。
 * 令牌按操作逐次解析，轮换后下一次调用立即生效。
 * @module dsh-altare/runtime
 */
import { createClient } from './http.js';
import { AltareError, errorValue, toErrorValue } from './errors.js';
import { SCOPE_LABELS } from './scopes.js';

const NO_TOKEN_GUIDANCE = '在控制台 Team → Settings → API tokens 创建一个令牌（alt_ 开头），然后任选其一：'
    + '1) 设环境变量 ALTARE_TOKEN；'
    + '2) 写入 dsh 凭据库（~/.dsh/.credentials.yaml）并保持 tokenRef=ALTARE_TOKEN；'
    + '3) 在插件配置里填 altareToken（明文，仅建议用一次性令牌）。';

let cachedRefFn;
let cachedRefLoaded = false;

/** 动态加载 dsh-credentials 的 credentialRef；宿主没提供时退化为原样字符串。 */
async function loadCredentialRef() {
    if (cachedRefLoaded)
        return cachedRefFn;
    cachedRefLoaded = true;
    try {
        const mod = await import('@deepseek-ai/dsh-credentials');
        cachedRefFn = typeof mod.credentialRef === 'function' ? mod.credentialRef : null;
    }
    catch {
        cachedRefFn = null;
    }
    return cachedRefFn;
}

function safeCredentials(ctx) {
    try {
        return ctx?.get?.('credentials') ?? null;
    }
    catch {
        return null;
    }
}

/** 读一个可能是 volatile 引用的配置值。 */
function liveValue(value) {
    return typeof value?.get === 'function' ? value.get() : value;
}

/**
 * 解析令牌：config → 凭据库 → 环境变量（或 `tokenSource` 指定的单一来源）。
 * @returns `{ ok: true, token, source }` 或 `{ ok: false, error }`。
 */
export async function resolveToken({ credentials, tokenSource, tokenRef, configuredToken }) {
    const typed = String(liveValue(configuredToken) ?? '').trim();
    const order = tokenSource === 'auto'
        ? [...(typed === '' ? [] : ['config']), 'credentials', 'env']
        : [tokenSource];
    for (const source of order) {
        if (source === 'config') {
            if (typed !== '')
                return { ok: true, token: typed, source: 'config' };
            continue;
        }
        if (source === 'credentials') {
            if (!credentials || typeof credentials.resolve !== 'function')
                continue;
            try {
                const refFn = await loadCredentialRef();
                const ref = refFn ? refFn(tokenRef) : tokenRef;
                const resolved = await credentials.resolve(ref);
                const value = typeof resolved === 'string' ? resolved : resolved?.value;
                if (value && value.length > 0)
                    return { ok: true, token: value, source: 'credentials' };
            }
            catch {
                // 凭据库不可用或引用不存在：继续尝试下一个来源。
            }
            continue;
        }
        if (source === 'env') {
            const value = process.env[tokenRef];
            if (value && value.length > 0)
                return { ok: true, token: value, source: 'env' };
        }
    }
    return {
        ok: false,
        error: {
            code: 'no-token',
            message: `没有找到 Altare API 令牌（来源：${tokenSource === 'auto' ? 'config/credentials/env' : tokenSource}，引用：${tokenRef}）。`,
            guidance: NO_TOKEN_GUIDANCE,
        },
    };
}

/**
 * 创建运行时。
 * @param ctx - cordis 插件上下文，只用来取可选的 credentials 服务。
 * @param config - 已校验的插件配置。
 */
export function createRuntime(ctx, config) {
    const credentials = safeCredentials(ctx);
    const settings = {
        baseUrl: config.baseUrl ?? 'https://console.altare.gg/api',
        tokenSource: config.tokenSource ?? 'auto',
        tokenRef: config.tokenRef ?? 'ALTARE_TOKEN',
        timeoutMs: config.requestTimeoutMs ?? 30_000,
        maxRetries: config.maxRetries ?? 2,
        cacheTtlMs: config.cacheTtlMs ?? 60_000,
        maxOutputChars: config.maxOutputChars ?? 20_000,
    };

    let lastTokenSource = null;
    let selfCache = null;
    let selfAt = 0;
    let appsCache = null;
    let appsAt = 0;

    async function getToken() {
        const resolved = await resolveToken({
            credentials,
            tokenSource: settings.tokenSource,
            tokenRef: settings.tokenRef,
            configuredToken: config.altareToken,
        });
        if (!resolved.ok) {
            throw new AltareError(resolved.error.message, {
                status: 401,
                code: 'no-token',
                guidance: resolved.error.guidance,
            });
        }
        lastTokenSource = resolved.source;
        return resolved.token;
    }

    const client = createClient({
        baseUrl: settings.baseUrl,
        getToken,
        timeoutMs: settings.timeoutMs,
        maxRetries: settings.maxRetries,
    });

    /** 令牌自描述：团队、scopes、可用应用范围、过期时间。 */
    async function self({ force = false, signal } = {}) {
        if (!force && selfCache && Date.now() - selfAt < settings.cacheTtlMs)
            return selfCache;
        const res = await client.request('GET', '/api-tokens/self', { signal, retry: true });
        selfCache = res.data;
        selfAt = Date.now();
        return selfCache;
    }

    function forgetSelf() {
        selfCache = null;
        selfAt = 0;
        appsCache = null;
        appsAt = 0;
    }

    /** 鉴权：缺 scope 时返回规范错误值，否则返回 null。 */
    async function requireScope(scope, { signal } = {}) {
        if (scope === null || scope === undefined)
            return null;
        const info = await self({ signal });
        const scopes = Array.isArray(info?.scopes) ? info.scopes : [];
        if (scopes.includes(scope))
            return null;
        return errorValue(
            'scope-missing',
            `令牌缺少 scope "${scope}"，不能执行这个动作。`,
            `当前 scopes：${scopes.length === 0 ? '(无)' : scopes.join(', ')}。`
            + `到控制台 Team → Settings → API tokens 重新签发并勾选 ${scope}`
            + `（${SCOPE_LABELS[scope] ?? ''}）。`,
            { neededScope: scope, scopes },
        );
    }

    /** 团队 ID：`/api-tokens/self` 的 `team.id`。 */
    function tenantId(info) {
        const id = info?.team?.id;
        if (!id)
            throw new AltareError('拿不到团队 ID：/api-tokens/self 没有返回 team.id。', { code: 'no-team' });
        return id;
    }

    /** 列出令牌可见的应用，30 秒缓存。 */
    async function listApps({ force = false, signal } = {}) {
        if (!force && appsCache && Date.now() - appsAt < Math.min(settings.cacheTtlMs, 30_000))
            return appsCache;
        const info = await self({ signal });
        const res = await client.request('GET', `/tenants/${tenantId(info)}/servers`, { signal });
        appsCache = Array.isArray(res.data?.items) ? res.data.items : [];
        appsAt = Date.now();
        return appsCache;
    }

    /**
     * 把「应用名或 serverId」解析成应用对象。
     * 支持精确 id、精确名、唯一前缀/子串；多候选时把候选名回给模型。
     */
    async function resolveApp(app, { signal } = {}) {
        const key = String(app ?? '').trim();
        if (key === '')
            throw new AltareError('缺少 app：请传应用名或 serverId，或先用 altare_apps(action="list") 查看应用列表。', { code: 'missing-app' });
        const apps = await listApps({ signal });
        const byId = apps.find(item => item?.id === key);
        if (byId)
            return byId;
        const lower = key.toLowerCase();
        const exact = apps.filter(item => String(item?.name ?? '').toLowerCase() === lower);
        if (exact.length === 1)
            return exact[0];
        if (exact.length > 1) {
            throw new AltareError(`有 ${exact.length} 个应用叫 "${key}"，请改用 serverId。`, {
                code: 'ambiguous-app',
                guidance: `候选：${exact.map(item => `${item.name}(${item.id})`).join('、')}`,
            });
        }
        const partial = apps.filter(item => String(item?.name ?? '').toLowerCase().includes(lower));
        if (partial.length === 1)
            return partial[0];
        if (partial.length > 1) {
            throw new AltareError(`"${key}" 匹配到 ${partial.length} 个应用，请写更精确的名称或改用 serverId。`, {
                code: 'ambiguous-app',
                guidance: `候选：${partial.map(item => `${item.name}(${item.id})`).join('、')}`,
            });
        }
        throw new AltareError(`找不到应用 "${key}"。`, {
            code: 'app-not-found',
            guidance: `可用应用：${apps.slice(0, 30).map(item => item.name).join('、') || '(空)'}`,
        });
    }

    /** `/tenants/{team}/servers/{id}`，缺前缀的路径片段由调用方拼接。 */
    async function serverBase(app, { signal } = {}) {
        const info = await self({ signal });
        const resolved = await resolveApp(app, { signal });
        return `/tenants/${tenantId(info)}/servers/${resolved.id}`;
    }

    /** `/tenants/{team}`。 */
    async function tenantBase({ signal } = {}) {
        const info = await self({ signal });
        return `/tenants/${tenantId(info)}`;
    }

    /**
     * 设置面板用的一次性快照：令牌来源、团队、scopes、过期时间。
     * 只回令牌来源与前缀，绝不回令牌值。
     */
    async function describe() {
        const resolved = await resolveToken({
            credentials,
            tokenSource: settings.tokenSource,
            tokenRef: settings.tokenRef,
            configuredToken: config.altareToken,
        });
        const base = {
            baseUrl: settings.baseUrl,
            tokenRef: settings.tokenRef,
            tokenSourceSetting: settings.tokenSource,
        };
        if (!resolved.ok) {
            return {
                ok: true,
                ...base,
                hasToken: false,
                guidance: resolved.error.guidance,
            };
        }
        try {
            const info = await self({ force: true });
            return {
                ok: true,
                ...base,
                hasToken: true,
                tokenSource: resolved.source,
                team: info?.team ? { id: info.team.id, name: info.team.name } : null,
                scopes: Array.isArray(info?.scopes) ? info.scopes : [],
                serverIds: Array.isArray(info?.serverIds) ? info.serverIds : [],
                expiresAt: info?.expiresAt ?? null,
                tokenPrefix: typeof info?.prefix === 'string' ? info.prefix : null,
            };
        }
        catch (error) {
            return {
                ...toErrorValue(error),
                ...base,
                hasToken: true,
                tokenSource: resolved.source,
            };
        }
    }

    return {
        settings,
        client,
        request: client.request,
        self,
        forgetSelf,
        requireScope,
        tenantId,
        tenantBase,
        listApps,
        resolveApp,
        serverBase,
        describe,
        tokenSource: () => lastTokenSource,
    };
}
