/**
 * `altare_jobs`：GitHub 部署型应用的 cron Job 与运行历史。
 * @module dsh-altare/tools/jobs
 */
import { badParam, okValue } from '../errors.js';
import { pick, requireString, tool } from './shared.js';

const SCOPE = {
    list: 'servers:view',
    create: 'servers:schedules',
    update: 'servers:schedules',
    run: 'servers:schedules',
    runs: 'servers:view',
    delete: 'servers:schedules',
};

export function jobsTool(runtime) {
    return tool({
        runtime,
        name: 'altare_jobs',
        description: '管理 GitHub 部署型应用的定时 Job：在应用容器内按 cron 执行命令，带运行历史与输出。'
            + '动作：list 列出 Job、正在运行的与上次结果；create 新建（name 创建后不可改）；'
            + 'update 改 schedule / command / timeoutSeconds / allowOverlap / enabled；run 立即跑一次；'
            + 'runs 看最近运行；delete 删除。Job 输出用 altare_logs(action="job_output") 读。'
            + '需要应用先重启到支持 Job 的 runner（needsRestart=true 时）。',
        parameters: {
            action: { type: 'string', required: true, description: 'list | create | update | run | runs | delete' },
            app: { type: 'string', required: true, description: '应用名或 serverId。' },
            jobId: { type: 'string', description: 'update / run / runs / delete：Job ID。' },
            name: { type: 'string', description: 'create：名称，小写字母数字与短横线、字母开头、最多 30 字符，创建后不可改。' },
            schedule: { type: 'string', description: 'create / update：五段 cron 或 @daily / @hourly。' },
            command: { type: 'string', description: 'create / update：单行命令，多步用 && 串联。' },
            timeoutSeconds: { type: 'number', description: 'create / update：超时 10 秒到 6 小时，默认 3600。' },
            allowOverlap: { type: 'boolean', description: 'create / update：允许上一次未结束时启动下一次。' },
            enabled: { type: 'boolean', description: 'update：启用或暂停。' },
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
            const jobs = `${base}/jobs`;

            switch (action) {
                case 'list': {
                    const res = await runtime.request('GET', jobs, { signal: exec.signal });
                    return okValue({ jobs: res.data });
                }
                case 'create': {
                    const body = {
                        name: requireString(args, 'name', 'Job 名称'),
                        schedule: requireString(args, 'schedule', 'cron 表达式'),
                        command: requireString(args, 'command', '命令'),
                    };
                    if (args.timeoutSeconds !== undefined && args.timeoutSeconds !== null)
                        body.timeoutSeconds = Number(args.timeoutSeconds);
                    if (args.allowOverlap === true)
                        body.allowOverlap = true;
                    const res = await runtime.request('POST', jobs, { signal: exec.signal, body });
                    return okValue({ job: res.data?.job ?? res.data });
                }
                case 'update': {
                    const jobId = requireString(args, 'jobId', 'Job ID');
                    const body = pick(args, ['schedule', 'command', 'timeoutSeconds']);
                    if (args.allowOverlap !== undefined)
                        body.allowOverlap = args.allowOverlap === true;
                    if (args.enabled !== undefined)
                        body.enabled = args.enabled === true;
                    if (Object.keys(body).length === 0)
                        throw badParam('update 至少要传一个要修改的字段。');
                    const res = await runtime.request('PATCH', `${jobs}/${encodeURIComponent(jobId)}`, { signal: exec.signal, body });
                    return okValue({ jobId, job: res.data?.job ?? res.data });
                }
                case 'run': {
                    const jobId = requireString(args, 'jobId', 'Job ID');
                    const res = await runtime.request('POST', `${jobs}/${encodeURIComponent(jobId)}/run`, { signal: exec.signal });
                    return okValue({ jobId, result: res.data });
                }
                case 'runs': {
                    const jobId = requireString(args, 'jobId', 'Job ID');
                    const res = await runtime.request('GET', `${jobs}/${encodeURIComponent(jobId)}/runs`, { signal: exec.signal });
                    return okValue({ runs: res.data?.runs ?? [] });
                }
                case 'delete': {
                    const jobId = requireString(args, 'jobId', 'Job ID');
                    const res = await runtime.request('DELETE', `${jobs}/${encodeURIComponent(jobId)}`, { signal: exec.signal });
                    return okValue({ jobId, result: res.data });
                }
                default:
                    throw badParam(`未知 action "${action}"。`);
            }
        },
    });
}
