/**
 * 错误类型与规范返回值。
 *
 * 所有工具都返回同一个形状：`{ ok: true, ... }` 或 `{ ok: false, error: {...} }`。
 * 这样模型永远拿到结构化结果，而不是一个裸异常；令牌本身绝不会出现在任何
 * 返回值、日志或错误消息里。
 * @module dsh-altare/errors
 */

/** Altare API 返回的非 2xx 响应。 */
export class AltareError extends Error {
    /**
     * @param message - 人类可读的错误消息。
     * @param fields - 状态码、API 错误码、重试等待秒数与给模型的处理建议。
     */
    constructor(message, fields = {}) {
        super(message);
        this.name = 'AltareError';
        this.status = fields.status;
        this.code = fields.code;
        this.retryAfter = fields.retryAfter;
        this.guidance = fields.guidance;
    }
}

/** 成功值：展开业务字段。 */
export function okValue(data) {
    return { ok: true, ...data };
}

/** 失败值：code 稳定可判，guidance 告诉模型下一步怎么做。 */
export function errorValue(code, message, guidance, extra) {
    return {
        ok: false,
        error: {
            code,
            message,
            ...(guidance === undefined ? {} : { guidance }),
            ...(extra === undefined ? {} : extra),
        },
    };
}

/** 把任意异常转成规范失败值。 */
export function toErrorValue(error) {
    if (error instanceof AltareError) {
        return errorValue(error.code ?? `http-${error.status ?? 'unknown'}`, error.message, error.guidance, error.status === undefined ? undefined : { status: error.status });
    }
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
        return errorValue('aborted', '请求被取消或超时。');
    }
    const message = String(error?.message ?? error);
    return errorValue('internal', message);
}

/** 参数缺失的快捷构造。 */
export function badParam(message, guidance) {
    return new AltareError(message, { code: 'bad-param', guidance });
}
