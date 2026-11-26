/**
 * `altare_variables`：应用变量与团队变量。
 * @module dsh-altare/tools/variables
 */
import { badParam, okValue } from '../errors.js';
import { parseJsonArg, requireString, tool } from './shared.js';

const SCOPE = {
    app_get: 'servers:view',
    app_set: 'servers:settings',
    team_list: 'team:settings:view',
    team_set: 'team:settings:manage',
    team_delete: 'team:settings:manage',
};

export function variablesTool(runtime) {
    return tool({
        runtime,
        name: 'altare_variables',
        description: '读写环境变量。应用变量属于 GitHub 部署型应用的构建设置（改完自动重新部署）；'
            + '团队变量被全团队应用共享，同名时应用变量优先。动作：app_get 读应用变量；'
            + 'app_set 用 envText 合并写入（推荐）或用 env 整体替换；team_list 列团队变量（无 team:settings:manage 时 value 为 null）；'
            + 'team_set 新增/覆盖团队变量；team_delete 按 envId 删除。',
        parameters: {
            action: { type: 'string', required: true, description: 'app_get | app_set | team_list | team_set | team_delete' },
            app: { type: 'string', description: '应用名或 serverId（app_get / app_set 必填）。' },
            envText: { type: 'string', description: 'app_set：Dotenv 文本，合并进现有变量，如 API_KEY=abc\\nDEBUG=1。' },
            env: { type: 'string', description: 'app_set：JSON 对象，替换全部应用变量（未包含的名字会被删除）。' },
            previewEnvText: { type: 'string', description: 'app_set：预览专用变量，Dotenv 文本。' },
            previewEnv: { type: 'string', description: 'app_set：JSON 对象，替换全部预览变量。' },
            name: { type: 'string', description: 'team_set：变量名（字母数字下划线，不能数字开头）。' },
            value: { type: 'string', description: 'team_set：变量值（最大 8 KB）。' },
            production: { type: 'boolean', description: 'team_set：是否给生产部署（默认 true）。' },
            preview: { type: 'boolean', description: 'team_set：是否给预览（默认 true）。' },
            envId: { type: 'string', description: 'team_delete：团队变量 ID。' },
        },
        async run(args, exec) {
            const action = String(args.action ?? '').trim();
            const scope = SCOPE[action];
            if (scope === undefined)
                throw badParam(`未知 action "${action}"。`, `可用：${Object.keys(SCOPE).join(' | ')}。`);
            const gate = await runtime.requireScope(scope, { signal: exec.signal });
            if (gate)
                return gate;

            if (action === 'app_get' || action === 'app_set') {
                const app = requireString(args, 'app', '应用名或 serverId');
                const base = await runtime.serverBase(app, { signal: exec.signal });
                if (action === 'app_get') {
                    const res = await runtime.request('GET', `${base}/git`, { signal: exec.signal });
                    const settings = res.data?.settings ?? {};
                    return okValue({
                        app: await runtime.resolveApp(app, { signal: exec.signal }),
                        env: settings.env ?? null,
                        previewEnv: settings.previewEnv ?? null,
                        note: settings.env === null || settings.env === undefined
                            ? 'env 为 null 通常表示令牌缺少 servers:settings，只能看到变量名以外的信息。'
                            : '用 app_set + envText 可以合并写入；用 env 会整体替换。',
                    });
                }
                const body = {};
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
                    throw badParam('app_set 至少要传 envText / env / previewEnvText / previewEnv 之一。');
                const res = await runtime.request('PATCH', `${base}/git`, { signal: exec.signal, body });
                return okValue({
                    app: await runtime.resolveApp(app, { signal: exec.signal }),
                    result: res.data,
                    note: res.data?.deployed === true ? '本次修改触发了重新部署。' : undefined,
                });
            }

            const tenant = await runtime.tenantBase({ signal: exec.signal });
            if (action === 'team_list') {
                const res = await runtime.request('GET', `${tenant}/env`, { signal: exec.signal });
                return okValue({ canManage: res.data?.canManage, items: res.data?.items ?? [] });
            }
            if (action === 'team_set') {
                const body = {
                    name: requireString(args, 'name', '变量名'),
                    value: String(args.value ?? ''),
                };
                if (args.production === false)
                    body.production = false;
                if (args.preview === false)
                    body.preview = false;
                if (body.value === '')
                    throw badParam('team_set 需要传 value。');
                const res = await runtime.request('PUT', `${tenant}/env`, { signal: exec.signal, body });
                return okValue({ result: res.data, note: '应用在下次部署时拿到新的团队变量。' });
            }
            const envId = requireString(args, 'envId', '团队变量 ID');
            const res = await runtime.request('DELETE', `${tenant}/env/${encodeURIComponent(envId)}`, { signal: exec.signal });
            return okValue({ envId, result: res.data });
        },
    });
}
