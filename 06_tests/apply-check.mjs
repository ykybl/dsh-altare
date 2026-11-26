/**
 * 模拟宿主加载：apply() 应注册 13 个工具且不抛错。
 *
 * 运行：node 06_tests/apply-check.mjs
 */
import { apply, Config, inject, name } from '../01_src/lib/index.js';

const registered = [];
const ctx = {
    tools: {
        register: (definition) => {
            registered.push(definition);
            return () => {};
        },
    },
    get: () => null,
};

const config = Config({
    baseUrl: 'https://console.altare.gg/api',
    tokenSource: 'auto',
    tokenRef: 'ALTARE_TOKEN',
    requestTimeoutMs: 30_000,
    maxRetries: 2,
    cacheTtlMs: 60_000,
    maxOutputChars: 20_000,
});

apply(ctx, config);

let failed = 0;
const check = (label, condition, detail) => {
    if (condition) {
        console.log(`  ok    ${label}`);
    }
    else {
        failed += 1;
        console.log(`  FAIL  ${label}${detail === undefined ? '' : ` :: ${JSON.stringify(detail)}`}`);
    }
};

check('插件名正确', name === 'dsh-altare', name);
check('只依赖 tools 服务', Array.isArray(inject) && inject.length === 1 && inject[0] === 'tools', inject);
check('注册 13 个工具', registered.length === 13, registered.map(item => item.name));
check('工具名都以 altare_ 开头', registered.every(item => item.name.startsWith('altare_')), registered.map(item => item.name));
check('每个工具都有 execute', registered.every(item => typeof item.execute === 'function'));
check('每个工具都有参数 schema', registered.every(item => item.parameters && typeof item.parameters === 'object'));
check('工具名无重复', new Set(registered.map(item => item.name)).size === registered.length);
check('参数已编译为 JSON Schema 对象', registered.every(item => item.parameters?.type === 'object' && !!item.parameters.properties));
check('输出 schema 与渲染器齐备', registered.every(item => item.output && typeof item.output.render === 'function'));
const apps = registered.find(item => item.name === 'altare_apps');
check('altare_apps 有 8 个参数、1 个必填', Object.keys(apps?.parameters?.properties ?? {}).length === 8 && apps?.parameters?.required?.length === 1, apps?.parameters);
console.log(`  -     ${registered.map(item => item.name).join(', ')}`);

console.log(`\n${10 - failed}/10 通过`);
if (failed > 0)
    process.exitCode = 1;
