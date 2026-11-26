/**
 * 诊断：从 profile 的 junction 路径解析核心包，确认插件在该宿主下能否加载。
 *
 * 预期结果：
 *   - schemastery 可解析（profile 里有，项目根也有测试用 junction）
 *   - dsh-tools / dsh-credentials / cordis 显示 FAIL 属正常——宿主用自己的加载器注入，
 *     这三个包不在 profile 的 node_modules 里。
 *   - 插件能 import 成功，说明入口模块自洽。
 *
 * 运行：node 06_tests/resolve-check.mjs
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

// 从环境变量取 profile 根，避免把本机绝对路径写进发布包。
const profile = join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh', 'profiles', 'desktop');
const points = [
    join(profile, 'package.json'),
    join(profile, 'node_modules', 'dsh-altare', 'lib', 'index.js'),
    join(profile, 'node_modules', '@perrylink', 'dsh-github', 'lib', 'index.js'),
];

for (const from of points) {
    const req = createRequire(from);
    console.log(`\n[resolve from] ${from}`);
    for (const spec of ['@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-credentials', '@deepseek-ai/schemastery', '@deepseek-ai/cordis']) {
        try {
            console.log(`  ${spec.padEnd(32)} -> ${req.resolve(spec)}`);
        }
        catch (error) {
            console.log(`  ${spec.padEnd(32)} -> FAIL ${error.code ?? error.message}`);
        }
    }
}

console.log('\n[real path of plugin entry]');
console.log('  ', await (await import('node:fs/promises')).realpath(join(profile, 'node_modules', 'dsh-altare', 'lib', 'index.js')));

console.log('\n[import plugin through junction]');
try {
    const mod = await import(pathToFileURL(join(profile, 'node_modules', 'dsh-altare', 'lib', 'index.js')).href);
    console.log('   apply:', typeof mod.apply, '| name:', mod.name, '| inject:', JSON.stringify(mod.inject));
}
catch (error) {
    console.log('   IMPORT FAILED:', error.message.split('\n').slice(0, 3).join(' | '));
}
