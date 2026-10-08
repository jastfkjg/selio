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

describe('Anthropic Messages', () => {
  async function anthropicRun(events: unknown[], signal = new AbortController().signal) {
    const { anthropicMessages } = await import('../src/llm/adapter');
    const fetch = vi.fn().mockResolvedValue(new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } }));
    vi.stubGlobal('fetch', fetch);
    let result = '';
    for await (const part of anthropicMessages.stream({ ...model, provider: 'anthropic', model: 'claude-sonnet-4-6' }, 'SECRET', [{ role: 'system', content: 'Be helpful' }, { role: 'user', content: 'hello' }], signal)) result += part;
    return { result, request: fetch.mock.calls[0] };
  }
  it('uses native auth, top-level system instructions and text deltas only', async () => {
    const { result, request } = await anthropicRun([
      { type: 'message_start', message: { id: 'm' } },
      { type: 'ping' },
      { type: 'content_block_start', content_block: { type: 'text', text: 'Hello ' } },
      { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'private reasoning' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'world' } },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
      { type: 'message_stop' },
    ]);
    expect(result).toBe('Hello world');
    expect(request![0]).toBe('https://api.example.com/v1/messages');
    const init = request![1];
    expect(init.headers).toMatchObject({ 'x-api-key': 'SECRET', 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' });
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(init.redirect).toBe('error'); expect(init.credentials).toBe('omit');
    expect(JSON.parse(init.body)).toMatchObject({ system: 'Be helpful', messages: [{ role: 'user', content: 'hello' }], max_tokens: 2048, stream: true });
    expect(init.body).not.toContain('SECRET');
  });
  it('rejects streams that end without message_stop', async () => {
    await expect(anthropicRun([{ type: 'content_block_delta', delta: { type: 'text_delta', text: 'partial' } }])).rejects.toMatchObject({ code: 'truncated' });
  });
  it('reports output limits and redacts provider error payloads', async () => {
    await expect(anthropicRun([{ type: 'message_delta', delta: { stop_reason: 'max_tokens' } }])).rejects.toMatchObject({ code: 'length' });
    await expect(anthropicRun([{ type: 'error', error: { message: 'SECRET' } }])).rejects.toMatchObject({ code: 'stream_error' });
    await expect(anthropicRun([{ type: 'error', error: { message: 'SECRET' } }])).rejects.not.toThrow('SECRET');
  });
});

it('uses Kimi K2.5 instant mode without affecting other compatible providers', async () => {
  const { adapterFor } = await import('../src/llm/adapter');
  for (const provider of ['kimi', 'gemini', 'qwen'] as const) {
    const fetch = vi.fn().mockResolvedValue(new Response('data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } }));
    vi.stubGlobal('fetch', fetch);
    for await (const part of adapterFor(provider).stream({ ...model, provider, model: 'kimi-k2.5' }, 'SECRET', [], new AbortController().signal)) expect(part).toBe('');
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    if (provider === 'kimi') { expect(body.thinking).toEqual({ type: 'disabled' }); expect(body.temperature).toBe(0.6); }
    else { expect(body).not.toHaveProperty('thinking'); expect(body).not.toHaveProperty('temperature'); }
  }
});
