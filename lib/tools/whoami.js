/**
 * `altare_whoami`：令牌身份、权限与能力清单。
 * @module dsh-altare/tools/whoami
 */
import { okValue } from '../errors.js';
import { capabilityReport, SCOPE_LABELS } from '../scopes.js';
import { tool } from './shared.js';

export function whoamiTool(runtime) {
    return tool({
        runtime,
        name: 'altare_whoami',
        description: '查看当前 Altare 令牌的身份与权限：团队、scopes、可访问的应用范围、过期时间，'
            + '以及每个工具动作能否使用。action=token（默认）读 /api-tokens/self；'
            + 'action=access 读团队角色与每应用权限。任何有效令牌都能调用，建议每次会话先调一次。',
        parameters: {
            action: {
                type: 'string',
                description: 'token（默认）：令牌自描述与能力清单；access：团队内的角色与逐应用权限。',
            },
        },
        concurrencySafe: true,
        async run(args, exec) {
            const action = String(args.action ?? '').trim() || 'token';
            const info = await runtime.self({ signal: exec.signal });
            if (action === 'access') {
                const base = await runtime.tenantBase({ signal: exec.signal });
                const res = await runtime.request('GET', `${base}/access`, { signal: exec.signal });
                return okValue({ access: res.data, team: info.team });
            }
            if (action !== 'token')
                throw new Error(`未知 action "${action}"，可用：token、access。`);

            const scopes = Array.isArray(info.scopes) ? info.scopes : [];
            const labels = {};
            for (const scope of scopes)
                labels[scope] = SCOPE_LABELS[scope] ?? '';
            return okValue({
                token: {
                    name: info.name,
                    prefix: info.prefix,
                    expiresAt: info.expiresAt,
                    scopes,
                    serverIds: info.serverIds,
                },
                team: info.team,
                tokenSource: runtime.tokenSource(),
                scopeLabels: labels,
                capabilities: capabilityReport(scopes),
            });
        },
    });
}
