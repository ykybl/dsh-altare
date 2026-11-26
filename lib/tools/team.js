/**
 * `altare_team`：团队成员、审计日志与通知渠道。
 * @module dsh-altare/tools/team
 */
import { badParam, okValue } from '../errors.js';
import { listArg, parseJsonArg, requireString, tool } from './shared.js';

const SCOPE = {
    members: 'team:members:view',
    audit: 'team:logs:view',
    notifications_list: 'team:settings:view',
    notification_create: 'team:settings:manage',
    notification_update: 'team:settings:manage',
    notification_test: 'team:settings:manage',
    notification_delete: 'team:settings:manage',
    notification_secret: 'team:settings:manage',
};

const KINDS = ['discord', 'slack', 'webhook', 'function'];

export function teamTool(runtime) {
    return tool({
        runtime,
        name: 'altare_team',
        description: '读团队信息并管理通知渠道。动作：members 列成员与角色；audit 翻审计日志（可按 actor 与 view=access 过滤）；'
            + 'notifications_list 列通知渠道（URL 不回显）；notification_create 新建 Discord/Slack/Webhook/Function 渠道；'
            + 'notification_update 改名称、URL 或事件；notification_test 发测试消息；notification_delete 删除；'
            + 'notification_secret 重签 webhook 密钥（只返回一次）。成员/角色/邀请只能在控制台管理。',
        parameters: {
            action: { type: 'string', required: true, description: 'members | audit | notifications_list | notification_create | notification_update | notification_test | notification_delete | notification_secret' },
            page: { type: 'number', description: 'audit：页码，从 1 开始。' },
            pageSize: { type: 'number', description: 'audit：每页条数，最多 100，默认 20。' },
            actor: { type: 'string', description: 'audit：只看某个用户 ID 的记录。' },
            view: { type: 'string', description: 'audit：access 表示安全与访问视图。' },
            notificationId: { type: 'string', description: 'notification_*：渠道 ID。' },
            name: { type: 'string', description: 'notification_create / notification_update：渠道名称。' },
            kind: { type: 'string', description: 'notification_create：discord | slack | webhook | function。' },
            url: { type: 'string', description: 'notification_create / notification_update：Webhook 或自建端点 URL。' },
            functionId: { type: 'string', description: 'notification_create：kind=function 时使用团队 Edge Function ID。' },
            events: { type: 'string', description: 'notification_create / notification_update：事件列表，逗号分隔，如 deploy.failed,app.down。' },
        },
        async run(args, exec) {
            const action = String(args.action ?? '').trim();
            const scope = SCOPE[action];
            if (scope === undefined)
                throw badParam(`未知 action "${action}"。`, `可用：${Object.keys(SCOPE).join(' | ')}。`);
            const gate = await runtime.requireScope(scope, { signal: exec.signal });
            if (gate)
                return gate;

            const tenant = await runtime.tenantBase({ signal: exec.signal });

            switch (action) {
                case 'members': {
                    const res = await runtime.request('GET', `${tenant}/members`, { signal: exec.signal });
                    return okValue({ items: res.data?.items ?? [] });
                }
                case 'audit': {
                    const query = {};
                    if (args.page !== undefined && args.page !== null)
                        query.page = Math.max(Math.trunc(Number(args.page)) || 1, 1);
                    if (args.pageSize !== undefined && args.pageSize !== null)
                        query.pageSize = Math.min(Math.max(Math.trunc(Number(args.pageSize)) || 20, 1), 100);
                    if (args.actor)
                        query.actor = args.actor;
                    if (args.view)
                        query.view = args.view;
                    const res = await runtime.request('GET', `${tenant}/audit`, { signal: exec.signal, query });
                    return okValue({ items: res.data?.items ?? [], meta: res.data?.meta, view: res.data?.view });
                }
                case 'notifications_list': {
                    const res = await runtime.request('GET', `${tenant}/notifications`, { signal: exec.signal });
                    return okValue({ items: res.data?.items ?? res.data });
                }
                case 'notification_create': {
                    const kind = String(args.kind ?? '').trim();
                    if (!KINDS.includes(kind))
                        throw badParam(`kind 必须是 ${KINDS.join(' | ')}。`);
                    const body = {
                        name: requireString(args, 'name', '渠道名称'),
                        kind,
                    };
                    if (kind === 'function') {
                        body.functionId = requireString(args, 'functionId', 'Edge Function ID');
                    }
                    else {
                        body.url = requireString(args, 'url', 'Webhook URL');
                    }
                    const events = listArg(args.events, 'events');
                    if (!events || events.length === 0)
                        throw badParam('notification_create 需要传 events。');
                    body.events = events;
                    const res = await runtime.request('POST', `${tenant}/notifications`, { signal: exec.signal, body });
                    return okValue({ notification: res.data?.notification ?? res.data, secret: res.data?.secret });
                }
                case 'notification_update': {
                    const notificationId = requireString(args, 'notificationId', '渠道 ID');
                    const body = {};
                    if (args.name !== undefined && args.name !== '')
                        body.name = args.name;
                    if (args.url !== undefined && args.url !== '')
                        body.url = args.url;
                    const events = listArg(args.events, 'events');
                    if (events && events.length > 0)
                        body.events = events;
                    if (Object.keys(body).length === 0)
                        throw badParam('notification_update 至少要传 name、url 或 events 之一。');
                    const res = await runtime.request('PATCH', `${tenant}/notifications/${encodeURIComponent(notificationId)}`, { signal: exec.signal, body });
                    return okValue({ notificationId, notification: res.data?.notification ?? res.data });
                }
                case 'notification_test': {
                    const notificationId = requireString(args, 'notificationId', '渠道 ID');
                    const res = await runtime.request('POST', `${tenant}/notifications/${encodeURIComponent(notificationId)}/test`, { signal: exec.signal });
                    return okValue({ notificationId, result: res.data });
                }
                case 'notification_delete': {
                    const notificationId = requireString(args, 'notificationId', '渠道 ID');
                    const res = await runtime.request('DELETE', `${tenant}/notifications/${encodeURIComponent(notificationId)}`, { signal: exec.signal });
                    return okValue({ notificationId, result: res.data });
                }
                case 'notification_secret': {
                    const notificationId = requireString(args, 'notificationId', '渠道 ID');
                    const res = await runtime.request('POST', `${tenant}/notifications/${encodeURIComponent(notificationId)}/secret`, { signal: exec.signal });
                    return okValue({ notificationId, secret: res.data?.secret ?? res.data, note: '新密钥只返回这一次，旧密钥立即失效。' });
                }
                default:
                    throw badParam(`未知 action "${action}"。`);
            }
        },
    });
}
