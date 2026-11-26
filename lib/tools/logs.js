/**
 * `altare_logs`：保留日志、日志配额与 Job 输出。
 * @module dsh-altare/tools/logs
 */
import { badParam, okValue } from '../errors.js';
import { pick, requireString, tool } from './shared.js';

const SCOPE = {
    read: 'servers:console',
    info: 'servers:console',
    job_output: 'servers:console',
};

export function logsTool(runtime) {
    return tool({
        runtime,
        name: 'altare_logs',
        description: '读取应用保留的日志。动作：read 按时间/关键词/流/进程过滤并游标翻页（每页最多 1000 行，'
            + '返回 lines 与 next，把 next 作为 before 取更早日志）；info 看日志保留时长与占用；'
            + 'job_output 看某次 Job 运行的输出尾部。模板型服务器不保留日志，请改用 altare_files 读日志文件。',
        parameters: {
            action: { type: 'string', required: true, description: 'read | info | job_output' },
            app: { type: 'string', required: true, description: '应用名或 serverId。' },
            since: { type: 'string', description: 'read：最早时间，ISO 8601。' },
            until: { type: 'string', description: 'read：最晚时间，ISO 8601。' },
            q: { type: 'string', description: 'read：只返回包含该文本的行。' },
            stream: { type: 'string', description: 'read：stdout | stderr | all（默认）。' },
            process: { type: 'string', description: 'read：进程名，如 web、job:<name>、altare。' },
            limit: { type: 'number', description: 'read：每页行数 1–1000，默认 200。' },
            before: { type: 'string', description: 'read：上一页返回的 next 游标，取更早日志。' },
            jobId: { type: 'string', description: 'job_output：Job ID。' },
            runId: { type: 'string', description: 'job_output：运行 ID。' },
        },
        concurrencySafe: true,
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

            if (action === 'read') {
                const query = pick(args, ['since', 'until', 'q', 'stream', 'process', 'before']);
                if (args.limit !== undefined && args.limit !== null)
                    query.limit = Math.min(Math.max(Math.trunc(Number(args.limit)) || 200, 1), 1000);
                const res = await runtime.request('GET', `${base}/logs`, { signal: exec.signal, query });
                const lines = Array.isArray(res.data?.lines) ? res.data.lines : [];
                return okValue({
                    count: lines.length,
                    next: res.data?.next ?? null,
                    lines,
                });
            }
            if (action === 'info') {
                const res = await runtime.request('GET', `${base}/logs/info`, { signal: exec.signal });
                return okValue({ info: res.data });
            }
            const jobId = requireString(args, 'jobId', 'Job ID');
            const runId = requireString(args, 'runId', '运行 ID');
            const res = await runtime.request(
                'GET',
                `${base}/jobs/${encodeURIComponent(jobId)}/runs/${encodeURIComponent(runId)}/output`,
                { signal: exec.signal },
            );
            return okValue({ output: res.data?.output ?? res.data });
        },
    });
}
