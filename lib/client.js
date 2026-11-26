/**
 * dsh-altare — browser half.
 *
 * Registers the 「Altare 云平台管家」 page under Settings. Plain
 * `__ModuleLoader__` module, no build step: React comes from the browser module
 * table that `dsh.client.inject` declares.
 *
 * Reads one route from this plugin's host half:
 *   GET /altare/state
 * Token values never travel over this route — only the source name and prefix.
 */
window.__ModuleLoader__.load({
    id: 'dsh-altare',
    factory: (require) => {
        const module = { exports: {} };
        const exports = module.exports;

        const React = require('react');
        const NS = 'dsh-altare';
        const STATE = '/altare/state';
        const h = React.createElement;

        async function loadState() {
            let res;
            try {
                res = await fetch(STATE, { cache: 'no-store' });
            }
            catch (error) {
                throw new Error(`无法连接 DSH 主机：${error?.message ?? String(error)}`);
            }
            let data = null;
            try {
                data = await res.json();
            }
            catch {
                data = null;
            }
            if (data === null)
                throw new Error(`状态接口没有返回 JSON（HTTP ${res.status}）`);
            if (data.ok === false)
                throw new Error(data.error?.message ?? '读取插件状态失败');
            return data;
        }

        function Dot(props) {
            const tone = props.tone === 'ok' ? 'ok' : props.tone === 'bad' ? 'bad' : 'idle';
            return h('span', { className: `alt-dot alt-dot-${tone}`, 'aria-hidden': 'true' });
        }

        function Panel() {
            const [state, setState] = React.useState(null);
            const [error, setError] = React.useState('');
            const [loading, setLoading] = React.useState(true);

            const reload = React.useCallback(async () => {
                setLoading(true);
                setError('');
                try {
                    setState(await loadState());
                }
                catch (failure) {
                    setError(failure?.message ?? String(failure));
                }
                finally {
                    setLoading(false);
                }
            }, []);

            React.useEffect(() => {
                reload();
            }, [reload]);

            const scopes = Array.isArray(state?.scopes) ? state.scopes : [];
            const hasToken = state?.hasToken === true;
            const sourceLabel = state?.tokenSource === 'config'
                ? '插件配置'
                : state?.tokenSource === 'credentials'
                    ? 'dsh 凭据库'
                    : state?.tokenSource === 'env'
                        ? '环境变量'
                        : '';

            return h(
                'section',
                { className: 'alt-root' },
                h(
                    'div',
                    { className: 'alt-head' },
                    h('h2', { className: 'alt-title' }, 'Altare 云平台管家'),
                    h('p', { className: 'alt-sub' },
                        '用官方团队 API Token 把 Altare 接入 DSH。13 个工具按 token scope 自动鉴权，'
                        + '缺权限时会直接告诉你要补哪个 scope。'),
                ),

                h(
                    'section',
                    { className: 'alt-card' },
                    h('h3', { className: 'alt-h3' }, '令牌状态'),
                    loading
                        ? h('p', { className: 'alt-muted' }, '正在读取…')
                        : error !== ''
                            ? h('div', { className: 'alt-alert alt-alert-bad' }, error)
                            : h(
                                'div',
                                { className: 'alt-status' },
                                h(Dot, { tone: hasToken ? 'ok' : 'bad' }),
                                h('span', null, hasToken ? '已找到令牌' : '没有令牌'),
                                hasToken && sourceLabel !== ''
                                    ? h('span', { className: 'alt-sep' }, `来源：${sourceLabel}`)
                                    : null,
                                hasToken && state?.tokenPrefix
                                    ? h('span', { className: 'alt-sep' }, `前缀：${state.tokenPrefix}…`)
                                    : null,
                            ),

                    !loading && !error && hasToken && state?.team
                        ? h(
                            'div',
                            { className: 'alt-meta' },
                            h('span', null, `团队：${state.team.name ?? state.team.id}`),
                            state.expiresAt ? h('span', null, `过期：${String(state.expiresAt).slice(0, 10)}`) : null,
                            h('span', null, `可见服务器：${(state.serverIds ?? []).length}`),
                        )
                        : null,

                    !loading && !error && !hasToken && state?.guidance
                        ? h(
                            'section',
                            { className: 'alt-card alt-card-flat' },
                            h('h4', { className: 'alt-h3' }, '怎么配令牌'),
                            h('p', { className: 'alt-p' }, '在控制台 Team → Settings → API tokens 创建一枚（alt_ 开头），然后任选其一：'),
                            h(
                                'ol',
                                { className: 'alt-ol' },
                                h('li', null, `写进 dsh 凭据库：~/.dsh/.credentials.yaml 的 refs 下加 ${state.tokenRef ?? 'ALTARE_TOKEN'}: alt_xxx`),
                                h('li', null, `设环境变量 ${state.tokenRef ?? 'ALTARE_TOKEN'}（需要重启 DSH）`),
                                h('li', null, '在插件配置里填 altareToken（明文，仅建议一次性令牌）'),
                            ),
                        )
                        : null,

                    !loading && !error && hasToken && scopes.length > 0
                        ? h(
                            'section',
                            { className: 'alt-card alt-card-flat' },
                            h('h4', { className: 'alt-h3' }, `已授权 scope（${scopes.length}）`),
                            h(
                                'div',
                                { className: 'alt-chips' },
                                scopes.map(scope => h('span', { className: 'alt-chip', key: scope }, scope)),
                            ),
                            h('p', { className: 'alt-muted' },
                                '缺哪个 scope，就到控制台重新签发一枚并勾选它；不必重启，下一次调用会重新读令牌。'),
                        )
                        : null,

                    h(
                        'div',
                        { className: 'alt-actions' },
                        h('button', { className: 'alt-btn', type: 'button', onClick: reload, disabled: loading },
                            loading ? '读取中…' : '重新检测'),
                        h('a', { className: 'alt-btn alt-btn-plain', href: 'https://console.altare.gg/', target: '_blank', rel: 'noreferrer' },
                            '打开控制台'),
                    ),

                    h('p', { className: 'alt-muted' },
                        '接口地址：' + (state?.baseUrl ?? 'https://console.altare.gg/api')),
                ),

                h(
                    'section',
                    { className: 'alt-card' },
                    h('h3', { className: 'alt-h3' }, '常用指令'),
                    h('p', { className: 'alt-p' }, '在对话里直接说就行：'),
                    h(
                        'ul',
                        { className: 'alt-list' },
                        h('li', null, '「看下我 Altare 上有哪些应用」→ altare_apps(action="list")'),
                        h('li', null, '「重启 my-bot」→ altare_apps(action="power", app="my-bot", signal="restart")'),
                        h('li', null, '「拉最新代码部署」→ altare_deploys(action="deploy", app="my-bot", ref="main")'),
                        h('li', null, '「查最近的报错」→ altare_logs(action="read", app="my-bot", q="error")'),
                    ),
                    h('p', { className: 'alt-muted' },
                        '建应用、删应用、成员与账单管理、SSH 与实时控制台由官方禁止令牌调用，只能人在控制台操作。'),
                ),
            );
        }

        const STYLES = `
.alt-root { display: flex; flex-direction: column; gap: 14px; padding: 4px 2px 24px; color: var(--dsw-alias-label-primary, #e8eaf0); }
.alt-head { display: flex; flex-direction: column; gap: 6px; }
.alt-title { margin: 0; font-size: 17px; font-weight: 650; }
.alt-sub { margin: 0; font-size: 12.5px; line-height: 1.6; color: var(--dsw-alias-label-secondary, #98a1b3); }
.alt-card { border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.22)); border-radius: 12px; padding: 14px 16px; background: var(--dsw-alias-bg-layer-1, rgba(127,127,127,.05)); display: flex; flex-direction: column; gap: 10px; }
.alt-card-flat { border-style: dashed; }
.alt-h3 { margin: 0; font-size: 13.5px; font-weight: 650; }
.alt-status { display: flex; align-items: center; gap: 8px; font-size: 13.5px; flex-wrap: wrap; }
.alt-sep { color: var(--dsw-alias-label-secondary, #98a1b3); }
.alt-muted { color: var(--dsw-alias-label-secondary, #98a1b3); font-size: 12.5px; margin: 0; }
.alt-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex: none; }
.alt-dot-ok { background: #2fb872; box-shadow: 0 0 0 3px color-mix(in srgb, #2fb872 24%, transparent); }
.alt-dot-bad { background: #e5534b; }
.alt-dot-idle { background: #8b93a5; }
.alt-meta { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11.5px; color: var(--dsw-alias-label-secondary, #98a1b3); }
.alt-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.alt-chip { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11.5px; padding: 2px 8px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.14)); border: 1px solid var(--dsw-alias-border-l1, rgba(127,127,127,.22)); }
.alt-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.alt-btn { font-size: 12.5px; padding: 6px 14px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.35)); background: var(--dsw-alias-bg-layer-2, rgba(127,127,127,.1)); color: inherit; cursor: pointer; text-decoration: none; }
.alt-btn:disabled { opacity: .55; cursor: default; }
.alt-btn-plain { background: transparent; }
.alt-alert { font-size: 12.5px; line-height: 1.6; padding: 9px 12px; border-radius: 9px; }
.alt-alert-bad { background: color-mix(in srgb, #e5534b 12%, transparent); border: 1px solid color-mix(in srgb, #e5534b 38%, transparent); color: #f08a84; }
.alt-p { margin: 0; font-size: 12.5px; line-height: 1.65; }
.alt-ol { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; line-height: 1.55; }
.alt-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; line-height: 1.6; }
`;

        function apply(ctx) {
            ctx.effect(() => {
                const tag = document.createElement('style');
                tag.setAttribute('data-plugin', NS);
                tag.textContent = STYLES;
                document.head.appendChild(tag);
                return () => {
                    if (tag.parentNode !== null)
                        tag.parentNode.removeChild(tag);
                };
            }, `${NS}: styles`);

            ctx.slots.inject('settings.section', () =>
                ctx.slots.register(
                    {
                        name: 'settings.section',
                        id: NS,
                        order: 41,
                        label: () => 'Altare 云平台管家',
                    },
                    () => React.createElement(Panel, null),
                ),
            );
        }

        module.exports = { name: NS, inject: ['slots'], apply };
        return module.exports;
    },
});
