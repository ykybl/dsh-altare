/**
 * `altare_network`：域名与端口。
 * @module dsh-altare/tools/network
 */
import { badParam, okValue } from '../errors.js';
import { requireString, tool } from './shared.js';

const SCOPE = {
    domains_list: 'servers:network',
    domain_available: 'servers:network',
    domain_create: 'servers:network',
    domain_check: 'servers:network',
    domain_update: 'servers:network',
    domain_delete: 'servers:network',
    ports_list: 'servers:network',
    port_create: 'servers:network',
    port_set_primary: 'servers:network',
    port_delete: 'servers:network',
};

const KINDS = ['https', 'a', 'srv'];
const APPS = ['web', 'minecraft-java', 'minecraft-bedrock', 'ssh', 'other'];

export function networkTool(runtime) {
    return tool({
        runtime,
        name: 'altare_network',
        description: '管理应用的域名与端口。动作：domains_list 列出域名、端口与可用名额；'
            + 'domain_available 查某个 label 能否用；domain_create 添加域名（base domain 或自有域名，自有域名需 custom:true）；'
            + 'domain_check 重新校验自有域名的 DNS；domain_update 改指向的端口或类型；domain_delete 删除域名；'
            + 'ports_list 列端口；port_create 加端口；port_set_primary 设为主地址；port_delete 删端口。'
            + '购买端口名额与保留端口要花 bolts，只能在控制台做。',
        parameters: {
            action: { type: 'string', required: true, description: 'domains_list | domain_available | domain_create | domain_check | domain_update | domain_delete | ports_list | port_create | port_set_primary | port_delete' },
            app: { type: 'string', required: true, description: '应用名或 serverId。' },
            label: { type: 'string', description: 'domain_available / domain_create：label 或自有域名主机名，如 my-site / www.example.com。' },
            custom: { type: 'boolean', description: 'domain_create：true 表示自有域名（恒为 https）。' },
            allocationId: { type: 'number', description: 'domain_create / domain_update / port_set_primary / port_delete：端口 ID。' },
            kind: { type: 'string', description: 'domain_create / domain_update：https | a | srv。' },
            appKind: { type: 'string', description: 'domain_create / domain_update：web | minecraft-java | minecraft-bedrock | ssh | other。' },
            srvService: { type: 'string', description: 'domain_create：srv + app=other 时自定义服务，如 _myservice._tcp。' },
            domainId: { type: 'string', description: 'domain_check / domain_update / domain_delete：域名 ID。' },
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
            const network = `${base}/network`;

            switch (action) {
                case 'domains_list': {
                    const res = await runtime.request('GET', `${network}/domains`, { signal: exec.signal });
                    return okValue({ network: res.data });
                }
                case 'domain_available': {
                    const label = requireString(args, 'label', 'label');
                    const res = await runtime.request('GET', `${network}/domains/available`, { signal: exec.signal, query: { label } });
                    return okValue({ label, availability: res.data });
                }
                case 'domain_create': {
                    const label = requireString(args, 'label', 'label');
                    const custom = args.custom === true;
                    const kind = String(args.kind ?? '').trim();
                    if (!custom && !KINDS.includes(kind))
                        throw badParam(`domain_create 需要 kind 为 ${KINDS.join(' | ')}（custom:true 时可省略）。`);
                    const body = { label, custom };
                    if (args.allocationId === undefined || args.allocationId === null)
                        throw badParam('domain_create 需要 allocationId（端口 ID，见 ports_list）。');
                    body.allocationId = Number(args.allocationId);
                    if (!custom)
                        body.kind = kind;
                    if (args.appKind !== undefined && args.appKind !== '') {
                        if (!APPS.includes(args.appKind))
                            throw badParam(`appKind 必须是 ${APPS.join(' | ')}。`);
                        body.app = args.appKind;
                    }
                    if (args.srvService)
                        body.srvService = args.srvService;
                    const res = await runtime.request('POST', `${network}/domains`, { signal: exec.signal, body });
                    return okValue({ domain: res.data?.domain ?? res.data });
                }
                case 'domain_check': {
                    const domainId = requireString(args, 'domainId', '域名 ID');
                    const res = await runtime.request('POST', `${network}/domains/${encodeURIComponent(domainId)}/check`, { signal: exec.signal });
                    return okValue({ domain: res.data?.domain ?? res.data });
                }
                case 'domain_update': {
                    const domainId = requireString(args, 'domainId', '域名 ID');
                    const body = {};
                    if (args.allocationId !== undefined && args.allocationId !== null)
                        body.allocationId = Number(args.allocationId);
                    if (args.kind !== undefined && args.kind !== '') {
                        if (!KINDS.includes(args.kind))
                            throw badParam(`kind 必须是 ${KINDS.join(' | ')}。`);
                        body.kind = args.kind;
                    }
                    if (args.appKind !== undefined && args.appKind !== '')
                        body.app = args.appKind;
                    if (Object.keys(body).length === 0)
                        throw badParam('domain_update 至少要传 kind、appKind 或 allocationId。');
                    const res = await runtime.request('PATCH', `${network}/domains/${encodeURIComponent(domainId)}`, { signal: exec.signal, body });
                    return okValue({ domain: res.data?.domain ?? res.data });
                }
                case 'domain_delete': {
                    const domainId = requireString(args, 'domainId', '域名 ID');
                    const res = await runtime.request('DELETE', `${network}/domains/${encodeURIComponent(domainId)}`, { signal: exec.signal });
                    return okValue({ domainId, result: res.data });
                }
                case 'ports_list': {
                    const res = await runtime.request('GET', `${network}/allocations`, { signal: exec.signal });
                    return okValue({ ports: res.data });
                }
                case 'port_create': {
                    const res = await runtime.request('POST', `${network}/allocations`, { signal: exec.signal });
                    return okValue({ ports: res.data });
                }
                case 'port_set_primary': {
                    const allocationId = requireString(args, 'allocationId', '端口 ID');
                    const res = await runtime.request('POST', `${network}/allocations/${encodeURIComponent(allocationId)}/primary`, { signal: exec.signal });
                    return okValue({ allocationId, ports: res.data });
                }
                case 'port_delete': {
                    const allocationId = requireString(args, 'allocationId', '端口 ID');
                    const res = await runtime.request('DELETE', `${network}/allocations/${encodeURIComponent(allocationId)}`, { signal: exec.signal });
                    return okValue({ allocationId, result: res.data });
                }
                default:
                    throw badParam(`未知 action "${action}"。`);
            }
        },
    });
}
