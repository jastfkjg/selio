import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { streamUsage } from '../src/llm/usage';
import { openAICompatible } from '../src/llm/adapter';
import type { ModelConfig, TokenUsage } from '../src/shared/types';
const model: ModelConfig = { id: 'm', name: 'Mock', provider: 'openai', model: 'mock', baseUrl: 'https://example.com/v1', keyStorage: 'session', maxTokens: 200 };
it('reads usage after finish_reason, without summing cumulative reports', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response([
    { choices: [{ delta: { content: 'hello' }, finish_reason: null }] },
    { choices: [{ delta: {}, finish_reason: 'stop' }] },
    { choices: [], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, prompt_tokens_details: { cached_tokens: 40 } } },
  ].map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } }));
  vi.stubGlobal('fetch', fetch); const usage: TokenUsage[] = [];
  let text = ''; for await (const part of openAICompatible.stream(model, 'SECRET', [], new AbortController().signal, u => usage.push(u))) text += part;
  expect(text).toBe('hello'); expect(usage).toEqual([{ input: 100, output: 20, total: 120, cachedInput: 40 }]);
  expect(JSON.parse(fetch.mock.calls[0]![1].body).stream_options).toEqual({ include_usage: true });
});
it('merges Anthropic cumulative output with input and cache tokens', () => {
  const start = streamUsage(JSON.stringify({ type: 'message_start', message: { usage: { input_tokens: 30, output_tokens: 1, cache_read_input_tokens: 70, cache_creation_input_tokens: 10 } } }), true);
  const delta = streamUsage(JSON.stringify({ type: 'message_delta', usage: { output_tokens: 15 } }), true, start);
  expect(delta).toEqual({ input: 110, output: 15, total: 125, cachedInput: 70, cacheWrite: 10 });
  expect(streamUsage(JSON.stringify({ usage: { output_tokens: 15 } }), true, delta)).toEqual(delta);
});
it('keeps missing usage unknown and ignores invalid counters', () => {
  expect(streamUsage('data', false)).toBeUndefined();
  expect(streamUsage('{"choices":[]}', false)).toBeUndefined();
  expect(streamUsage('{"usage":{"prompt_tokens":-1,"completion_tokens":"2"}}', false)).toBeUndefined();
  expect(streamUsage('{"usage":{"prompt_tokens":0,"completion_tokens":0}}', false)).toEqual({ input: 0, output: 0, total: 0 });
});
let data: Record<string, unknown>;
beforeEach(() => {
  vi.resetModules(); data = {};
  vi.stubGlobal('chrome', { storage: { local: { get: async (key: string) => ({ [key]: data[key] }), set: async (values: object) => { Object.assign(data, structuredClone(values)); } } } });
});
afterEach(() => vi.unstubAllGlobals());
it('records private metadata only, recovers interrupted requests and clears without resurrection', async () => {
  const repo = await import('../src/background/usage');
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('data: {"choices":[{"delta":{"content":"PRIVATE ANSWER"}}]}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })));
  for await (const text of repo.trackedStream(model, 'SECRET', [{ role: 'user', content: 'PRIVATE QUESTION' }], new AbortController().signal, 'translate')) expect(text).toBe('PRIVATE ANSWER');
  expect(await repo.readUsage()).toMatchObject([{ status: 'completed', action: 'translate' }]);
  expect(JSON.stringify(data)).not.toMatch(/SECRET|PRIVATE/);
  const iterator = repo.trackedStream(model, 'SECRET', [], new AbortController().signal, 'test');
  await iterator.next();
  await repo.clearUsage(); await iterator.return(undefined); expect(await repo.readUsage()).toEqual([]);
  data.usageRecords = [{ id: 'interrupted', status: 'running' }];
  await repo.recoverUsage(); expect(await repo.readUsage()).toMatchObject([{ status: 'interrupted' }]);
});
it('serializes simultaneous requests and caps retained history', async () => {
  const repo = await import('../src/background/usage');
  data.usageRecords = Array.from({ length: 1000 }, (_, i) => ({ id: String(i), status: 'completed' }));
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })));
  const run = async () => { for await (const text of repo.trackedStream(model, 'SECRET', [], new AbortController().signal, 'test')) expect(text).toBe(''); };
  await Promise.all([run(), run()]);
  const records = await repo.readUsage(); expect(records).toHaveLength(1000); expect(records.slice(-2).every(r => r.modelId === 'm')).toBe(true);
  expect(new Set(records.map(r => r.id)).size).toBe(1000);
});
