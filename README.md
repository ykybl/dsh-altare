# dsh-altare

把 [Altare](https://console.altare.gg/) 云平台的官方 API 接进 DeepSeek Harness：AI 拿到一个团队 API Token（`alt_` 开头），就能操作这个令牌**权限范围内的全部能力**——应用与电源、GitHub 部署与预览、日志、文件系统、环境变量、备份与快照、域名与端口、Job 与 Schedule、团队成员与审计日志。

零运行时依赖，只调用官方 REST API（`https://console.altare.gg/api`）。

---

## 1. 工具一览

13 个工具，覆盖官方文档里 token 可用的全部端点。`altare_api` 是兜底，能调任意端点。

| 工具 | 动作 | 需要的 scope |
|---|---|---|
| `altare_whoami` | `token` 令牌自描述 + 能力清单；`access` 团队角色与逐应用权限 | 任意有效令牌 |
| `altare_apps` | `list` `details` `power` `rename` `reinstall` `startup_get` `startup_set` `activity` | `servers:view` / `servers:power` / `servers:settings` / `servers:startup` / `servers:activity` |
| `altare_deploys` | `settings` `deploy` `status` `wait` `build_settings` `preview_create` `preview_deploy` `preview_delete` | `servers:view` / `servers:power` / `servers:settings` |
| `altare_logs` | `read` `info` `job_output` | `servers:console` |
| `altare_files` | `list` `read` `write` `mkdir` `rename` `copy` `delete` `compress` `decompress` `download_link` `archive` `upload_url` `pull` | `servers:files` |
| `altare_variables` | `app_get` `app_set` `team_list` `team_set` `team_delete` | `servers:view` / `servers:settings` / `team:settings:view` / `team:settings:manage` |
| `altare_backups` | `list` `create` `download_link` `delete` `delete_many` | `servers:backups` |
| `altare_snapshots` | `list` `create` `restore` `download_link` `delete` `team_list` | `servers:snapshots` |
| `altare_network` | `domains_list` `domain_available` `domain_create` `domain_check` `domain_update` `domain_delete` `ports_list` `port_create` `port_set_primary` `port_delete` | `servers:network` |
| `altare_jobs` | `list` `create` `update` `run` `runs` `delete` | `servers:view` / `servers:schedules` |
| `altare_schedules` | `list` `create` `update` `run` `delete` `task_add` `task_update` `task_delete` | `servers:schedules` |
| `altare_team` | `members` `audit` `notifications_list` `notification_create` `notification_update` `notification_test` `notification_delete` `notification_secret` | `team:members:view` / `team:logs:view` / `team:settings:view` / `team:settings:manage` |
| `altare_api` | 任意端点（`method` + `path` + `query` + `body`） | 由目标端点决定 |

完整端点对照见 `02_docs/API覆盖表.md`。

---

## 2. 安装

### 方式 A：目录联接（推荐，改代码即时生效）

```powershell
# 以管理员或普通 PowerShell 运行；路径按实际位置调整
$src = "F:\Code\Temp\24_Altare云平台插件\01_src"
$dst = "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-altare"
if (Test-Path $dst) { Remove-Item $dst -Force }
New-Item -ItemType Junction -Path $dst -Target $src | Out-Null
```

### 方式 B：pnpm 本地依赖

```powershell
cd $env:USERPROFILE\.dsh\profiles\desktop
pnpm add "file:F:/Code/Temp/24_Altare云平台插件/01_src"
```

### 注册到 profile

在 `~/.dsh/profiles/desktop/cordis.patch.yml` 末尾追加一条（**注意顶层是数组**）：

```yaml
- insert:
    - id: altare
      name: 'dsh-altare'
      config:
        baseUrl: 'https://console.altare.gg/api'
        tokenSource: auto
        tokenRef: ALTARE_TOKEN
```

保存后 DSH 会热重载；没反应就重启一次宿主。

---

## 3. 令牌配置

先到控制台 **Team → Settings → API tokens** 创建令牌，按需勾选 scope（`Deploy from CI` 预设 = `servers:view` + `servers:power` + `servers:console`；要全功能就选 `Custom` 全勾）。令牌只显示一次。

插件按 `tokenSource` 找令牌，默认 `auto`，顺序是 **插件配置 → dsh 凭据库 → 环境变量**。

| 来源 | 怎么配 | 适合 |
|---|---|---|
| 环境变量 | `[Environment]::SetEnvironmentVariable("ALTARE_TOKEN","alt_xxx","User")`，重开 DSH | 最简单 |
| 凭据库 | 在 `~/.dsh/.credentials.yaml` 的 `refs:` 下加一行 `ALTARE_TOKEN: alt_xxx` | 推荐，不进任何配置文件 |
| 插件配置 | `cordis.patch.yml` 里加 `altareToken: alt_xxx` | 只用一次性令牌 |

> 令牌不会出现在工具返回值、日志或错误消息里；`altare_whoami` 只回显前缀。

---

## 4. 快速开始

```
你：看下我 Altare 上有哪些应用
AI：altare_whoami → altare_apps(action="list")

你：my-bot 最近 200 行日志
AI：altare_logs(action="read", app="my-bot", limit=200)

你：把 main 重新部署一下，等它跑完
AI：altare_deploys(action="deploy", app="my-bot", ref="main")
    altare_deploys(action="wait", app="my-bot")

你：给 web 加个 https 域名叫 demo
AI：altare_network(action="ports_list", app="web")
    altare_network(action="domain_create", app="web", label="demo",
                   kind="https", appKind="web", allocationId=812)

你：每晚 2 点跑一次 npm run report
AI：altare_jobs(action="create", app="my-bot", name="nightly-report",
                schedule="0 2 * * *", command="npm run report")
```

`app` 参数可以直接写应用名，支持唯一子串匹配；重名时插件会把候选 `名称(ID)` 回给你。

---

## 5. 工作方式

- **scope 门禁**：每个动作执行前读一次 `/api-tokens/self`（缓存 60 秒，可用 `cacheTtlMs` 调），缺 scope 直接返回 `scope-missing`，附上当前 scopes 和「去哪里勾选」的指引，不浪费一次 403。
- **错误翻译**：401/403/404/409/429 与 `TOKEN_*` 错误码都映射成结构化结果，`guidance` 字段写清下一步。
- **限速**：429 按 `Retry-After` 退避重试（默认最多 2 次），GET 的 5xx 也重试。
- **输出截断**：单次结果超过 `maxOutputChars`（默认 20000）会截断并提示缩小范围，避免把上下文撑爆。
- **长轮询**：`altare_deploys` 的 `wait` 默认最多等 300 秒，每 3 秒查一次。

---

## 6. 边界（官方限制，非插件限制）

令牌永远做不到，会在控制台报 `403 TOKEN_ROUTE_NOT_ALLOWED`：

- 管理成员、角色、邀请
- 创建/删除/移动应用
- 花钱或转移 bolts（账单、钱包、商店、加资源/端口/快照存储）
- 创建/查看/吊销 API 令牌
- 双人审批、passkey 确认
- 设置 SSH 密码或添加 SSH 密钥
- 打开实时控制台或直接发控制台命令

要在应用里跑命令，用 `altare_jobs`（GitHub 部署型）或 `altare_schedules`（模板型，可用「永不匹配的 cron + 单条 command 任务 + run」即时执行）。

---

## 7. 故障排查

| 现象 | 原因与处理 |
|---|---|
| 工具没出现 | 确认 `node_modules/dsh-altare` 存在、`cordis.patch.yml` 里有 `insert` 行、宿主已重载 |
| `no-token` | 三种来源都没找到令牌，按 `guidance` 配置后重试 |
| `TOKEN_INVALID` / `TOKEN_EXPIRED` / `TOKEN_REVOKED` | 令牌无效、过期或被吊销，去控制台重新签发 |
| `403` 无 code | 缺 scope 或应用不在令牌范围内，先 `altare_whoami` |
| `TOKEN_ROUTE_NOT_ALLOWED` | 该端点只允许人在控制台操作，见上一节 |
| `404` | 应用/资源不存在，或对非 GitHub 部署型应用调了 `/git` 端点 |
| `409` | 应用正忙、备份满 3 个、预览到上限 |
| `429` | 超过 600 次/分钟（或归档 10 次/分钟、URL 拉取 20 次/分钟） |

---

## 8. 开发与测试

```powershell
cd F:\Code\Temp\24_Altare云平台插件
node 06_tests/smoke.mjs        # 起本地假 API，17 项断言，不联外网
node 06_tests/apply-check.mjs  # 模拟宿主加载，10 项：注册 13 个工具
node 06_tests/schema-check.mjs # 用宿主真实 dsh-tools 编译，13+13 项
node 06_tests/config-check.mjs # 用宿主真实 schemastery 校验配置，4 项
```

目录：

```
01_src/
├── package.json
├── cordis.patch.yml
├── lib/
│   ├── index.js        # 插件入口，注册 13 个工具
│   ├── config.js       # Schemastery 配置
│   ├── runtime.js      # 令牌解析 / 自描述缓存 / 应用名解析 / scope 门禁
│   ├── client.js       # HTTP + 重试 + 错误翻译
│   ├── errors.js       # 规范返回值
│   ├── scopes.js       # 动作 → scope 唯一登记表
│   └── tools/          # 13 个工具 + shared.js
├── locale/zh.json
├── icon.svg
└── market.json
```

License: MIT
