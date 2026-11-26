/**
 * 动作 → scope 的唯一登记表。
 *
 * 工具用 `ACTION_SCOPE['apps.power']` 做执行前鉴权，`altare_whoami` 用同一张表
 * 生成「当前令牌能做什么」的能力清单。scope 名与官方文档一一对应：
 * https://docs.altare.gg/altare-api/tokens
 * @module dsh-altare/scopes
 */

/** 官方 scope 的中文说明，用于 whoami 与错误指引。 */
export const SCOPE_LABELS = {
    'servers:view': '列出应用，查看详情、部署、预览、任务与进程',
    'servers:power': '启动/停止/重启/强杀应用，部署，创建/重部署/删除预览',
    'servers:console': '读取保留日志与 Job 输出',
    'servers:settings': '重命名应用，修改构建设置与应用变量',
    'servers:files': '列出/读写/移动/压缩/删除应用文件',
    'servers:backups': '列出/创建/下载/删除备份',
    'servers:snapshots': '列出/创建/下载/恢复/删除快照',
    'servers:network': '增删改域名与端口',
    'servers:schedules': '增删改并运行 Job 与 Schedule',
    'servers:startup': '查看与修改启动设置',
    'servers:activity': '查看应用活动记录',
    'team:settings:view': '查看团队变量与通知渠道',
    'team:settings:manage': '修改团队变量与通知渠道',
    'team:members:view': '列出团队成员',
    'team:roles:view': '查看团队角色',
    'team:logs:view': '读取团队审计日志',
};

/**
 * 每个工具动作需要的 scope；`null` 表示任何有效令牌都能调用。
 * 键格式为 `<工具名去掉 altare_ 前缀>.<action>`。
 */
export const ACTION_SCOPE = Object.freeze({
    'whoami.token': null,
    'whoami.access': null,

    'apps.list': 'servers:view',
    'apps.details': 'servers:view',
    'apps.power': 'servers:power',
    'apps.rename': 'servers:settings',
    'apps.reinstall': 'servers:settings',
    'apps.startup_get': 'servers:startup',
    'apps.startup_set': 'servers:startup',
    'apps.activity': 'servers:activity',

    'deploys.settings': 'servers:view',
    'deploys.deploy': 'servers:power',
    'deploys.status': 'servers:view',
    'deploys.wait': 'servers:view',
    'deploys.build_settings': 'servers:settings',
    'deploys.preview_create': 'servers:power',
    'deploys.preview_deploy': 'servers:power',
    'deploys.preview_delete': 'servers:power',

    'logs.read': 'servers:console',
    'logs.info': 'servers:console',
    'logs.job_output': 'servers:console',

    'files.list': 'servers:files',
    'files.read': 'servers:files',
    'files.write': 'servers:files',
    'files.mkdir': 'servers:files',
    'files.rename': 'servers:files',
    'files.copy': 'servers:files',
    'files.delete': 'servers:files',
    'files.compress': 'servers:files',
    'files.decompress': 'servers:files',
    'files.download_link': 'servers:files',
    'files.archive': 'servers:files',
    'files.upload_url': 'servers:files',
    'files.pull': 'servers:files',

    'variables.app_get': 'servers:view',
    'variables.app_set': 'servers:settings',
    'variables.team_list': 'team:settings:view',
    'variables.team_set': 'team:settings:manage',
    'variables.team_delete': 'team:settings:manage',

    'backups.list': 'servers:backups',
    'backups.create': 'servers:backups',
    'backups.download_link': 'servers:backups',
    'backups.delete': 'servers:backups',
    'backups.delete_many': 'servers:backups',

    'snapshots.list': 'servers:snapshots',
    'snapshots.create': 'servers:snapshots',
    'snapshots.restore': 'servers:snapshots',
    'snapshots.download_link': 'servers:snapshots',
    'snapshots.delete': 'servers:snapshots',
    'snapshots.team_list': 'servers:snapshots',

    'network.domains_list': 'servers:network',
    'network.domain_available': 'servers:network',
    'network.domain_create': 'servers:network',
    'network.domain_check': 'servers:network',
    'network.domain_update': 'servers:network',
    'network.domain_delete': 'servers:network',
    'network.ports_list': 'servers:network',
    'network.port_create': 'servers:network',
    'network.port_set_primary': 'servers:network',
    'network.port_delete': 'servers:network',

    'jobs.list': 'servers:view',
    'jobs.create': 'servers:schedules',
    'jobs.update': 'servers:schedules',
    'jobs.run': 'servers:schedules',
    'jobs.runs': 'servers:view',
    'jobs.delete': 'servers:schedules',

    'schedules.list': 'servers:schedules',
    'schedules.create': 'servers:schedules',
    'schedules.update': 'servers:schedules',
    'schedules.run': 'servers:schedules',
    'schedules.delete': 'servers:schedules',
    'schedules.task_add': 'servers:schedules',
    'schedules.task_update': 'servers:schedules',
    'schedules.task_delete': 'servers:schedules',

    'team.members': 'team:members:view',
    'team.audit': 'team:logs:view',
    'team.notifications_list': 'team:settings:view',
    'team.notification_create': 'team:settings:manage',
    'team.notification_update': 'team:settings:manage',
    'team.notification_test': 'team:settings:manage',
    'team.notification_delete': 'team:settings:manage',
    'team.notification_secret': 'team:settings:manage',

    'api.request': null,
});

/** 取某个动作的 scope；未登记的动作返回 `undefined`。 */
export function scopeOf(tool, action) {
    return ACTION_SCOPE[`${tool}.${action}`];
}

/** 按工具分组的能力清单，供 `altare_whoami` 输出。 */
export function capabilityReport(scopes) {
    const have = new Set(Array.isArray(scopes) ? scopes : []);
    const grouped = {};
    for (const [key, scope] of Object.entries(ACTION_SCOPE)) {
        const [tool, action] = key.split('.');
        if (!grouped[tool])
            grouped[tool] = [];
        grouped[tool].push({
            action,
            scope: scope ?? '(any token)',
            allowed: scope === null || have.has(scope),
        });
    }
    return grouped;
}
