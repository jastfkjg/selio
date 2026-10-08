import { describe, expect, it, vi } from 'vitest';
import { ConversationEngine } from '../src/background/conversations';
import { DEFAULT_PREFERENCES, type ApiMessage, type Conversation } from '../src/shared/types';
import { ApiError } from '../src/llm/errors';
const selection = { text: 'source', pageTitle: 'page', rect: { x: 0, y: 0, width: 2, height: 1 } };
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
function setup(stream: (messages: ApiMessage[], signal: AbortSignal) => AsyncIterable<string>) {
  const publish = vi.fn();
  const engine = new ConversationEngine({ generate: async () => ({ modelId: 'model', modelName: 'Mock', stream }), publish });
  return { engine, publish };
}
describe('conversation lifecycle', () => {
  it('streams initial action then includes source and history in follow-up', async () => {
    const requests: ApiMessage[][] = [];
    const { engine } = setup(async function* (messages) { requests.push(messages); yield 'Hello'; yield ' world'; });
    const state = engine.start(1, selection, DEFAULT_PREFERENCES, null);
    await tick(); expect(state.status).toBe('idle'); expect(state.messages[0]?.content).toBe('Hello world');
    engine.ask(1, state.id, 'Why?'); await tick();
    expect(requests[1]!.map(m => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
    expect(requests[1]!.at(-1)?.content).toBe('Why?');
  });
  it('isolates conversations and rejects stale commands', async () => {
    const { engine } = setup(async function* (messages) { yield messages[1]!.content; });
    const a = engine.start(1, selection, DEFAULT_PREFERENCES, null);
    const b = engine.start(2, { ...selection, text: 'other' }, DEFAULT_PREFERENCES, null);
    await tick();
    expect(a.messages[0]?.content).not.toContain('other'); expect(b.messages[0]?.content).toContain('other');
    expect(() => engine.ask(1, b.id, 'intrude')).toThrow('会话已切换');
    expect(() => engine.start(1, selection, DEFAULT_PREFERENCES, null)).toThrow('已有对话');
  });
  it('ignores late tokens after cancellation and replacement', async () => {
    let unblock: () => void = () => {};
    let call = 0;
    const { engine } = setup(async function* () { if (++call === 1) { yield 'old'; await new Promise<void>(resolve => { unblock = resolve; }); yield 'STALE'; } else yield 'new'; });
    const a = engine.start(1, selection, DEFAULT_PREFERENCES, null); await tick();
    engine.stop(1, a.id); expect(a.status).toBe('interrupted');
    const b = engine.start(1, selection, DEFAULT_PREFERENCES, null, a.id); await tick(); unblock(); await tick();
    expect(b.messages[0]?.content).toBe('new'); expect(a.messages[0]?.content).toBe('old');
  });
  it('retains partial answers on error and retries without duplicate user messages', async () => {
    let failed = true;
    const { engine } = setup(async function* () { yield 'partial'; if (failed) throw new ApiError('network', 'Please retry'); });
    const a = engine.start(1, selection, DEFAULT_PREFERENCES, null); await tick();
    expect(a.status).toBe('error'); expect(a.messages[0]?.content).toBe('partial');
    failed = false; engine.retry(1, a.id); await tick();
    expect(a.messages).toHaveLength(1); expect(a.status).toBe('idle');
  });
  it('preserves draft in shared snapshots and marks interrupted worker recovery', async () => {
    const { engine, publish } = setup(async function* () { yield 'answer'; });
    const state = engine.start(1, selection, DEFAULT_PREFERENCES, null); await tick(); engine.draft(1, state.id, 'draft');
    const snapshot = publish.mock.calls.at(-1)![0] as Conversation;
    expect(snapshot.draft).toBe('draft'); expect(snapshot).not.toBe(state);
    snapshot.status = 'generating'; engine.restore(snapshot);
    expect(engine.get(1)?.status).toBe('interrupted'); expect(engine.get(1)?.draft).toBe('draft');
  });
  it('bounds display history during long conversations', async () => {
    const { engine } = setup(async function* () { yield 'answer'; });
    const state = engine.start(1, selection, DEFAULT_PREFERENCES, null); await tick();
    for (let i = 0; i < 30; i++) { engine.ask(1, state.id, 'question'); await tick(); }
    expect(state.messages.length).toBeLessThanOrEqual(24);
  });
});
