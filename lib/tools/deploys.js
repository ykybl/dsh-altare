/**
 * `altare_deploys`：GitHub 部署型应用的部署、状态、构建设置与预览。
 * @module dsh-altare/tools/deploys
 */
import { badParam, okValue } from '../errors.js';
import { parseJsonArg, pick, pollUntil, requireString, tool } from './shared.js';

const SCOPE = {
    settings: 'servers:view',
    deploy: 'servers:power',
    status: 'servers:view',
    wait: 'servers:view',
    build_settings: 'servers:settings',
    preview_create: 'servers:power',
    preview_deploy: 'servers:power',
    preview_delete: 'servers:power',
};

const BUILD_KEYS = [
    'branch', 'rootDir', 'version', 'install', 'build', 'start', 'onPush',
    'previews', 'healthPath', 'monitor', 'cacheStatic',
];

export function deploysTool(runtime) {
    return tool({
        runtime,
        name: 'altare_deploys',
        description: '部署 GitHub 部署型应用并管理其构建设置与预览。动作：'
            + 'settings 读仓库/构建配置/最近 20 次部署；deploy 部署分支、tag、commit（或用 sha 回滚）；'
            + 'status 看一次部署；wait 轮询到部署结束（返回 live/failed/superseded 与构建日志）；'
            + 'build_settings 改分支、构建命令、运行时版本、环境变量等（会触发重新部署）；'
            + 'preview_create / preview_deploy / preview_delete 管理预览环境。非 GitHub 部署型应用会返回 404。',
        parameters: {
            action: { type: 'string', required: true, description: 'settings | deploy | status | wait | build_settings | preview_create | preview_deploy | preview_delete' },
            app: { type: 'string', required: true, description: '应用名或 serverId。' },
            ref: { type: 'string', description: 'deploy：分支、tag 或 commit；留空用应用默认分支。' },
            sha: { type: 'string', description: 'deploy：回滚到某个 commit 的 sha（记为 rollback）。' },
            restart: { type: 'boolean', description: 'deploy：仅静态文件变化时也强制重启。' },
            deploymentId: { type: 'string', description: 'status / wait：部署 ID。wait 也可不传，改为等待最近一次部署。' },
            timeoutSeconds: { type: 'number', description: 'wait：最长等待秒数，默认 300。' },
            intervalSeconds: { type: 'number', description: 'wait：轮询间隔秒数，默认 3。' },
            branch: { type: 'string', description: 'build_settings：生产分支。' },
            rootDir: { type: 'string', description: 'build_settings：构建目录（monorepo 子目录）。' },
            version: { type: 'string', description: 'build_settings：运行时版本。' },
            install: { type: 'string', description: 'build_settings：安装命令（单行）。' },
            build: { type: 'string', description: 'build_settings：构建命令（单行）。' },
            start: { type: 'string', description: 'build_settings：启动命令（单行，不能为空）。' },
            onPush: { type: 'string', description: 'build_settings：push 后行为 deploy | notify | ignore。' },
            previews: { type: 'string', description: 'build_settings：预览策略 off | pulls | branches。' },
            healthPath: { type: 'string', description: 'build_settings：健康检查路径，如 /health。' },
            monitor: { type: 'boolean', description: 'build_settings：开启可用性监控。' },
            cacheStatic: { type: 'boolean', description: 'build_settings：边缘缓存静态文件。' },
            envText: { type: 'string', description: 'build_settings：Dotenv 文本，合并进现有变量，如 API_KEY=abc\\nDEBUG=1。' },
            env: { type: 'string', description: 'build_settings：JSON 对象，替换全部应用变量（漏掉的会被删除）。' },
            previewEnvText: { type: 'string', description: 'build_settings：预览专用变量的 Dotenv 文本。' },
            previewEnv: { type: 'string', description: 'build_settings：JSON 对象，替换全部预览变量。' },
            previewId: { type: 'string', description: 'preview_deploy / preview_delete：预览 ID。' },
        },
        async run(args, exec) {
            const action = String(args.action ?? '').trim();
            const scope = SCOPE[action];
            if (scope === undefined)
                throw badParam(`未知 action "${action}"。`, `可用：${Object.keys(SCOPE).join(' | ')}。`);
            const gate = await runtime.requireScope(scope, { signal: exec.signal });
            if (gate)
                return gate;

            const app = requireString(args, 'app', '应用名或 serverId');
            const base = await runtime.serverBase(app, { signal: exec.signal });
            const git = `${base}/git`;

            switch (action) {
                case 'settings': {
                    const res = await runtime.request('GET', git, { signal: exec.signal });
                    return okValue({ git: res.data });
                }
                case 'deploy': {
                    const body = pick(args, ['ref', 'sha']);
                    if (args.restart === true)
                        body.restart = true;
                    const res = await runtime.request('POST', `${git}/deploy`, { signal: exec.signal, body });
                    return okValue({ app: await runtime.resolveApp(app, { signal: exec.signal }), deployment: res.data?.deployment ?? res.data });
                }
                case 'status': {
                    const deploymentId = requireString(args, 'deploymentId', '部署 ID');
                    const res = await runtime.request('GET', `${git}/deployments/${encodeURIComponent(deploymentId)}`, { signal: exec.signal });
                    return okValue({ deployment: res.data });
                }
                case 'wait': {
                    let deploymentId = String(args.deploymentId ?? '').trim();
                    if (deploymentId === '') {
                        const list = await runtime.request('GET', git, { signal: exec.signal });
                        const deployments = Array.isArray(list.data?.deployments) ? list.data.deployments : [];
                        if (deployments.length === 0)
                            throw badParam('该应用还没有部署记录，无法等待；请先 deploy。');
                        deploymentId = deployments[0].id;
                    }
                    const timeoutMs = Math.min(Math.max(Number(args.timeoutSeconds) || 300, 1), 3600) * 1000;
                    const intervalMs = Math.min(Math.max(Number(args.intervalSeconds) || 3, 1), 60) * 1000;
                    const { value, timedOut } = await pollUntil(
                        async () => {
                            const res = await runtime.request('GET', `${git}/deployments/${encodeURIComponent(deploymentId)}`, {
                                signal: exec.signal,
                                retry: false,
                            });
                            return res.data;
                        },
                        data => data?.done === true,
                        { timeoutMs, intervalMs, signal: exec.signal },
                    );
                    return okValue({ deploymentId, timedOut, deployment: value });
                }
                case 'build_settings': {
                    const body = pick(args, BUILD_KEYS);
                    for (const key of ['env', 'previewEnv']) {
                        if (args[key] !== undefined && args[key] !== '') {
                            const parsed = parseJsonArg(args[key], key);
                            if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
                                throw badParam(`${key} 必须是 JSON 对象。`);
                            body[key] = parsed;
                        }
                    }
                    for (const key of ['envText', 'previewEnvText']) {
                        if (args[key] !== undefined && args[key] !== '')
                            body[key] = args[key];
                    }
                    if (Object.keys(body).length === 0)
                        throw badParam('build_settings 至少要传一个要修改的字段。');
                    const res = await runtime.request('PATCH', git, { signal: exec.signal, body });
                    return okValue({ app: await runtime.resolveApp(app, { signal: exec.signal }), result: res.data });
                }
                case 'preview_create': {
                    const branch = requireString(args, 'branch', '预览分支');
                    const res = await runtime.request('POST', `${git}/previews`, { signal: exec.signal, body: { branch } });
                    return okValue({ preview: res.data?.preview ?? res.data });
                }
                case 'preview_deploy': {
                    const previewId = requireString(args, 'previewId', '预览 ID');
                    const res = await runtime.request('POST', `${git}/previews/${encodeURIComponent(previewId)}/deploy`, { signal: exec.signal });
                    return okValue({ preview: res.data?.preview ?? res.data });
                }
                case 'preview_delete': {
                    const previewId = requireString(args, 'previewId', '预览 ID');
                    const res = await runtime.request('DELETE', `${git}/previews/${encodeURIComponent(previewId)}`, { signal: exec.signal });
                    return okValue({ previewId, result: res.data });
                }
                default:
                    throw badParam(`未知 action "${action}"。`);
            }
        },
    });
}
