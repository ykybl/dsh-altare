/**
 * `altare_schedules`：模板型服务器/沙箱的定时任务与任务步骤。
 * @module dsh-altare/tools/schedules
 */
import { badParam, okValue } from '../errors.js';
import { pick, requireString, tool } from './shared.js';

const SCOPE = {
    list: 'servers:schedules',
    create: 'servers:schedules',
    update: 'servers:schedules',
    run: 'servers:schedules',
    delete: 'servers:schedules',
    task_add: 'servers:schedules',
    task_update: 'servers:schedules',
    task_delete: 'servers:schedules',
};

const TASK_ACTIONS = ['command', 'power', 'backup'];
const POWER_PAYLOADS = ['start', 'stop', 'restart', 'kill'];

export function schedulesTool(runtime) {
    return tool({
        runtime,
        name: 'altare_schedules',
        description: '管理模板型服务器/沙箱的定时任务（cron + 任务列表）。动作：list 列出计划与任务；'
            + 'create 新建计划（五段 cron 字段分开传）；update 整体更新计划字段；run 立即执行任务列表；'
            + 'delete 删除计划；task_add 加任务（action=command/power/backup，按加入顺序执行）；'
            + 'task_update / task_delete 改或删任务。token 不能开实时控制台，但可以用「永不匹配的 cron + 单条 command 任务 + run」即时发控制台命令。',
        parameters: {
            action: { type: 'string', required: true, description: 'list | create | update | run | delete | task_add | task_update | task_delete' },
            app: { type: 'string', required: true, description: '应用名或 serverId。' },
            scheduleId: { type: 'string', description: 'update / run / delete / task_*：计划 ID。' },
            taskId: { type: 'string', description: 'task_update / task_delete：任务 ID。' },
            name: { type: 'string', description: 'create：计划名称。' },
            minute: { type: 'string', description: 'create / update：分，如 0 / */15。' },
            hour: { type: 'string', description: 'create / update：时，如 4。' },
            day_of_month: { type: 'string', description: 'create / update：日，如 *。' },
            month: { type: 'string', description: 'create / update：月，如 *。' },
            day_of_week: { type: 'string', description: 'create / update：星期，如 *。' },
            is_active: { type: 'boolean', description: 'create / update：false 创建为暂停状态。' },
            taskAction: { type: 'string', description: 'task_add / task_update：command | power | backup。' },
            payload: { type: 'string', description: 'task_*：command 的控制台命令，或 power 的 start/stop/restart/kill。' },
            time_offset: { type: 'number', description: 'task_*：相对上一个任务等待的秒数，默认 0。' },
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
            const schedules = `${base}/schedules`;

            switch (action) {
                case 'list': {
                    const res = await runtime.request('GET', schedules, { signal: exec.signal });
                    return okValue({ schedules: res.data?.items ?? res.data });
                }
                case 'create': {
                    const body = {
                        name: requireString(args, 'name', '计划名称'),
                        minute: requireString(args, 'minute', 'minute'),
                        hour: requireString(args, 'hour', 'hour'),
                        day_of_month: requireString(args, 'day_of_month', 'day_of_month'),
                        month: requireString(args, 'month', 'month'),
                        day_of_week: requireString(args, 'day_of_week', 'day_of_week'),
                    };
                    if (args.is_active === false)
                        body.is_active = false;
                    const res = await runtime.request('POST', schedules, { signal: exec.signal, body });
                    return okValue({ schedule: res.data?.schedule ?? res.data });
                }
                case 'update': {
                    const scheduleId = requireString(args, 'scheduleId', '计划 ID');
                    const body = {
                        ...pick(args, ['minute', 'hour', 'day_of_month', 'month', 'day_of_week']),
                        ...(args.name !== undefined ? { name: args.name } : {}),
                    };
                    if (args.is_active !== undefined)
                        body.is_active = args.is_active === true;
                    if (Object.keys(body).length === 0)
                        throw badParam('update 需要传完整的 cron 字段（文档要求整体提交）。');
                    const res = await runtime.request('PATCH', `${schedules}/${encodeURIComponent(scheduleId)}`, { signal: exec.signal, body });
                    return okValue({ scheduleId, schedule: res.data?.schedule ?? res.data });
                }
                case 'run': {
                    const scheduleId = requireString(args, 'scheduleId', '计划 ID');
                    const res = await runtime.request('POST', `${schedules}/${encodeURIComponent(scheduleId)}/run`, { signal: exec.signal });
                    return okValue({ scheduleId, result: res.data });
                }
                case 'delete': {
                    const scheduleId = requireString(args, 'scheduleId', '计划 ID');
                    const res = await runtime.request('DELETE', `${schedules}/${encodeURIComponent(scheduleId)}`, { signal: exec.signal });
                    return okValue({ scheduleId, result: res.data });
                }
                case 'task_add': {
                    const scheduleId = requireString(args, 'scheduleId', '计划 ID');
                    const taskAction = String(args.taskAction ?? '').trim();
                    if (!TASK_ACTIONS.includes(taskAction))
                        throw badParam(`taskAction 必须是 ${TASK_ACTIONS.join(' | ')}。`);
                    const payload = requireString(args, 'payload', 'payload');
                    if (taskAction === 'power' && !POWER_PAYLOADS.includes(payload))
                        throw badParam(`power 任务的 payload 必须是 ${POWER_PAYLOADS.join(' | ')}。`);
                    const body = { action: taskAction, payload };
                    if (args.time_offset !== undefined && args.time_offset !== null)
                        body.time_offset = Number(args.time_offset);
                    const res = await runtime.request('POST', `${schedules}/${encodeURIComponent(scheduleId)}/tasks`, { signal: exec.signal, body });
                    return okValue({ scheduleId, task: res.data?.task ?? res.data });
                }
                case 'task_update': {
                    const scheduleId = requireString(args, 'scheduleId', '计划 ID');
                    const taskId = requireString(args, 'taskId', '任务 ID');
                    const body = {};
                    if (args.taskAction !== undefined) {
                        if (!TASK_ACTIONS.includes(args.taskAction))
                            throw badParam(`taskAction 必须是 ${TASK_ACTIONS.join(' | ')}。`);
                        body.action = args.taskAction;
                    }
                    if (args.payload !== undefined)
                        body.payload = args.payload;
                    if (args.time_offset !== undefined && args.time_offset !== null)
                        body.time_offset = Number(args.time_offset);
                    if (Object.keys(body).length === 0)
                        throw badParam('task_update 至少要传 taskAction / payload / time_offset 之一。');
                    const res = await runtime.request('POST', `${schedules}/${encodeURIComponent(scheduleId)}/tasks/${encodeURIComponent(taskId)}`, { signal: exec.signal, body });
                    return okValue({ scheduleId, taskId, task: res.data?.task ?? res.data });
                }
                case 'task_delete': {
                    const scheduleId = requireString(args, 'scheduleId', '计划 ID');
                    const taskId = requireString(args, 'taskId', '任务 ID');
                    const res = await runtime.request('DELETE', `${schedules}/${encodeURIComponent(scheduleId)}/tasks/${encodeURIComponent(taskId)}`, { signal: exec.signal });
                    return okValue({ scheduleId, taskId, result: res.data });
                }
                default:
                    throw badParam(`未知 action "${action}"。`);
            }
        },
    });
}
