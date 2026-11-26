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
/** 只依赖宿主的 tools 服务；credentials 服务可选，缺失时走环境变量或配置。 */
export const inject = ['tools'];
export { Config };

/**
 * 应用插件：注册全部工具。
 * @param ctx - cordis 插件上下文。
 * @param config - 已校验的 Schemastery 配置。
 */
export function apply(ctx, config) {
    const runtime = createRuntime(ctx, config);
    for (const build of TOOL_BUILDERS)
        ctx.tools.register(compileTool(build(runtime)));
}
