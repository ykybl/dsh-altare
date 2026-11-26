/**
 * 用宿主真实的 @deepseek-ai/dsh-tools 校验每个工具定义：
 * 参数 schema 能否编译、输出 schema 能否编译、defineTool 是否接受。
 *
 * 运行：node 06_tests/schema-check.mjs [dsh-tools 的 lib/index.js 路径]
 */
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRuntime } from '../01_src/lib/runtime.js';
import { createTools } from '../01_src/lib/tools/index.js';

const candidates = [
    process.argv[2],
    path.join(os.homedir(), '.dsh/_dbtest/node_modules/@deepseek-ai/dsh-tools/lib/index.js'),
    path.join(os.homedir(), '.dsh/profiles/desktop/node_modules/@deepseek-ai/dsh-tools/lib/index.js'),
].filter(Boolean);

let mod;
let used;
for (const candidate of candidates) {
    try {
        mod = await import(pathToFileURL(candidate).href);
        used = candidate;
        break;
    }
    catch {
        // 尝试下一个候选路径。
    }
}
if (!mod) {
    console.error('找不到 @deepseek-ai/dsh-tools，请把路径作为第一个参数传入。');
    process.exit(2);
}
const { defineTool, assertSupportedJsonSchema, parameterSchemaSpecToJsonSchema, valueSchemaSpecToJsonSchema } = mod;
console.log(`使用 ${used}\n`);

const { compileTool } = await import('../01_src/lib/tools/shared.js');

const runtime = createRuntime({ get: () => null }, {
    baseUrl: 'https://console.altare.gg/api',
    tokenSource: 'env',
    tokenRef: 'ALTARE_TOKEN',
    requestTimeoutMs: 30_000,
    maxRetries: 2,
    cacheTtlMs: 60_000,
    maxOutputChars: 20_000,
});
const tools = createTools(runtime);

let failed = 0;
for (const tool of tools) {
    const label = tool.name.padEnd(20);
    try {
        const parameters = parameterSchemaSpecToJsonSchema(tool.parameters);
        const required = parameters.required ?? [];
        const output = valueSchemaSpecToJsonSchema(tool.output.schema);
        defineTool({ ...tool, execute: tool.execute });
        console.log(`  ok    ${label} 参数 ${Object.keys(parameters.properties).length} 个（必填 ${required.length}），输出 schema 已编译`);
    }
    catch (error) {
        failed += 1;
        console.log(`  FAIL  ${label} ${error.message}`);
    }
}

console.log(`\n${tools.length - failed}/${tools.length} 工具通过宿主 schema 编译`);

// 第二阶段：宿主不提供 dsh-tools 时走内置编译器，产物同样必须被宿主校验接受。
let fallbackFailed = 0;
for (const tool of tools) {
    try {
        const compiled = compileTool(tool);
        assertSupportedJsonSchema(compiled.parameters);
        assertSupportedJsonSchema(compiled.output.schema);
    }
    catch (error) {
        fallbackFailed += 1;
        console.log(`  FAIL  ${tool.name.padEnd(20)} 内置编译产物被拒绝：${error.message}`);
    }
}
console.log(`${tools.length - fallbackFailed}/${tools.length} 内置编译产物被宿主接受`);

if (failed > 0 || fallbackFailed > 0)
    process.exitCode = 1;
