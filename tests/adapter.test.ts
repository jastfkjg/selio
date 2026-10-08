import { afterEach, describe, expect, it, vi } from 'vitest';
import { openAICompatible } from '../src/llm/adapter';
import { errorMessage, httpError } from '../src/llm/errors';
import type { ModelConfig } from '../src/shared/types';
const model: ModelConfig = { id: 'id', name: 'mock', provider: 'custom', model: 'mock', baseUrl: 'https://api.example.com/v1', maxTokens: 2048, keyStorage: 'session' };
async function run(signal = new AbortController().signal) { let result = ''; for await (const part of openAICompatible.stream(model, 'SECRET', [{ role: 'user', content: 'hello' }], signal)) result += part; return result; }
afterEach(() => vi.unstubAllGlobals());
describe('provider adapter', () => {
  it('uses only configured endpoint, prevents redirects and excludes secret from body', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } }));
    vi.stubGlobal('fetch', fetch); expect(await run()).toBe('OK');
    expect(fetch.mock.calls[0]![0]).toBe('https://api.example.com/v1/chat/completions');
    const request = fetch.mock.calls[0]![1];
    expect(request.redirect).toBe('error'); expect(request.credentials).toBe('omit'); expect(request.body).not.toContain('SECRET'); expect(request.headers.Authorization).toBe('Bearer SECRET');
  });
  it.each([401, 402, 403, 404, 429, 500])('maps HTTP %i without exposing response body', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('SECRET PROVIDER PAYLOAD', { status })));
    await expect(run()).rejects.toThrow(httpError(status).message);
  });
  it('detects a truncated SSE response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n', { headers: { 'content-type': 'text/event-stream' } })));
    await expect(run()).rejects.toThrow('提前结束');
  });
  it('does not fetch if cancelled before connection', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const controller = new AbortController(); controller.abort();
    await expect(run(controller.signal)).rejects.toMatchObject({ name: 'AbortError' }); expect(fetch).not.toHaveBeenCalled();
  });
  it('does not reflect arbitrary network exception strings', () => { expect(errorMessage(new Error('SECRET URL'))).not.toContain('SECRET'); });
});
