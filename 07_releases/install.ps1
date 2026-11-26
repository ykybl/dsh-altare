<#
.SYNOPSIS
    把 dsh-altare 接入 DSH 的 desktop profile。

.DESCRIPTION
    1) 以 junction 把 01_src 挂到 <profile>\node_modules\dsh-altare；
    2) 备份并在 cordis.patch.yml 末尾追加插件行（已存在则跳过）；
    3) 可选：把令牌写入用户级环境变量 ALTARE_TOKEN。
    重复运行是幂等的。

.PARAMETER Source
    插件包目录（含 package.json）。默认取脚本所在项目内的 01_src，可由本参数覆盖。

.PARAMETER Profile
    DSH profile 目录。默认 $env:USERPROFILE\.dsh\profiles\desktop。

.PARAMETER Token
    可选。Altare 团队 API 令牌（alt_ 开头），写入用户级环境变量。

.PARAMETER Uninstall
    只移除 junction 与 patch 里的插件行，不动其它内容。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\install.ps1

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\install.ps1 -Token "alt_xxx"
#>
[CmdletBinding()]
param(
    [string]$Source = (Join-Path (Split-Path -Parent $PSScriptRoot) '01_src'),
    [string]$Profile = (Join-Path $env:USERPROFILE '.dsh\profiles\desktop'),
    [string]$Token = '',
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$PackageName = 'dsh-altare'

function Write-Step([string]$Text) { Write-Host "  $Text" }
function Write-Head([string]$Text) { Write-Host "`n== $Text" -ForegroundColor Cyan }

if (-not (Test-Path -LiteralPath $Profile)) {
    throw "找不到 profile 目录：$Profile"
}

$nodeModules = Join-Path $Profile 'node_modules'
$target = Join-Path $nodeModules $PackageName
$patch = Join-Path $Profile 'cordis.patch.yml'

# ── 卸载 ────────────────────────────────────────────────────────────────────────
if ($Uninstall) {
    Write-Head "卸载 $PackageName"
    if (Test-Path -LiteralPath $target) {
        $item = Get-Item -LiteralPath $target -Force
        if ($item.LinkType) {
            $item.Delete()
            Write-Step "已删除 junction $target（源码不动）"
        }
        else {
            Remove-Item -LiteralPath $target -Recurse -Force
            Write-Step "已删除目录 $target"
        }
    }
    else {
        Write-Step "node_modules 里没有 $PackageName，跳过"
    }

    if (Test-Path -LiteralPath $patch) {
        $text = Get-Content -LiteralPath $patch -Raw -Encoding UTF8
        $pattern = '(?ms)^\s*-\s*insert:\s*\r?\n\s*-\s*id:\s*altare\s*\r?\n(?:\s{2,}.*\r?\n?)*'
        if ($text -match $pattern) {
            Copy-Item -LiteralPath $patch "$patch.bak-before-altare-remove-$(Get-Date -Format yyyyMMddHHmmss)"
            $new = [regex]::Replace($text, $pattern, '')
            [System.IO.File]::WriteAllText($patch, $new, [System.Text.UTF8Encoding]::new($false))
            Write-Step "已从 cordis.patch.yml 移除插件行（已备份）"
        }
        else {
            Write-Step "cordis.patch.yml 里没有插件行，跳过"
        }
    }
    Write-Step "重启 DSH 生效"
    exit 0
}

# ── 校验源码 ────────────────────────────────────────────────────────────────────
$pkgJson = Join-Path $Source 'package.json'
if (-not (Test-Path -LiteralPath $pkgJson)) {
    throw "插件目录不合法，缺少 package.json：$Source"
}
$pkg = Get-Content -LiteralPath $pkgJson -Raw -Encoding UTF8 | ConvertFrom-Json
if ($pkg.name -ne $PackageName) {
    throw "package.json 的 name 是 $($pkg.name)，期望 $PackageName"
}

Write-Head "接入 $PackageName $($pkg.version)"
Write-Step "profile : $Profile"
Write-Step "source  : $Source"

# ── junction ────────────────────────────────────────────────────────────────────
if (-not (Test-Path -LiteralPath $nodeModules)) {
    New-Item -ItemType Directory -Path $nodeModules -Force | Out-Null
    Write-Step "已创建 $nodeModules"
}

if (Test-Path -LiteralPath $target) {
    $existing = Get-Item -LiteralPath $target -Force
    if ($existing.LinkType -eq 'Junction' -and $existing.Target -contains $Source) {
        Write-Step "junction 已存在且指向正确，跳过"
    }
    else {
        if ($existing.LinkType) { $existing.Delete() } else { Remove-Item -LiteralPath $target -Recurse -Force }
        New-Item -ItemType Junction -Path $target -Target $Source | Out-Null
        Write-Step "已重建 junction $target"
    }
}
else {
    New-Item -ItemType Junction -Path $target -Target $Source | Out-Null
    Write-Step "已创建 junction $target"
}

# ── patch 行 ────────────────────────────────────────────────────────────────────
if (-not (Test-Path -LiteralPath $patch)) {
    [System.IO.File]::WriteAllText($patch, "# dsh profile patch`n", [System.Text.UTF8Encoding]::new($false))
    Write-Step "cordis.patch.yml 不存在，已创建"
}

$text = Get-Content -LiteralPath $patch -Raw -Encoding UTF8
if ($text -match '(?m)^\s*-\s*id:\s*altare\s*$') {
    Write-Step "cordis.patch.yml 已有插件行，跳过"
}
else {
    $stamp = Get-Date -Format 'yyyyMMddHHmmss'
    Copy-Item -LiteralPath $patch "$patch.bak-before-altare-$stamp"
    $block = @"

# dsh-altare（$stamp 由 install.ps1 追加）
- insert:
    - id: altare
      name: 'dsh-altare'
      config:
        baseUrl: 'https://console.altare.gg/api'
        tokenSource: auto
        tokenRef: ALTARE_TOKEN
"@
    [System.IO.File]::AppendAllText($patch, $block, [System.Text.UTF8Encoding]::new($false))
    Write-Step "已追加插件行（备份：cordis.patch.yml.bak-before-altare-$stamp）"
}

# ── 令牌 ────────────────────────────────────────────────────────────────────────
if ($Token -ne '') {
    [Environment]::SetEnvironmentVariable('ALTARE_TOKEN', $Token, 'User')
    Write-Step "已写入用户级环境变量 ALTARE_TOKEN"
}
elseif ([Environment]::GetEnvironmentVariable('ALTARE_TOKEN', 'User')) {
    Write-Step "检测到已有用户级环境变量 ALTARE_TOKEN"
}
else {
    Write-Step "未配置令牌：可设环境变量 ALTARE_TOKEN，或写入 ~/.dsh/.credentials.yaml 的 refs"
}

Write-Head "完成"
Write-Step "重启 DSH（或等 patch 热重载）后，对 AI 说：看下我 Altare 上有哪些应用"
Write-Step "自检：node 06_tests\smoke.mjs；schema：node 06_tests\schema-check.mjs"
