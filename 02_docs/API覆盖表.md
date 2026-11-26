# API 覆盖表

官方文档：`https://docs.altare.gg/altare-api`。所有路径相对于 `https://console.altare.gg/api`。
`{t}` = `tenantId`（`/api-tokens/self` 的 `team.id`），`{s}` = `serverId`。

状态说明：✅ 已封装为工具动作；↩️ 由 `altare_api` 兜底（未单独封装）；⛔ 官方禁止 token 调用。

## 令牌与团队

| 方法 | 路径 | Scope | 对应动作 |
|---|---|---|---|
| GET | `/api-tokens/self` | 任意有效令牌 | `altare_whoami` / `token` |
| GET | `/tenants/{t}/access` | 任意有效令牌 | `altare_whoami` / `access` |
| GET | `/tenants/{t}/members` | `team:members:view` | `altare_team` / `members` |
| GET | `/tenants/{t}/audit` | `team:logs:view` | `altare_team` / `audit` |
| GET | `/tenants/{t}/env` | `team:settings:view` | `altare_variables` / `team_list` |
| PUT | `/tenants/{t}/env` | `team:settings:manage` | `altare_variables` / `team_set` |
| DELETE | `/tenants/{t}/env/{envId}` | `team:settings:manage` | `altare_variables` / `team_delete` |
| GET | `/tenants/{t}/notifications` | `team:settings:view` | `altare_team` / `notifications_list` |
| POST | `/tenants/{t}/notifications` | `team:settings:manage` | `altare_team` / `notification_create` |
| PATCH | `/tenants/{t}/notifications/{id}` | `team:settings:manage` | `altare_team` / `notification_update` |
| POST | `/tenants/{t}/notifications/{id}/test` | `team:settings:manage` | `altare_team` / `notification_test` |
| POST | `/tenants/{t}/notifications/{id}/secret` | `team:settings:manage` | `altare_team` / `notification_secret` |
| DELETE | `/tenants/{t}/notifications/{id}` | `team:settings:manage` | `altare_team` / `notification_delete` |

## 应用

| 方法 | 路径 | Scope | 对应动作 |
|---|---|---|---|
| GET | `/tenants/{t}/servers` | `servers:view` | `altare_apps` / `list` |
| GET | `/tenants/{t}/servers/{s}/details` | `servers:view` | `altare_apps` / `details` |
| POST | `/tenants/{t}/servers/{s}/power` | `servers:power` | `altare_apps` / `power` |
| PATCH | `/tenants/{t}/servers/{s}/settings` | `servers:settings` | `altare_apps` / `rename` |
| POST | `/tenants/{t}/servers/{s}/settings/reinstall` | `servers:settings` | `altare_apps` / `reinstall` |
| GET | `/tenants/{t}/servers/{s}/startup` | `servers:startup` | `altare_apps` / `startup_get` |
| PATCH | `/tenants/{t}/servers/{s}/startup` | `servers:startup` | `altare_apps` / `startup_set` |
| GET | `/tenants/{t}/servers/{s}/activity` | `servers:activity` | `altare_apps` / `activity` |

## 部署（GitHub 部署型）

| 方法 | 路径 | Scope | 对应动作 |
|---|---|---|---|
| POST | `/tenants/{t}/servers/{s}/git/deploy` | `servers:power` | `altare_deploys` / `deploy` |
| GET | `/tenants/{t}/servers/{s}/git/deployments/{id}` | `servers:view` | `altare_deploys` / `status`、`wait` |
| GET | `/tenants/{t}/servers/{s}/git` | `servers:view` | `altare_deploys` / `settings`、`altare_variables` / `app_get` |
| PATCH | `/tenants/{t}/servers/{s}/git` | `servers:settings` | `altare_deploys` / `build_settings`、`altare_variables` / `app_set` |
| POST | `/tenants/{t}/servers/{s}/git/previews` | `servers:power` | `altare_deploys` / `preview_create` |
| POST | `/tenants/{t}/servers/{s}/git/previews/{id}/deploy` | `servers:power` | `altare_deploys` / `preview_deploy` |
| DELETE | `/tenants/{t}/servers/{s}/git/previews/{id}` | `servers:power` | `altare_deploys` / `preview_delete` |

## 日志

| 方法 | 路径 | Scope | 对应动作 |
|---|---|---|---|
| GET | `/tenants/{t}/servers/{s}/logs` | `servers:console` | `altare_logs` / `read` |
| GET | `/tenants/{t}/servers/{s}/logs/info` | `servers:console` | `altare_logs` / `info` |
| GET | `/tenants/{t}/servers/{s}/jobs/{jobId}/runs/{runId}/output` | `servers:console` | `altare_logs` / `job_output` |

## 文件

| 方法 | 路径 | Scope | 对应动作 |
|---|---|---|---|
| GET | `/tenants/{t}/servers/{s}/files` | `servers:files` | `altare_files` / `list` |
| GET | `/tenants/{t}/servers/{s}/files/contents` | `servers:files` | `altare_files` / `read` |
| POST | `/tenants/{t}/servers/{s}/files/write` | `servers:files` | `altare_files` / `write` |
| POST | `/tenants/{t}/servers/{s}/files/directories` | `servers:files` | `altare_files` / `mkdir` |
| POST | `/tenants/{t}/servers/{s}/files/rename` | `servers:files` | `altare_files` / `rename` |
| POST | `/tenants/{t}/servers/{s}/files/copy` | `servers:files` | `altare_files` / `copy` |
| POST | `/tenants/{t}/servers/{s}/files/delete` | `servers:files` | `altare_files` / `delete` |
| POST | `/tenants/{t}/servers/{s}/files/compress` | `servers:files` | `altare_files` / `compress` |
| POST | `/tenants/{t}/servers/{s}/files/decompress` | `servers:files` | `altare_files` / `decompress` |
| GET | `/tenants/{t}/servers/{s}/files/download` | `servers:files` | `altare_files` / `download_link` |
| POST | `/tenants/{t}/servers/{s}/files/archive` | `servers:files` | `altare_files` / `archive` |
| POST | `/tenants/{t}/servers/{s}/files/uploads/url` | `servers:files` | `altare_files` / `upload_url` |
| POST | `/tenants/{t}/servers/{s}/files/pull` | `servers:files` | `altare_files` / `pull` |

## 备份

| 方法 | 路径 | Scope | 对应动作 |
|---|---|---|---|
| GET | `/tenants/{t}/servers/{s}/backups` | `servers:backups` | `altare_backups` / `list` |
| POST | `/tenants/{t}/servers/{s}/backups` | `servers:backups` | `altare_backups` / `create` |
| POST | `/tenants/{t}/servers/{s}/backups/{id}/download` | `servers:backups` | `altare_backups` / `download_link` |
| DELETE | `/tenants/{t}/servers/{s}/backups/{id}` | `servers:backups` | `altare_backups` / `delete` |
| POST | `/tenants/{t}/servers/{s}/backups/delete` | `servers:backups` | `altare_backups` / `delete_many` |
| POST | `/tenants/{t}/servers/{s}/backups/{id}/restore` | — | ⛔ 只能在控制台恢复；API 侧用快照 `restore` |

## 快照

| 方法 | 路径 | Scope | 对应动作 |
|---|---|---|---|
| GET | `/tenants/{t}/servers/{s}/snapshots` | `servers:snapshots` | `altare_snapshots` / `list` |
| POST | `/tenants/{t}/servers/{s}/snapshots` | `servers:snapshots` | `altare_snapshots` / `create` |
| POST | `/tenants/{t}/servers/{s}/snapshots/{id}/restore` | `servers:snapshots` | `altare_snapshots` / `restore` |
| POST | `/tenants/{t}/servers/{s}/snapshots/{id}/download` | `servers:snapshots` | `altare_snapshots` / `download_link` |
| DELETE | `/tenants/{t}/servers/{s}/snapshots/{id}` | `servers:snapshots` | `altare_snapshots` / `delete` |
| GET | `/tenants/{t}/snapshots` | `servers:snapshots` | `altare_snapshots` / `team_list` |

## 域名与端口

| 方法 | 路径 | Scope | 对应动作 |
|---|---|---|---|
| GET | `/tenants/{t}/servers/{s}/network/domains` | `servers:network` | `altare_network` / `domains_list` |
| GET | `/tenants/{t}/servers/{s}/network/domains/available` | `servers:network` | `altare_network` / `domain_available` |
| POST | `/tenants/{t}/servers/{s}/network/domains` | `servers:network` | `altare_network` / `domain_create` |
| POST | `/tenants/{t}/servers/{s}/network/domains/{id}/check` | `servers:network` | `altare_network` / `domain_check` |
| PATCH | `/tenants/{t}/servers/{s}/network/domains/{id}` | `servers:network` | `altare_network` / `domain_update` |
| DELETE | `/tenants/{t}/servers/{s}/network/domains/{id}` | `servers:network` | `altare_network` / `domain_delete` |
| GET | `/tenants/{t}/servers/{s}/network/allocations` | `servers:network` | `altare_network` / `ports_list` |
| POST | `/tenants/{t}/servers/{s}/network/allocations` | `servers:network` | `altare_network` / `port_create` |
| POST | `/tenants/{t}/servers/{s}/network/allocations/{id}/primary` | `servers:network` | `altare_network` / `port_set_primary` |
| DELETE | `/tenants/{t}/servers/{s}/network/allocations/{id}` | `servers:network` | `altare_network` / `port_delete` |

## Job（GitHub 部署型）

| 方法 | 路径 | Scope | 对应动作 |
|---|---|---|---|
| GET | `/tenants/{t}/servers/{s}/jobs` | `servers:view` | `altare_jobs` / `list` |
| POST | `/tenants/{t}/servers/{s}/jobs` | `servers:schedules` | `altare_jobs` / `create` |
| PATCH | `/tenants/{t}/servers/{s}/jobs/{id}` | `servers:schedules` | `altare_jobs` / `update` |
| POST | `/tenants/{t}/servers/{s}/jobs/{id}/run` | `servers:schedules` | `altare_jobs` / `run` |
| GET | `/tenants/{t}/servers/{s}/jobs/{id}/runs` | `servers:view` | `altare_jobs` / `runs` |
| DELETE | `/tenants/{t}/servers/{s}/jobs/{id}` | `servers:schedules` | `altare_jobs` / `delete` |

## Schedule（模板型）

| 方法 | 路径 | Scope | 对应动作 |
|---|---|---|---|
| GET | `/tenants/{t}/servers/{s}/schedules` | `servers:schedules` | `altare_schedules` / `list` |
| POST | `/tenants/{t}/servers/{s}/schedules` | `servers:schedules` | `altare_schedules` / `create` |
| PATCH | `/tenants/{t}/servers/{s}/schedules/{id}` | `servers:schedules` | `altare_schedules` / `update` |
| POST | `/tenants/{t}/servers/{s}/schedules/{id}/run` | `servers:schedules` | `altare_schedules` / `run` |
| DELETE | `/tenants/{t}/servers/{s}/schedules/{id}` | `servers:schedules` | `altare_schedules` / `delete` |
| POST | `/tenants/{t}/servers/{s}/schedules/{id}/tasks` | `servers:schedules` | `altare_schedules` / `task_add` |
| POST | `/tenants/{t}/servers/{s}/schedules/{id}/tasks/{taskId}` | `servers:schedules` | `altare_schedules` / `task_update` |
| DELETE | `/tenants/{t}/servers/{s}/schedules/{id}/tasks/{taskId}` | `servers:schedules` | `altare_schedules` / `task_delete` |

## 官方禁止 token 调用（返回 403 `TOKEN_ROUTE_NOT_ALLOWED`）

| 能力 | 说明 |
|---|---|
| 成员 / 角色 / 邀请管理 | 只能由人在控制台操作 |
| 创建 / 删除 / 移动应用 | 同上 |
| 花钱与转移 bolts | 账单、钱包、商店、加资源/端口/快照存储 |
| 创建 / 查看 / 吊销 API 令牌 | 同上 |
| 双人审批、passkey 确认 | 同上 |
| 设置 SSH 密码、添加 SSH 密钥 | 同上 |
| 实时控制台、直接发控制台命令 | 替代：Job / Schedule |

> 未列出的新增端点一律可用 `altare_api` 直接调用；鉴权、重试与错误翻译与其它工具一致。
