/**
 * dsh-altare 插件入口。
 *
 * 注册 13 个工具：`altare_whoami`、`altare_apps`、`altare_deploys`、`altare_logs`、
 * `altare_files`、`altare_variables`、`altare_backups`、`altare_snapshots`、
 * `altare_network`、`altare_jobs`、`altare_schedules`、`altare_team`、`altare_api`。
 * 全部动作按 `/api-tokens/self` 返回的 scope 鉴权，缺权限时返回可执行的指引。
 * @module dsh-altare
 */
import { Config } from './config.js';
import { createRuntime } from './runtime.js';
import { TOOL_BUILDERS } from './tools/index.js';
import { compileTool } from './tools/shared.js';

export const name = 'dsh-altare';
/** 只依赖宿主的 tools 服务；credentials / webServer 可选，缺失时各自降级。 */
export const inject = ['tools'];
export { Config };

const ROUTE_PREFIX = '/altare';

function sendJson(response, status, body) {
    response.statusCode = status;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('cache-control', 'no-store');
    response.end(JSON.stringify(body));
}

/**
 * 设置面板读 `/altare/state`：令牌来源、团队、scopes。
 * 宿主没提供 webServer 时整段跳过，不影响工具。
 */
function registerPanelRoutes(ctx, runtime) {
    let webServer;
    try {
        webServer = ctx.get('webServer');
    }
    catch {
        webServer = null;
    }
    if (!webServer || typeof webServer.register !== 'function')
        return;
    ctx.effect(
        () => webServer.register({
            kind: 'prefix',
            path: ROUTE_PREFIX,
            handler: async (request, response) => {
                let url;
                try {
                    url = new URL(request.url ?? '/', 'http://127.0.0.1');
                }
                catch {
                    sendJson(response, 400, { ok: false, error: { code: 'bad-request', message: '无法解析请求地址。' } });
                    return;
                }
                if ((request.method ?? 'GET') === 'GET' && url.pathname === `${ROUTE_PREFIX}/state`) {
                    sendJson(response, 200, await runtime.describe());
                    return;
                }
                sendJson(response, 404, { ok: false, error: { code: 'not-found', message: '没有这个端点。' } });
            },
        }),
        'dsh-altare: settings routes',
    );
}

/**
 * 应用插件：注册全部工具与设置面板路由。
 * @param ctx - cordis 插件上下文。
 * @param config - 已校验的 Schemastery 配置。
 */
export function apply(ctx, config) {
    const runtime = createRuntime(ctx, config);
    for (const build of TOOL_BUILDERS)
        ctx.tools.register(compileTool(build(runtime)));
    registerPanelRoutes(ctx, runtime);
}
