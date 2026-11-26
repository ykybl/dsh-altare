/**
 * 插件配置（Schemastery）。每个字段都能在 cordis.yml 里改。
 *
 * 令牌默认不写在这里：`tokenSource: auto` 会依次尝试 本配置 → dsh 凭据库 → 环境变量。
 * @module dsh-altare/config
 */
import z from '@deepseek-ai/schemastery';

export const Config = z.object({
    baseUrl: z.string()
        .default('https://console.altare.gg/api')
        .description('Altare API 根地址；文档里的路径都相对于它。'),
    tokenSource: z.union(['auto', 'config', 'credentials', 'env'])
        .default('auto')
        .description('令牌来源：auto = 配置 → 凭据库 → 环境变量；也可固定为其中之一。'),
    tokenRef: z.string()
        .pattern(/^[A-Za-z_][A-Za-z0-9_]*$/)
        .default('ALTARE_TOKEN')
        .description('凭据引用名，同时是环境变量名。'),
    altareToken: z.string()
        .default('')
        .description('直接填写 alt_ 开头的团队令牌。明文保存在 profile 配置里，只建议用一次性令牌。'),
    requestTimeoutMs: z.number().step(1).min(1000)
        .default(30_000)
        .description('单次 HTTP 请求超时。'),
    maxRetries: z.number().step(1).min(0)
        .default(2)
        .description('429 与 GET 5xx 的重试次数。'),
    cacheTtlMs: z.number().step(1).min(0)
        .default(60_000)
        .description('令牌自描述（团队/scopes）的缓存时长；轮换令牌后可调小。'),
    maxOutputChars: z.number().step(1).min(500)
        .default(20_000)
        .description('单次工具输出渲染的字符上限，超出截断并提示缩小范围。'),
});
