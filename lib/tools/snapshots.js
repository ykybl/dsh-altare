/**
 * `altare_snapshots`：团队快照存储的快照创建、恢复与下载。
 * @module dsh-altare/tools/snapshots
 */
import { badParam, okValue } from '../errors.js';
import { requireString, tool } from './shared.js';

const SCOPE = {
    list: 'servers:snapshots',
    create: 'servers:snapshots',
    restore: 'servers:snapshots',
    download_link: 'servers:snapshots',
    delete: 'servers:snapshots',
    team_list: 'servers:snapshots',
};

export function snapshotsTool(runtime) {
    return tool({
        runtime,
        name: 'altare_snapshots',
        description: '管理应用快照。快照来自团队快照存储（可每日自动），是沙箱唯一可用的备份形式。'
            + '动作：list 列出快照与自动快照计划、团队用量；create 立即打快照（202）；'
            + 'restore 恢复（会覆盖文件并删除快照外的文件，需先停止应用）；download_link 取临时下载链接；'
            + 'delete 删除并释放空间；team_list 列出全团队快照（需要令牌可访问全部应用）。',
        parameters: {
            action: { type: 'string', required: true, description: 'list | create | restore | download_link | delete | team_list' },
            app: { type: 'string', description: '应用名或 serverId（team_list 之外必填）。' },
            snapshotId: { type: 'string', description: 'restore / download_link / delete：快照 ID。' },
        },
        async run(args, exec) {
            const action = String(args.action ?? '').trim();
            const scope = SCOPE[action];
            if (scope === undefined)
                throw badParam(`未知 action "${action}"。`, `可用：${Object.keys(SCOPE).join(' | ')}。`);
            const gate = await runtime.requireScope(scope, { signal: exec.signal });
            if (gate)
                return gate;

            if (action === 'team_list') {
                const tenant = await runtime.tenantBase({ signal: exec.signal });
                const res = await runtime.request('GET', `${tenant}/snapshots`, { signal: exec.signal });
                return okValue({ items: res.data?.items ?? res.data });
            }

            const app = requireString(args, 'app', '应用名或 serverId');
            const base = await runtime.serverBase(app, { signal: exec.signal });
            const snapshots = `${base}/snapshots`;

            switch (action) {
                case 'list': {
                    const res = await runtime.request('GET', snapshots, { signal: exec.signal });
                    return okValue({
                        configured: res.data?.configured,
                        enabled: res.data?.enabled,
                        hourUtc: res.data?.hourUtc,
                        limit: res.data?.limit,
                        used: res.data?.used,
                        items: res.data?.items ?? [],
                    });
                }
                case 'create': {
                    const res = await runtime.request('POST', snapshots, { signal: exec.signal });
                    return okValue({ app: await runtime.resolveApp(app, { signal: exec.signal }), snapshotId: res.data?.id ?? res.data?.snapshot?.id, result: res.data });
                }
                case 'restore': {
                    const snapshotId = requireString(args, 'snapshotId', '快照 ID');
                    const res = await runtime.request('POST', `${snapshots}/${encodeURIComponent(snapshotId)}/restore`, { signal: exec.signal });
                    return okValue({
                        snapshotId,
                        result: res.data,
                        note: '恢复会替换应用文件并删除快照里没有的文件；应用必须处于停止状态。',
                    });
                }
                case 'download_link': {
                    const snapshotId = requireString(args, 'snapshotId', '快照 ID');
                    const res = await runtime.request('POST', `${snapshots}/${encodeURIComponent(snapshotId)}/download`, { signal: exec.signal });
                    return okValue({ snapshotId, url: res.data?.url, note: '链接短期有效且不需要令牌。' });
                }
                case 'delete': {
                    const snapshotId = requireString(args, 'snapshotId', '快照 ID');
                    const res = await runtime.request('DELETE', `${snapshots}/${encodeURIComponent(snapshotId)}`, { signal: exec.signal });
                    return okValue({ snapshotId, result: res.data });
                }
                default:
                    throw badParam(`未知 action "${action}"。`);
            }
        },
    });
}
