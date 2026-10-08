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
    engine.stop(1, a.id); expect(a.status).toBe('stopped');
    expect(a.error).toBeUndefined(); expect(a.messages[0]?.stopped).toBe(true);
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

it('restores per-action history and drafts without another model call, including after worker restart', async () => {
  let calls = 0;
  const { engine, publish } = setup(async function* () { yield `answer ${++calls}`; });
  const state = engine.start(1, selection, DEFAULT_PREFERENCES, null); await tick();
  engine.ask(1, state.id, 'translate follow-up'); await tick();
  engine.draft(1, state.id, 'translate draft');
  const original = structuredClone(state.messages);
  engine.change(1, state.id, 'summarize'); await tick();
  expect(calls).toBe(3); expect(state.draft).toBe('');
  engine.draft(1, state.id, 'summary draft');
  engine.change(1, state.id, 'explain'); await tick(); expect(calls).toBe(4);
  engine.change(1, state.id, 'translate'); await tick();
  expect(calls).toBe(4); expect(state.messages).toEqual(original); expect(state.draft).toBe('translate draft');
  engine.change(1, state.id, 'translate'); await tick(); expect(calls).toBe(4);
  const recovered = setup(async function* () { calls++; yield 'unexpected'; }).engine;
  recovered.restore(publish.mock.calls.at(-1)![0]);
  recovered.change(1, state.id, 'summarize'); await tick();
  expect(calls).toBe(4); expect(recovered.get(1)?.draft).toBe('summary draft');
});
it('keeps selection and paragraph results separate and starts a fresh cache for a new selection', async () => {
  let calls = 0;
  const { engine } = setup(async function* () { yield `answer ${++calls}`; });
  const state = engine.start(1, selection, DEFAULT_PREFERENCES, null); await tick();
  engine.change(1, state.id, undefined, 'paragraph', 'paragraph context'); await tick();
  expect(calls).toBe(2); expect(state.selection.paragraph).toBe('paragraph context');
  engine.change(1, state.id, undefined, 'selection'); await tick();
  expect(calls).toBe(2); expect(state.selection.paragraph).toBeUndefined(); expect(state.messages[0]?.content).toBe('answer 1');
  engine.change(1, state.id, undefined, 'paragraph'); await tick();
  expect(calls).toBe(2); expect(state.selection.paragraph).toBe('paragraph context');
  const next = engine.start(1, { ...selection, text: 'different' }, DEFAULT_PREFERENCES, null, state.id); await tick();
  expect(calls).toBe(3); expect(next.branches).toBeUndefined();
});
it('never mixes late tokens into a different action or silently retries an interrupted cached action', async () => {
  let release: () => void = () => {};
  let calls = 0;
  const { engine } = setup(async function* () {
    if (++calls === 1) { yield 'partial'; await new Promise<void>(resolve => { release = resolve; }); yield 'stale'; }
    else yield 'summary';
  });
  const state = engine.start(1, selection, DEFAULT_PREFERENCES, null); await tick();
  engine.change(1, state.id, 'summarize'); await tick(); release(); await tick();
  expect(state.messages[0]?.content).toBe('summary');
  engine.change(1, state.id, 'translate'); await tick();
  expect(state.messages[0]?.content).toBe('partial'); expect(state.status).toBe('stopped'); expect(calls).toBe(2);
});

it('switches models without a request or history loss, retaining the choice across cached actions', async () => {
  const calls: { modelId: string | null; messages: ApiMessage[] }[] = [];
  const engine = new ConversationEngine({ publish: () => {}, generate: async modelId => ({ modelId: modelId!, modelName: modelId!, stream: async function* (messages) { calls.push({ modelId, messages }); yield 'answer'; } }) });
  const state = engine.start(1, selection, DEFAULT_PREFERENCES, 'first'); await tick();
  engine.change(1, state.id, 'summarize'); await tick();
  engine.draft(1, state.id, 'kept draft');
  const history = structuredClone(state.messages);
  engine.model(1, state.id, 'second', 'Second');
  expect(calls).toHaveLength(2); expect(state.messages).toEqual(history); expect(state.draft).toBe('kept draft');
  engine.change(1, state.id, 'translate');
  expect(state.modelId).toBe('second'); expect(calls).toHaveLength(2);
  engine.ask(1, state.id, 'follow up'); await tick();
  expect(calls.at(-1)?.modelId).toBe('second');
  expect(calls.at(-1)?.messages.map(m => m.role)).toEqual(['system', 'user', 'assistant', 'user']);
  expect(() => engine.model(1, 'stale', 'first', 'First')).toThrow('会话已切换');
});

it('restores legacy manual stops as a neutral inline state', async () => {
  const { engine } = setup(async function* () { yield 'partial'; });
  const state = engine.start(1, selection, DEFAULT_PREFERENCES, null); await tick();
  state.status = 'interrupted'; state.error = '生成已停止，已保留收到的内容。';
  engine.restore(state);
  expect(state.status).toBe('stopped'); expect(state.error).toBeUndefined();
  expect(state.messages[0]).toMatchObject({ content: 'partial', stopped: true });
});

it('waits for explicit execution, shares editor drafts, and preserves per-run prompts in cached branches', async () => {
  const calls: { modelId: string | null; messages: ApiMessage[] }[] = [];
  const template = { id: 'custom:tech' as const, name: 'Technical', icon: 'Code' as const, prompt: 'Explain {{selection}}', modelId: 'special', execution: 'edit' as const, showInQuickActions: true };
  const engine = new ConversationEngine({ publish: () => {}, generate: async modelId => ({ modelId: modelId!, modelName: modelId!, stream: async function* (messages) { calls.push({ modelId, messages }); yield 'custom answer'; } }) });
  const state = engine.start(1, selection, { ...DEFAULT_PREFERENCES, action: template.id }, 'default', undefined, template); await tick();
  expect(state.status).toBe('editing'); expect(calls).toHaveLength(0); expect(state.modelId).toBe('special');
  engine.promptDraft(1, state.id, 'Review {{selection}}');
  const recovered = new ConversationEngine({ publish: () => {}, generate: async () => { throw new Error('must not run'); } });
  recovered.restore(structuredClone(state)); expect(recovered.get(1)?.promptDraft).toBe('Review {{selection}}'); expect(recovered.get(1)?.status).toBe('editing');
  engine.cancelEdit(1, state.id); await tick(); expect(calls).toHaveLength(0);
  engine.editPrompt(1, state.id); engine.execute(1, state.id, 'Give a code example: {{selection}}'); await tick();
  expect(calls).toHaveLength(1); expect(calls[0]?.modelId).toBe('special'); expect(calls[0]?.messages[0]?.content).toContain('Give a code example');
  expect(template.prompt).toBe('Explain {{selection}}');
  engine.execute(1, state.id, 'duplicate {{selection}}'); await tick(); expect(calls).toHaveLength(1);
  engine.change(1, state.id, 'translate'); await tick();
  engine.change(1, state.id, template.id, undefined, undefined, template); await tick();
  expect(calls).toHaveLength(2); expect(state.prompt).toBe('Give a code example: {{selection}}'); expect(state.modelId).toBe('special');
  engine.editPrompt(1, state.id); engine.cancelEdit(1, state.id); expect(state.messages[0]?.content).toBe('custom answer');
});
it('uses a template model immediately and rebuilds a branch only when the saved prompt changes', async () => {
  let calls = 0;
  const template = { id: 'custom:tech' as const, name: 'Technical', icon: 'Code' as const, prompt: 'Explain {{selection}}', modelId: 'special', execution: 'direct' as const, showInQuickActions: true };
  const engine = new ConversationEngine({ publish: () => {}, generate: async modelId => ({ modelId: modelId!, modelName: modelId!, stream: async function* () { calls++; yield 'answer'; } }) });
  const state = engine.start(1, selection, DEFAULT_PREFERENCES, 'default'); await tick();
  engine.change(1, state.id, template.id, undefined, undefined, template); await tick(); expect(state.modelId).toBe('special');
  engine.change(1, state.id, 'translate'); await tick();
  engine.change(1, state.id, template.id, undefined, undefined, { ...template, prompt: 'Check logic: {{selection}}' }); await tick();
  expect(calls).toBe(3); expect(state.prompt).toBe('Check logic: {{selection}}');
});

it('changing scope while editing never runs the prompt or resets the selected model', async () => {
  let calls = 0;
  const engine = new ConversationEngine({ publish: () => {}, generate: async modelId => ({ modelId: modelId!, modelName: modelId!, stream: async function* () { calls++; yield 'answer'; } }) });
  const state = engine.start(1, selection, DEFAULT_PREFERENCES, 'default'); await tick();
  engine.editPrompt(1, state.id); engine.promptDraft(1, state.id, 'Edited {{selection}}');
  engine.model(1, state.id, 'other', 'Other');
  engine.change(1, state.id, undefined, 'paragraph', 'surrounding paragraph'); await tick();
  expect(calls).toBe(1); expect(state.status).toBe('editing'); expect(state.promptDraft).toBe('Edited {{selection}}'); expect(state.modelId).toBe('other');
  engine.execute(1, state.id, state.promptDraft!); await tick(); expect(calls).toBe(2);
});
