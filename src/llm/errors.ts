export class ApiError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'ApiError'; }
}
export function httpError(status: number): ApiError {
  const messages: Record<number, string> = {
    400: '请求参数不受此模型支持，请检查模型名称、Temperature 和输出上限。',
    401: 'API Key 无效或已过期，请在设置中更新。',
    402: '账户余额不足，请检查供应商账户。',
    403: '供应商拒绝访问，请检查 API Key 的权限。',
    404: '模型或 API 地址不存在，请检查 Base URL 和模型标识。',
    429: '请求过于频繁或额度不足，请稍后重试并检查账户额度。',
  };
  return new ApiError(`http_${status}`, messages[status] ?? (status >= 500 ? '模型服务暂时不可用，请稍后重试。' : '模型请求失败，请检查设置后重试。'));
}
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof DOMException && error.name === 'AbortError') return '生成已停止，可以重新生成。';
  // Never reflect provider response bodies or raw exceptions, which may contain secrets.
  return '连接中断，请检查网络、网站权限和 API 地址，然后重试。';
}
