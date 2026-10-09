import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_ACTIONS } from '../src/shared/actions';
import { DEFAULT_PREFERENCES, type ChatCommand, type Conversation, type PageSnapshot, type ServerEvent } from '../src/shared/types';

vi.mock('wxt/utils/define-background', () => ({ defineBackground: (main: () => void) => ({ main }) }));
vi.mock('../src/background/usage', async importOriginal => ({
  ...await importOriginal<typeof import('../src/background/usage')>(),
  trackedStream: vi.fn(async function* () { yield 'Translated answer'; }),
}));

const tabId = 1;
const url = 'https://example.com/article';
const extractionError = '正文内容太少，无法可靠回答。请等待加载或换一个文章页面。';
const page: PageSnapshot = { title: 'Article', url, capturedAt: 1, method: 'semantic', totalCharacters: 124, truncated: false, chunks: [{ id: 1, heading: '', text: 'Article content', start: 0, end: 15 }] };
function selectionChat(): Conversation {
  return { id: 'selection-chat', tabId, selection: { text: 'Selected text', pageTitle: 'Article', pageUrl: url, rect: { x: 0, y: 0, width: 0, height: 0 } }, action: 'translate', scope: 'selection', language: '简体中文', modelId: 'model', modelName: 'Model', messages: [{ id: 'answer', role: 'assistant', content: 'Existing translation' }], draft: 'Kept draft', status: 'idle', updatedAt: 1 };
}
function event<T>() {
  const listeners: T[] = [];
  return { listeners, addListener: vi.fn((listener: T) => { listeners.push(listener); }) };
}
function area(data: Record<string, unknown> = {}) {
  return {
    get: vi.fn(async (key: string | null) => structuredClone(key === null ? data : { [key]: data[key] })),
    set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(data, structuredClone(values)); }),
    remove: vi.fn(async (key: string) => { delete data[key]; }),
    setAccessLevel: vi.fn(async () => undefined),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) };
}
async function setup(initial?: Conversation) {
  const mock = {
    storage: {
      local: area({ keyStorageVersion: 2, 'key:model': 'test-key', settings: { preferences: DEFAULT_PREFERENCES, actions: DEFAULT_ACTIONS, defaultModelId: 'model', models: [{ id: 'model', name: 'Model', model: 'test-model', provider: 'custom', baseUrl: 'https://api.example.com/v1', keyStorage: 'local', maxTokens: 2048 }] } }),
      session: area(initial ? { [`conversation:${tabId}`]: initial } : {}),
    },
    runtime: {
      id: 'selio', getURL: (file: string) => `chrome-extension://selio/${file}`,
      onInstalled: event<() => void>(), onConnect: event<(port: chrome.runtime.Port) => void>(),
      onMessage: event<(message: { type: string; payload: unknown }, sender: chrome.runtime.MessageSender, respond: (reply: { ok: boolean; error?: string }) => void) => void>(),
    },
    tabs: {
      query: vi.fn(async () => [{ id: tabId, url }]), get: vi.fn(async () => ({ id: tabId, url })),
      sendMessage: vi.fn(async (_tabId: number, message: { type: string }): Promise<{ page?: PageSnapshot; error?: string }> => message.type === 'selio:extract-page' ? { page } : {}),
      onRemoved: event<(id: number) => void>(), onUpdated: event<(id: number, info: { status?: string; url?: string }) => void>(),
    },
    action: { setTitle: vi.fn(), onClicked: event<(tab: { id: number; url: string }) => void>() },
    sidePanel: { open: vi.fn(async () => undefined) },
    scripting: { executeScript: vi.fn(async () => undefined), getRegisteredContentScripts: vi.fn(async () => []), registerContentScripts: vi.fn(), unregisterContentScripts: vi.fn() },
    permissions: { contains: vi.fn(async () => true), onAdded: event<() => void>(), onRemoved: event<() => void>() },
    contextMenus: { update: vi.fn(async () => undefined), onClicked: event<() => void>(), removeAll: vi.fn(), create: vi.fn() },
  };
  vi.stubGlobal('chrome', mock);
  const background = await import('../entrypoints/background');
  background.default.main();
  const port = {
    name: 'selio-chat', sender: { id: 'selio', url: mock.runtime.getURL('sidepanel.html') },
    onMessage: event<(message: ChatCommand | { type: 'subscribe'; tabId: number }) => void>(),
    onDisconnect: event<() => void>(), postMessage: vi.fn<(message: ServerEvent) => void>(),
  };
  mock.runtime.onConnect.listeners[0]!(port as unknown as chrome.runtime.Port);
  const send = (command: ChatCommand | { type: 'subscribe'; tabId: number }) => port.onMessage.listeners[0]!(command);
  send({ type: 'subscribe', tabId });
  await vi.waitFor(() => expect(port.postMessage.mock.calls.some(([event]) => event.type === 'preferences')).toBe(true));
  const state = () => port.postMessage.mock.calls.map(([event]) => event).filter(event => event.type === 'state').at(-1)?.conversation;
  const rpc = (type: string, payload: unknown) => new Promise<{ ok: boolean; error?: string }>(resolve => mock.runtime.onMessage.listeners[0]!({ type, payload }, port.sender, resolve));
  const extractionCalls = () => mock.tabs.sendMessage.mock.calls.filter(([, message]) => message.type === 'selio:extract-page');
  const errors = () => port.postMessage.mock.calls.filter(([event]) => event.type === 'error');
  return { mock, port, send, state, rpc, extractionCalls, errors };
}
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
afterEach(() => vi.unstubAllGlobals());

it('does not enable all-site selection from model setup until Chrome grants access', async () => {
  const app = await setup();
  const saved = (await app.mock.storage.local.get('settings')).settings as { models: import('../src/shared/types').ModelConfig[] };
  app.mock.permissions.contains.mockResolvedValue(false);
  expect(await app.rpc('settings:model', { model: saved.models[0], enableAllSites: true })).toEqual({ ok: false, error: '网站权限尚未授予。' });
  expect(((await app.mock.storage.local.get('settings')).settings as { preferences: { allSites: boolean } }).preferences.allSites).toBe(false);
  app.mock.permissions.contains.mockResolvedValue(true);
  expect(await app.rpc('settings:model', { model: saved.models[0], enableAllSites: true })).toEqual({ ok: true, data: expect.objectContaining({ preferences: expect.objectContaining({ allSites: true, autoSelection: true }) }) });
});

it.each(['selection', 'general'])('opening the toolbar preserves %s chat without extracting or generating', async mode => {
  const initial = selectionChat();
  if (mode === 'general') initial.mode = 'general';
  const app = await setup(initial);
  app.mock.action.onClicked.listeners[0]!({ id: tabId, url });
  await vi.waitFor(() => expect(app.mock.scripting.executeScript).toHaveBeenCalled());
  expect(app.mock.sidePanel.open).toHaveBeenCalledWith({ tabId });
  expect(app.mock.scripting.executeScript.mock.calls).toHaveLength(1);
  expect(app.extractionCalls()).toHaveLength(0);
  expect(app.state()).toEqual(initial);
  expect(app.errors()).toHaveLength(0);
  const { trackedStream } = await import('../src/background/usage');
  expect(trackedStream).not.toHaveBeenCalled();
});

it.each(['selection', 'page'])('an explicit extraction failure stays with the %s conversation and keeps its answer and draft', async mode => {
  const initial = selectionChat();
  if (mode === 'page') initial.page = page;
  const app = await setup(initial);
  app.mock.tabs.sendMessage.mockResolvedValue({ error: extractionError });
  expect(await app.rpc('page:load', { tabId, conversationId: initial.id })).toEqual({ ok: true });
  expect(app.state()).toMatchObject({ ...initial, updatedAt: expect.any(Number), pageError: extractionError });
  expect(app.errors()).toHaveLength(0);
  app.send({ type: 'start', conversationId: initial.id, selection: { ...initial.selection, text: 'A new selection' } });
  await vi.waitFor(() => expect(app.state()?.status).toBe('idle'));
  await vi.waitFor(() => expect(app.state()?.id).not.toBe(initial.id));
  expect(app.state()?.pageError).toBeUndefined();
});

it('a successful retry clears the page failure and creates page chat without a model request', async () => {
  const initial = { ...selectionChat(), pageError: extractionError };
  const app = await setup(initial);
  expect(await app.rpc('page:load', { tabId, conversationId: initial.id })).toEqual({ ok: true });
  expect(app.state()?.page).toEqual(page);
  expect(app.state()?.pageError).toBeUndefined();
  expect(app.state()?.messages).toEqual([]);
  expect(app.errors()).toHaveLength(0);
  const { trackedStream } = await import('../src/background/usage');
  expect(trackedStream).not.toHaveBeenCalled();
});

it('a first-visit extraction failure opens general chat with a page-specific reason', async () => {
  const app = await setup();
  app.mock.tabs.sendMessage.mockResolvedValue({ error: extractionError });
  expect(await app.rpc('page:load', { tabId, ensure: true })).toEqual({ ok: true });
  expect(app.state()).toMatchObject({ mode: 'general', pageError: extractionError, messages: [], status: 'idle' });
  expect(app.errors()).toHaveLength(0);
});

it.each([false, true])('discards late extraction results after a new selection starts (success: %s)', async success => {
  const app = await setup();
  const pending = deferred<{ page?: PageSnapshot; error?: string }>();
  app.mock.tabs.sendMessage.mockImplementation(async (_id, message) => message.type === 'selio:extract-page' ? pending.promise : {});
  const loading = app.rpc('page:load', { tabId, ensure: true });
  await vi.waitFor(() => expect(app.extractionCalls()).toHaveLength(1));
  app.send({ type: 'start', selection: selectionChat().selection });
  await vi.waitFor(() => expect(app.state()?.status).toBe('idle'));
  const selected = structuredClone(app.state());
  pending.resolve(success ? { page } : { error: extractionError });
  expect(await loading).toEqual({ ok: true });
  expect(app.state()).toEqual(selected);
  expect(app.errors()).toHaveLength(0);
});

it('a new conversation starts its own extraction instead of joining an older pending task', async () => {
  const initial = selectionChat();
  const app = await setup(initial);
  const pending = deferred<{ error: string }>();
  app.mock.tabs.sendMessage.mockImplementationOnce(() => pending.promise);
  const oldLoad = app.rpc('page:load', { tabId, conversationId: initial.id });
  await vi.waitFor(() => expect(app.extractionCalls()).toHaveLength(1));
  app.send({ type: 'start', conversationId: initial.id, selection: { ...initial.selection, text: 'New text' } });
  await vi.waitFor(() => expect(app.state()?.id).not.toBe(initial.id));
  const newId = app.state()!.id;
  expect(await app.rpc('page:load', { tabId, conversationId: newId })).toEqual({ ok: true });
  expect(app.extractionCalls()).toHaveLength(2);
  const loaded = structuredClone(app.state());
  expect(loaded?.page).toEqual(page);
  pending.resolve({ error: extractionError });
  expect(await oldLoad).toEqual({ ok: true });
  expect(app.state()).toEqual(loaded);
  expect(app.errors()).toHaveLength(0);
});

it.each([false, true])('discards extraction results after navigation (success: %s)', async success => {
  const initial = selectionChat();
  const app = await setup(initial);
  const pending = deferred<{ page?: PageSnapshot; error?: string }>();
  app.mock.tabs.sendMessage.mockImplementationOnce(() => pending.promise);
  const loading = app.rpc('page:load', { tabId, conversationId: initial.id });
  await vi.waitFor(() => expect(app.extractionCalls()).toHaveLength(1));
  app.mock.tabs.onUpdated.listeners[0]!(tabId, { status: 'loading' });
  pending.resolve(success ? { page } : { error: extractionError });
  expect(await loading).toEqual({ ok: true });
  expect(app.state()?.id).toBe(initial.id);
  expect(app.state()?.pageError).toBeUndefined();
  expect(app.state()?.page).toBeUndefined();
  expect(app.errors()).toHaveLength(0);
});
