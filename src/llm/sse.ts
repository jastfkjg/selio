import { ApiError } from './errors';

/** Incremental SSE framing; supports UTF-8 chunk boundaries, CRLF and multi-line data. */
export async function* sseData(stream: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 1024 * 1024) throw new ApiError('invalid_stream', '模型返回的数据过大，已停止读取。');
      let match: RegExpExecArray | null;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        const frame = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
        if (data) yield data;
      }
      if (done) {
        const data = buffer.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
        if (data) yield data;
        break;
      }
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
export function parseDelta(data: string): { text: string; finished: boolean } {
  if (data.trim() === '[DONE]') return { text: '', finished: true };
  let payload;
  try { payload = JSON.parse(data); } catch { throw new ApiError('invalid_stream', '模型返回了无效的流式数据，请检查接口兼容性。'); }
  if (payload.error) throw new ApiError('stream_error', '模型服务在生成时返回错误，请检查账户与模型设置。');
  const choice = payload.choices?.[0];
  const content = choice?.delta?.content;
  if (choice?.finish_reason === 'length') throw new ApiError('length', '回答达到输出上限，可继续追问或在设置中提高上限。');
  return { text: typeof content === 'string' ? content : '', finished: Boolean(choice?.finish_reason) };
}
