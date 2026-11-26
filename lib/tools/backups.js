/**
 * `altare_backups`：按应用备份（每个应用最多 3 个）。
 * @module dsh-altare/tools/backups
 */
import { badParam, okValue } from '../errors.js';
import { listArg, requireString, tool } from './shared.js';

const SCOPE = {
    list: 'servers:backups',
    create: 'servers:backups',
    download_link: 'servers:backups',
    delete: 'servers:backups',
    delete_many: 'servers:backups',
};

export function backupsTool(runtime) {
    return tool({
        runtime,
        name: 'altare_backups',
        description: '管理应用备份（每个应用最多保留 3 个已完成备份）。动作：list 列出；'
            + 'create 创建（可命名，返回 202）；download_link 取临时下载链接；delete 删一个；'
            + 'delete_many 批量删除（最多 50 个，锁定的会被跳过）。恢复备份只能在控制台做，API 侧请用快照恢复。',
        parameters: {
            action: { type: 'string', required: true, description: 'list | create | download_link | delete | delete_many' },
            app: { type: 'string', required: true, description: '应用名或 serverId。' },
            name: { type: 'string', description: 'create：备份名称。' },
            backupId: { type: 'string', description: 'download_link / delete：备份 ID。' },
            ids: { type: 'string', description: 'delete_many：备份 ID 列表，逗号或换行分隔。' },
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
            const backups = `${base}/backups`;

            switch (action) {
                case 'list': {
                    const res = await runtime.request('GET', backups, { signal: exec.signal });
                    return okValue({ items: res.data?.items ?? [] });
                }
                case 'create': {
                    const res = await runtime.request('POST', backups, {
                        signal: exec.signal,
                        body: args.name ? { name: args.name } : {},
                    });
                    return okValue({ app: await runtime.resolveApp(app, { signal: exec.signal }), backup: res.data?.backup ?? res.data });
                }
                case 'download_link': {
                    const backupId = requireString(args, 'backupId', '备份 ID');
                    const res = await runtime.request('POST', `${backups}/${encodeURIComponent(backupId)}/download`, { signal: exec.signal });
                    return okValue({ backupId, url: res.data?.url, note: '链接短期有效且不需要令牌。' });
                }
                case 'delete': {
                    const backupId = requireString(args, 'backupId', '备份 ID');
                    const res = await runtime.request('DELETE', `${backups}/${encodeURIComponent(backupId)}`, { signal: exec.signal });
                    return okValue({ backupId, result: res.data });
                }
                case 'delete_many': {
                    const ids = listArg(args.ids, 'ids');
                    if (!ids || ids.length === 0)
                        throw badParam('delete_many 需要传 ids。');
                    const res = await runtime.request('POST', `${backups}/delete`, { signal: exec.signal, body: { ids } });
                    return okValue({ result: res.data });
                }
                default:
                    throw badParam(`未知 action "${action}"。`);
            }
        },
    });
}
