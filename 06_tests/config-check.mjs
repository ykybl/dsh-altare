/**
 * 用宿主真实的 @deepseek-ai/schemastery 校验插件 Config：
 * 默认值能否生成、非法值是否报错。
 *
 * 运行前需让 `@deepseek-ai/schemastery` 可解析（见 install 文档的 junction 说明）。
 */
import { Config } from '../01_src/lib/config.js';

const cases = [
    {
        name: '空配置走默认值',
        input: {},
        expect: value => value.baseUrl === 'https://console.altare.gg/api'
            && value.tokenSource === 'auto'
            && value.tokenRef === 'ALTARE_TOKEN'
            && value.requestTimeoutMs === 30_000
            && value.maxOutputChars === 20_000,
    },
    {
        name: '自定义字段生效',
        input: { baseUrl: 'https://example.com/api', tokenRef: 'MY_TOKEN', maxRetries: 5 },
        expect: value => value.baseUrl === 'https://example.com/api' && value.tokenRef === 'MY_TOKEN' && value.maxRetries === 5,
    },
    {
        name: '非法 tokenSource 被拒绝',
        input: { tokenSource: 'nope' },
        expect: () => false,
        throws: true,
    },
    {
        name: '非法 tokenRef 被拒绝',
        input: { tokenRef: '1BAD-NAME' },
        expect: () => false,
        throws: true,
    },
];

let failed = 0;
for (const item of cases) {
    try {
        const value = Config(item.input);
        const ok = item.expect(value);
        if (ok) {
            console.log(`  ok    ${item.name}`);
        }
        else {
            failed += 1;
            console.log(`  FAIL  ${item.name} :: ${JSON.stringify(value)}`);
        }
    }
    catch (error) {
        if (item.throws) {
            console.log(`  ok    ${item.name}（已拒绝：${error.message.split('\n')[0]}）`);
        }
        else {
            failed += 1;
            console.log(`  FAIL  ${item.name} :: ${error.message}`);
        }
    }
}

console.log(`\n${cases.length - failed}/${cases.length} 配置用例通过`);
if (failed > 0)
    process.exitCode = 1;
