/**
 * `altare_files`：应用文件的增删改查、压缩解压与上传下载链接。
 * @module dsh-altare/tools/files
 */
import { badParam, okValue } from '../errors.js';
import { listArg, requireString, tool } from './shared.js';

const SCOPE = {
    list: 'servers:files',
    read: 'servers:files',
    write: 'servers:files',
    mkdir: 'servers:files',
    rename: 'servers:files',
    copy: 'servers:files',
    delete: 'servers:files',
    compress: 'servers:files',
    decompress: 'servers:files',
    download_link: 'servers:files',
    archive: 'servers:files',
    upload_url: 'servers:files',
    pull: 'servers:files',
};

export function filesTool(runtime) {
    return tool({
        runtime,
        name: 'altare_files',
        description: '操作应用文件系统（路径以 / 开头，表示应用 home）。动作：'
            + 'list 列目录；read 读文本文件；write 创建或覆盖；mkdir 建目录；rename 移动/重命名；'
            + 'copy 复制；delete 删除（目录连同内容）；compress / decompress 打包解包；'
            + 'download_link 取单文件临时下载链接；archive 把多个文件打成 zip/tar.gz 并返回链接；'
            + 'upload_url 取上传链接；pull 让节点从公网 URL 下载文件到应用。写操作不可逆，删除前请确认。',
        parameters: {
            action: { type: 'string', required: true, description: 'list | read | write | mkdir | rename | copy | delete | compress | decompress | download_link | archive | upload_url | pull' },
            app: { type: 'string', required: true, description: '应用名或 serverId。' },
            path: { type: 'string', description: 'list 的目录、read/write/download_link 的文件路径、mkdir 的父目录。' },
            name: { type: 'string', description: 'mkdir：在 path 下创建的目录名。' },
            content: { type: 'string', description: 'write：文件全文。' },
            from: { type: 'string', description: 'rename：源路径。' },
            to: { type: 'string', description: 'rename：目标路径。' },
            location: { type: 'string', description: 'copy：要复制的源文件路径。' },
            paths: { type: 'string', description: 'delete：要删除的路径，逗号或换行分隔。' },
            root: { type: 'string', description: 'compress / decompress / archive：所在目录。' },
            files: { type: 'string', description: 'compress：root 内要打包的文件名，逗号或换行分隔。' },
            file: { type: 'string', description: 'decompress：root 内的压缩包文件名。' },
            format: { type: 'string', description: 'archive：zip（默认）或 tar.gz。' },
            directory: { type: 'string', description: 'upload_url / pull：目标目录。' },
            url: { type: 'string', description: 'pull：公网 http(s) 地址。' },
            filename: { type: 'string', description: 'pull：保存的文件名，默认取 URL 中的名字。' },
            overwrite: { type: 'boolean', description: 'pull：覆盖同名文件。' },
        },
        async run(args, exec) {
            const action = String(args.action ?? '').trim();
            const scope = SCOPE[action];
            if (scope === undefined)
                throw badParam(`未知 action "${action}"。`, `可用：${Object.keys(SCOPE).join(' | ')}。`);
            const gate = await runtime.requireScope(scope, { signal: exec.signal });
            if (gate)
                return gate;

            const app = requireString(args, 'app', '应用名或 serverId');
            const base = await runtime.serverBase(app, { signal: exec.signal });
            const files = `${base}/files`;

            switch (action) {
                case 'list': {
                    const res = await runtime.request('GET', files, { signal: exec.signal, query: { path: args.path ?? '/' } });
                    return okValue({ directory: res.data?.directory, items: res.data?.items ?? [] });
                }
                case 'read': {
                    const path = requireString(args, 'path', '文件路径');
                    const res = await runtime.request('GET', `${files}/contents`, { signal: exec.signal, query: { path } });
                    return okValue({ path: res.data?.path ?? path, content: res.data?.content });
                }
                case 'write': {
                    const path = requireString(args, 'path', '文件路径');
                    const content = typeof args.content === 'string' ? args.content : '';
                    const res = await runtime.request('POST', `${files}/write`, { signal: exec.signal, body: { path, content } });
                    return okValue({ path, bytes: Buffer.byteLength(content, 'utf8'), result: res.data });
                }
                case 'mkdir': {
                    const res = await runtime.request('POST', `${files}/directories`, {
                        signal: exec.signal,
                        body: { name: requireString(args, 'name', '目录名'), path: args.path ?? '/' },
                    });
                    return okValue({ result: res.data });
                }
                case 'rename': {
                    const res = await runtime.request('POST', `${files}/rename`, {
                        signal: exec.signal,
                        body: { from: requireString(args, 'from', '源路径'), to: requireString(args, 'to', '目标路径') },
                    });
                    return okValue({ result: res.data });
                }
                case 'copy': {
                    const location = requireString(args, 'location', '源文件路径');
                    const res = await runtime.request('POST', `${files}/copy`, { signal: exec.signal, body: { location } });
                    return okValue({ location, result: res.data });
                }
                case 'delete': {
                    const paths = listArg(args.paths, 'paths');
                    if (!paths || paths.length === 0)
                        throw badParam('delete 至少要传一个路径。');
                    const res = await runtime.request('POST', `${files}/delete`, { signal: exec.signal, body: { paths } });
                    return okValue({ paths, result: res.data });
                }
                case 'compress': {
                    const names = listArg(args.files, 'files');
                    if (!names || names.length === 0)
                        throw badParam('compress 需要传 files。');
                    const res = await runtime.request('POST', `${files}/compress`, {
                        signal: exec.signal,
                        body: { root: args.root ?? '/', files: names },
                    });
                    return okValue({ result: res.data });
                }
                case 'decompress': {
                    const res = await runtime.request('POST', `${files}/decompress`, {
                        signal: exec.signal,
                        body: { root: args.root ?? '/', file: requireString(args, 'file', '压缩包文件名') },
                    });
                    return okValue({ result: res.data });
                }
                case 'download_link': {
                    const path = requireString(args, 'path', '文件路径');
                    const res = await runtime.request('GET', `${files}/download`, { signal: exec.signal, query: { path } });
                    return okValue({ path, url: res.data?.url, note: '链接短期有效且不需要令牌，请勿外传。' });
                }
                case 'archive': {
                    const paths = listArg(args.paths, 'paths');
                    if (!paths || paths.length === 0)
                        throw badParam('archive 需要传 paths。');
                    const res = await runtime.request('POST', `${files}/archive`, {
                        signal: exec.signal,
                        body: { root: args.root ?? '/', paths, format: args.format ?? 'zip' },
                    });
                    return okValue({ result: res.data });
                }
                case 'upload_url': {
                    const res = await runtime.request('POST', `${files}/uploads/url`, {
                        signal: exec.signal,
                        body: { directory: args.directory ?? '/' },
                    });
                    return okValue({ result: res.data, note: '用 multipart/form-data 上传，每个文件一个 files 字段。' });
                }
                case 'pull': {
                    const res = await runtime.request('POST', `${files}/pull`, {
                        signal: exec.signal,
                        body: {
                            url: requireString(args, 'url', '下载地址'),
                            directory: args.directory ?? '/',
                            ...(args.filename ? { filename: args.filename } : {}),
                            ...(args.overwrite === true ? { overwrite: true } : {}),
                        },
                    });
                    return okValue({ result: res.data });
                }
                default:
                    throw badParam(`未知 action "${action}"。`);
            }
        },
    });
}
