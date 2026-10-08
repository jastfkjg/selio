import { describe, expect, it } from 'vitest';
import { parseDelta, sseData } from '../src/llm/sse';
function stream(chunks: Uint8Array[]) { return new ReadableStream<Uint8Array>({ start(controller) { chunks.forEach(c => controller.enqueue(c)); controller.close(); } }); }
async function collect(source: ReadableStream<Uint8Array>, signal = new AbortController().signal) { const result = []; for await (const frame of sseData(source, signal)) result.push(frame); return result; }
describe('SSE', () => {
  it('handles every possible byte split, CRLF, UTF-8 and comments', async () => {
    const bytes = new TextEncoder().encode(': heartbeat\r\n\r\ndata: {"choices":[{"delta":{"content":"你好"}}]}\r\n\r\ndata: [DONE]\r\n\r\n');
    for (let i = 1; i < bytes.length; i++) {
      const frames = await collect(stream([bytes.slice(0, i), bytes.slice(i)]));
      expect(frames.map(parseDelta)).toEqual([{ text: '你好', finished: false }, { text: '', finished: true }]);
    }
  });
  it('joins multi-line data and flushes trailing event', async () => {
    expect(await collect(stream([new TextEncoder().encode('data: first\ndata: second\n\ndata: final')]))).toEqual(['first\nsecond', 'final']);
  });
  it('supports role-only and finish chunks', () => {
    expect(parseDelta('{"choices":[{"delta":{"role":"assistant"}}]}').text).toBe('');
    expect(parseDelta('{"choices":[{"delta":{},"finish_reason":"stop"}]}').finished).toBe(true);
  });
  it('rejects malformed payloads and provider errors without reflecting them', () => {
    expect(() => parseDelta('invalid')).toThrow('无效');
    expect(() => parseDelta('{"error":{"message":"SECRET"}}')).toThrow('模型服务');
    expect(() => parseDelta('{"choices":[{"finish_reason":"length"}]}')).toThrow('上限');
  });
  it('cancels a blocked reader promptly', async () => {
    const controller = new AbortController();
    const iterator = collect(new ReadableStream({ start() {} }), controller.signal);
    controller.abort();
    await expect(iterator).rejects.toMatchObject({ name: 'AbortError' });
  });
});
