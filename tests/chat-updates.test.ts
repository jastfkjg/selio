import { afterEach, expect, it, vi } from 'vitest';
import { DraftQueue, applyProgress, progressEvent } from '../src/shared/chat-updates';
import { ConversationEngine } from '../src/background/conversations';
import { DEFAULT_PREFERENCES, type Conversation, type ServerEvent } from '../src/shared/types';

afterEach(() => vi.useRealTimers());
const selection = { text: 'source', pageTitle: 'Title', rect: { x: 0, y: 0, width: 1, height: 1 } };

it('shows the first token immediately, batches a burst, and flushes complete content on finish', async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const wait = new Promise<void>(resolve => { finish = resolve; });
  const publish = vi.fn();
  const progress = vi.fn((state: Conversation) => structuredClone(state.messages.at(-1)));
  const engine = new ConversationEngine({ publish, progress, generate: async () => ({ modelId: 'm', modelName: 'Model', stream: async function* () {
    for (let i = 0; i < 200; i++) yield 'word ';
    await wait;
    yield 'done';
  } }) });
  const state = engine.start(1, selection, DEFAULT_PREFERENCES, 'm');
  await vi.advanceTimersByTimeAsync(0);
  expect(progress).toHaveBeenCalledTimes(1);
  expect(progress.mock.results[0]?.value?.content).toBe('word ');
  await vi.advanceTimersByTimeAsync(40);
  expect(progress).toHaveBeenCalledTimes(2);
  expect(progress.mock.results[1]?.value?.content).toBe('word '.repeat(200));
  expect(publish).toHaveBeenCalledTimes(1);
  finish(); await vi.advanceTimersByTimeAsync(0);
  expect(publish.mock.calls.at(-1)?.[0]).toMatchObject({ status: 'idle', messages: [{ content: 'word '.repeat(200) + 'done', generation: { modelId: 'm' } }] });
  expect(state.status).toBe('idle');
  expect(vi.getTimerCount()).toBe(0);
});

it('stopping flushes buffered text and cancels late progress after replacement', async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const wait = new Promise<void>(resolve => { finish = resolve; });
  const publish = vi.fn();
  const progress = vi.fn();
  const engine = new ConversationEngine({ publish, progress, generate: async () => ({ modelId: 'm', modelName: 'Model', stream: async function* () { yield 'first'; yield ' buffered'; await wait; yield ' late'; } }) });
  const state = engine.start(1, selection, DEFAULT_PREFERENCES, 'm');
  await vi.advanceTimersByTimeAsync(0);
  engine.stop(1, state.id);
  expect(publish.mock.calls.at(-1)?.[0]).toMatchObject({ status: 'stopped', messages: [{ content: 'first buffered', stopped: true }] });
  engine.startChat(1, DEFAULT_PREFERENCES, 'm', state.id);
  progress.mockClear();
  finish(); await vi.advanceTimersByTimeAsync(100);
  expect(progress).not.toHaveBeenCalled();
  expect(engine.get(1)?.messages).toEqual([]);
});

it('applies only the active request update and preserves unrelated history and page identities', () => {
  const engine = new ConversationEngine({ publish: () => {}, generate: vi.fn() });
  const state = engine.startChat(1, DEFAULT_PREFERENCES, 'm');
  state.status = 'generating'; state.requestId = 'request';
  state.messages = [{ id: 'old', role: 'user', content: 'question' }, { id: 'answer', role: 'assistant', content: 'a', pageContext: { mode: 'full', chunkIds: [1], characters: 3 } }];
  const update: Extract<ServerEvent, { type: 'progress' }> = { type: 'progress', conversationId: state.id, requestId: 'request', message: { id: 'answer', role: 'assistant', content: 'abc' }, modelId: 'm', modelName: 'Model', updatedAt: 2 };
  const next = applyProgress(state, update)!;
  expect(next.messages[0]).toBe(state.messages[0]);
  expect(next.messages[1]?.pageContext).toBe(state.messages[1]?.pageContext);
  expect(next.messages[1]?.content).toBe('abc');
  expect(state.messages[1]?.content).toBe('a');
  expect(applyProgress(state, { ...update, requestId: 'old' })).toBe(state);
  expect(applyProgress(state, { ...update, conversationId: 'old' })).toBe(state);
  expect(applyProgress({ ...state, status: 'stopped' }, update)?.messages[1]?.content).toBe('a');
});

it('keeps streaming packets independent of page size and isolates them from later mutation', () => {
  const engine = new ConversationEngine({ publish: () => {}, generate: vi.fn() });
  const state = engine.startChat(1, DEFAULT_PREFERENCES, 'm');
  state.status = 'generating'; state.requestId = 'request';
  state.messages = [{ id: 'old', role: 'assistant', content: 'history '.repeat(2000) }, { id: 'answer', role: 'assistant', content: 'New answer', pageContext: { mode: 'retrieval', chunkIds: [1], characters: 1600 } }];
  state.page = { title: 'Long page', url: 'https://example.com', capturedAt: 1, method: 'readability', truncated: false, totalCharacters: 180000, chunks: [{ id: 1, heading: 'Source', text: 'x'.repeat(180000), start: 0, end: 180000 }] };
  const packet = progressEvent(state);
  expect(JSON.stringify(packet).length).toBeLessThan(JSON.stringify(state).length / 100);
  expect(packet).not.toHaveProperty('page');
  expect(packet).not.toHaveProperty('messages');
  state.messages[1]!.content = 'Changed';
  expect(packet.message.content).toBe('New answer');
});

it('coalesces typing, keeps the latest draft, and flushes before an action or exit', () => {
  vi.useFakeTimers();
  const post = vi.fn();
  const queue = new DraftQueue(post);
  for (const text of ['h', 'he', 'hello']) queue.send({ type: 'draft', text, conversationId: 'one', action: 'ask', scope: 'selection' });
  expect(post).not.toHaveBeenCalled();
  vi.advanceTimersByTime(200);
  expect(post).toHaveBeenCalledTimes(1);
  expect(post.mock.calls[0]?.[0].text).toBe('hello');
  queue.send({ type: 'draft', text: 'latest', conversationId: 'one' });
  queue.send({ type: 'ask', text: 'latest', conversationId: 'one' });
  expect(post.mock.calls.slice(-2).map(([command]) => command.type)).toEqual(['draft', 'ask']);
  queue.send({ type: 'draft', text: 'kept', conversationId: 'one' });
  queue.flush();
  expect(post.mock.calls.at(-1)?.[0].text).toBe('kept');
  expect(vi.getTimerCount()).toBe(0);
});

it('flushes the old branch before buffering a draft from a different conversation or scope', () => {
  vi.useFakeTimers();
  const post = vi.fn();
  const queue = new DraftQueue(post);
  queue.send({ type: 'draft', text: 'selection', conversationId: 'one', scope: 'selection' });
  queue.send({ type: 'draft', text: 'paragraph', conversationId: 'one', scope: 'paragraph' });
  queue.send({ type: 'draft', text: 'other', conversationId: 'two', scope: 'selection' });
  queue.flush();
  expect(post.mock.calls.map(([command]) => command.text)).toEqual(['selection', 'paragraph', 'other']);
});
