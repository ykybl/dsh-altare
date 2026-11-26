/**
 * `altare_apps`：应用列表、详情、电源、重命名、重装、启动设置、活动。
 * @module dsh-altare/tools/apps
 */
import { badParam, okValue } from '../errors.js';
import { parseJsonArg, pick, requireString, tool } from './shared.js';

const SCOPE = {
    list: 'servers:view',
    details: 'servers:view',
    power: 'servers:power',
    rename: 'servers:settings',
    reinstall: 'servers:settings',
    startup_get: 'servers:startup',
    startup_set: 'servers:startup',
    activity: 'servers:activity',
};

const SIGNALS = ['start', 'stop', 'restart', 'kill'];

export function appsTool(runtime) {
    return tool({
        runtime,
        name: 'altare_apps',
        description: '管理 Altare 应用（app / server / sandbox 在 API 里都是 app）。动作：'
            + 'list 列出应用；details 看地址/节点/部署方式；power 启停（start/stop/restart/kill）；'
            + 'rename 改名或描述；reinstall 重跑安装；startup_get / startup_set 查看或修改启动命令、镜像与模板变量；'
            + 'activity 看最近变更。app 可传应用名或 serverId，名称支持唯一子串匹配。',
        parameters: {
            action: { type: 'string', required: true, description: 'list | details | power | rename | reinstall | startup_get | startup_set | activity' },
            app: { type: 'string', description: '应用名或 serverId；除 list 外必填。' },
            signal: { type: 'string', description: 'power 动作的信号：start | stop | restart | kill。' },
            name: { type: 'string', description: 'rename：新名称。' },
            description: { type: 'string', description: 'rename：新描述。' },
            environment: { type: 'string', description: 'startup_set：JSON 对象字符串，键为变量名，如 {"SERVER_JARFILE":"paper.jar"}。' },
            dockerImage: { type: 'string', description: 'startup_set：dockerImages 里的一个镜像名。' },
            startup: { type: 'string', description: 'startup_set：新的启动命令（单行）。' },
        },
        async run(args, exec) {
            const action = String(args.action ?? '').trim();
            const scope = SCOPE[action];
            if (scope === undefined)
                throw badParam(`未知 action "${action}"。`, `可用：${Object.keys(SCOPE).join(' | ')}。`);
            const gate = await runtime.requireScope(scope, { signal: exec.signal });
            if (gate)
                return gate;

            if (action === 'list') {
                const base = await runtime.tenantBase({ signal: exec.signal });
                const res = await runtime.request('GET', `${base}/servers`, { signal: exec.signal });
                const items = Array.isArray(res.data?.items) ? res.data.items : [];
                return okValue({ count: items.length, apps: items });
            }

            const app = requireString(args, 'app', '应用名或 serverId');
            const base = await runtime.serverBase(app, { signal: exec.signal });

            switch (action) {
                case 'details': {
                    const res = await runtime.request('GET', `${base}/details`, { signal: exec.signal });
                    return okValue({ app: res.data });
                }
                case 'power': {
                    const signal = String(args.signal ?? '').trim();
                    if (!SIGNALS.includes(signal))
                        throw badParam(`power 的 signal 必须是 ${SIGNALS.join(' | ')}。`);
                    const res = await runtime.request('POST', `${base}/power`, {
                        signal: exec.signal,
                        body: { signal },
                    });
                    return okValue({ app: await runtime.resolveApp(app, { signal: exec.signal }), signal, result: res.data });
                }
                case 'rename': {
                    const body = pick(args, ['name', 'description']);
                    if (Object.keys(body).length === 0)
                        throw badParam('rename 至少要传 name 或 description 之一。');
                    const res = await runtime.request('PATCH', `${base}/settings`, { signal: exec.signal, body });
                    return okValue({ app: await runtime.resolveApp(app, { signal: exec.signal }), result: res.data });
                }
                case 'reinstall': {
                    const res = await runtime.request('POST', `${base}/settings/reinstall`, { signal: exec.signal });
                    return okValue({ app: await runtime.resolveApp(app, { signal: exec.signal }), result: res.data });
                }
                case 'startup_get': {
                    const res = await runtime.request('GET', `${base}/startup`, { signal: exec.signal });
                    return okValue({ startup: res.data });
                }
                case 'startup_set': {
                    const body = {};
                    if (args.environment !== undefined && args.environment !== '') {
                        const env = parseJsonArg(args.environment, 'environment');
                        if (env === null || typeof env !== 'object' || Array.isArray(env))
                            throw badParam('environment 必须是 JSON 对象。');
                        body.environment = env;
                    }
                    if (args.dockerImage !== undefined && args.dockerImage !== '')
                        body.dockerImage = args.dockerImage;
                    if (args.startup !== undefined && args.startup !== '')
                        body.startup = args.startup;
                    if (Object.keys(body).length === 0)
                        throw badParam('startup_set 至少要传 environment、dockerImage、startup 之一。');
                    const res = await runtime.request('PATCH', `${base}/startup`, { signal: exec.signal, body });
                    return okValue({ app: await runtime.resolveApp(app, { signal: exec.signal }), startup: res.data });
                }
                case 'activity': {
                    const res = await runtime.request('GET', `${base}/activity`, { signal: exec.signal });
                    return okValue({ activity: res.data });
                }
                default:
                    throw badParam(`未知 action "${action}"。`);
            }
        },
    });
}
