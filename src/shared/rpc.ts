export async function rpc<T = void>(type: string, payload?: unknown): Promise<T> {
  const reply = await chrome.runtime.sendMessage({ type, payload });
  if (!reply?.ok) throw new Error(reply?.error || '扩展连接中断，请刷新网页重试。');
  return reply.data as T;
}
