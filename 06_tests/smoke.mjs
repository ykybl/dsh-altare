/**
 * 离线冒烟测试：起一个本地假 Altare API，逐个工具打一遍。
 *
 * 运行：node 06_tests/smoke.mjs
 * 不需要真实令牌，也不访问外网。
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRuntime } from '../01_src/lib/runtime.js';
import { createTools } from '../01_src/lib/tools/index.js';

const ALL_SCOPES = [
    'servers:view', 'servers:power', 'servers:console', 'servers:settings', 'servers:files',
    'servers:backups', 'servers:snapshots', 'servers:network', 'servers:schedules',
    'servers:startup', 'servers:activity', 'team:settings:view', 'team:settings:manage',
    'team:members:view', 'team:logs:view',
];

let scopes = [...ALL_SCOPES];
let deployPolls = 0;
const seen = [];

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const chunks = [];
    for await (const chunk of req)
        chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    const send = (status, body) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== 'Bearer alt_test')
        return send(401, { error: 'This API token is invalid.', code: 'TOKEN_INVALID' });

    seen.push({
        method: req.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        body: raw === '' ? undefined : JSON.parse(raw),
    });

    const path = url.pathname;
    if (path === '/api/api-tokens/self') {
        return send(200, {
            id: 'tok1',
            name: 'smoke',
            prefix: 'alt_test',
            team: { id: 'T1', name: 'Smoke Team' },
            scopes,
            serverIds: null,
            expiresAt: '2027-01-01T00:00:00.000Z',
        });
    }
    if (path === '/api/tenants/T1/servers') {
        return send(200, {
            items: [
                { id: 'S1', name: 'my-bot', memoryMb: 1024, diskMb: 5120, cpuPercent: 100 },
                { id: 'S2', name: 'web', memoryMb: 512, diskMb: 1024, cpuPercent: 100 },
            ],
        });
    }
    if (path === '/api/tenants/T1/servers/S1/details') {
        return send(200, { id: 'S1', name: 'my-bot', ip: '203.0.113.10:25565', network: { count: 1 } });
    }
    if (path === '/api/tenants/T1/servers/S1/power' && req.method === 'POST') {
        return send(200, { ok: true });
    }
    if (path === '/api/tenants/T1/servers/S1/logs') {
        return send(200, {
            lines: [{ ts: '2026-11-26T10:00:00.000Z', stream: 'stdout', text: 'hello', process: 'web' }],
            next: null,
        });
    }
    if (path === '/api/tenants/T1/servers/S1/files/write' && req.method === 'POST') {
        return send(200, { ok: true });
    }
    if (path === '/api/tenants/T1/servers/S1/git') {
        return send(200, { deployments: [{ id: 'D1', status: 'deploying' }] });
    }
    if (path === '/api/tenants/T1/servers/S1/git/deployments/D1') {
        deployPolls += 1;
        return send(200, {
            deployment: { id: 'D1', status: deployPolls >= 2 ? 'live' : 'deploying' },
            phase: deployPolls >= 2 ? 'done' : 'building',
            log: 'npm ci',
            done: deployPolls >= 2,
        });
    }
    if (path === '/api/tenants/T1/jobs') {
        return send(200, { jobs: [], max: 20 });
    }
    return send(404, { error: 'not found' });
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}/api`;

process.env.ALTARE_TOKEN = 'alt_test';

let passed = 0;
const failures = [];
function check(name, condition, detail) {
    if (condition) {
        passed += 1;
        console.log(`  ok    ${name}`);
    }
    else {
        failures.push(name);
        console.log(`  FAIL  ${name}${detail === undefined ? '' : ` :: ${JSON.stringify(detail)}`}`);
    }
}

const runtime = createRuntime({ get: () => null }, {
    baseUrl,
    tokenSource: 'env',
    tokenRef: 'ALTARE_TOKEN',
    requestTimeoutMs: 5000,
    maxRetries: 0,
    cacheTtlMs: 60_000,
    maxOutputChars: 20_000,
});
const tools = createTools(runtime);
const byName = new Map(tools.map(item => [item.name, item]));
const call = (name, args) => byName.get(name).execute(args, { signal: new AbortController().signal });

console.log(`mock api on ${baseUrl}\n`);
console.log('工具清单:');
console.log(`  ${tools.map(item => item.name).join(', ')}\n`);

// 1. whoami
const whoami = await call('altare_whoami', {});
check('whoami 返回团队与 scopes', whoami.ok === true && whoami.team?.id === 'T1' && Array.isArray(whoami.token?.scopes), whoami);
check('whoami 生成能力清单', Array.isArray(whoami.capabilities?.apps) && whoami.capabilities.apps.length === 8, whoami.capabilities);
check('whoami 标记 power 可用', whoami.capabilities?.apps?.find(item => item.action === 'power')?.allowed === true);

// 2. apps list / power / details
const list = await call('altare_apps', { action: 'list' });
check('apps.list 返回 2 个应用', list.ok === true && list.count === 2, list);

const power = await call('altare_apps', { action: 'power', app: 'my-bot', signal: 'restart' });
check('apps.power 按名称解析并下发 restart', power.ok === true && power.signal === 'restart', power);
check('apps.power 实际命中 /S1/power', seen.some(item => item.method === 'POST' && item.path === '/api/tenants/T1/servers/S1/power' && item.body?.signal === 'restart'));

const missing = await call('altare_apps', { action: 'details', app: 'nope' });
check('apps.details 未知名返回 app-not-found', missing.ok === false && missing.error?.code === 'app-not-found', missing);

// 3. logs 查询参数
const logs = await call('altare_logs', { action: 'read', app: 'my-bot', q: 'error', limit: 50 });
check('logs.read 透传过滤参数', logs.ok === true && seen.some(item => item.path.endsWith('/logs') && item.query.q === 'error' && item.query.limit === '50'), seen.at(-1));

// 4. scope 门禁
scopes = ['servers:view'];
runtime.forgetSelf();
const gated = await call('altare_files', { action: 'write', app: 'my-bot', path: '/a.txt', content: 'x' });
check('缺 scope 时拒绝执行', gated.ok === false && gated.error?.code === 'scope-missing' && gated.error?.neededScope === 'servers:files', gated);

scopes = [...ALL_SCOPES];
runtime.forgetSelf();
const written = await call('altare_files', { action: 'write', app: 'my-bot', path: '/a.txt', content: 'x' });
check('恢复 scope 后写入成功', written.ok === true && written.bytes === 1, written);

// 5. deploys.wait 轮询
const waited = await call('altare_deploys', { action: 'wait', app: 'my-bot', timeoutSeconds: 5, intervalSeconds: 0.1 });
check('deploys.wait 轮询到 done', waited.ok === true && waited.timedOut === false && waited.deployment?.deployment?.status === 'live', waited);
check('deploys.wait 至少轮询两次', deployPolls >= 2, deployPolls);

// 6. 原始端点 + {tenantId} 占位
const raw = await call('altare_api', { method: 'GET', path: '/tenants/{tenantId}/servers/S1/details' });
check('altare_api 替换 tenantId', raw.ok === true && raw.data?.id === 'S1', raw);

const rawBad = await call('altare_api', { method: 'GET', path: 'https://evil.example/x' });
check('altare_api 拒绝完整 URL', rawBad.ok === false && rawBad.error?.code === 'bad-param', rawBad);

const rawQs = await call('altare_api', { method: 'GET', path: '/tenants/{tenantId}/servers/S1/logs', query: 'q=error&limit=5' });
check('altare_api 支持 a=b&c=d 查询串', rawQs.ok === true && seen.some(item => item.path.endsWith('/logs') && item.query.q === 'error' && item.query.limit === '5'), rawQs);

// 7. 错误映射：令牌不存在
process.env.ALTARE_TOKEN = '';
delete process.env.ALTARE_TOKEN;
const noToken = createRuntime({ get: () => null }, { baseUrl, tokenSource: 'env', tokenRef: 'ALTARE_TOKEN' });
const noTokenTools = createTools(noToken);
const noTokenResult = await noTokenTools.find(item => item.name === 'altare_whoami').execute({}, { signal: new AbortController().signal });
check('无令牌返回 no-token 与配置指引', noTokenResult.ok === false && noTokenResult.error?.code === 'no-token' && typeof noTokenResult.error?.guidance === 'string', noTokenResult);

// 8. 错误映射：401
const wrong = createRuntime({ get: () => null }, { baseUrl, tokenSource: 'config', altareToken: 'alt_wrong' });
const wrongTools = createTools(wrong);
const wrongResult = await wrongTools.find(item => item.name === 'altare_whoami').execute({}, { signal: new AbortController().signal });
check('401 映射为 TOKEN_INVALID', wrongResult.ok === false && wrongResult.error?.code === 'TOKEN_INVALID', wrongResult);

server.close();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0)
    process.exitCode = 1;
