import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES, type ModelConfig } from '../src/shared/types';
import { DEFAULT_ACTIONS } from '../src/shared/actions';
const config: ModelConfig = { id: 'model', name: 'Model', provider: 'custom', baseUrl: 'https://example.com/v1', model: 'model', keyStorage: 'session', maxTokens: 2048 };
function area() {
  const data: Record<string, unknown> = {};
  return { data, get: vi.fn(async (key: string) => structuredClone({ [key]: data[key] })), set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(data, structuredClone(values)); }), remove: vi.fn(async (key: string) => { delete data[key]; }), setAccessLevel: vi.fn(async () => undefined) };
}
let local: ReturnType<typeof area>;
let session: ReturnType<typeof area>;
beforeEach(() => { vi.resetModules(); local = area(); session = area(); vi.stubGlobal('chrome', { storage: { local, session } }); });
afterEach(() => vi.unstubAllGlobals());
describe('trusted storage', () => {
  it('restricts both storage areas before storing a session key, and returns only hasKey', async () => {
    const repo = await import('../src/background/repository');
    await repo.saveModel(config, 'SECRET');
    expect(local.setAccessLevel).toHaveBeenCalledWith({ accessLevel: 'TRUSTED_CONTEXTS' });
    expect(session.setAccessLevel).toHaveBeenCalledWith({ accessLevel: 'TRUSTED_CONTEXTS' });
    expect(JSON.stringify(local.data)).not.toContain('SECRET');
    expect(session.data['key:model']).toBe('SECRET');
    const view = await repo.settingsView();
    expect(view.models[0]?.hasKey).toBe(true); expect(JSON.stringify(view)).not.toContain('SECRET');
  });
  it('moves key storage without leaving a copy in the previous location', async () => {
    const repo = await import('../src/background/repository');
    await repo.saveModel(config, 'SECRET'); await repo.saveModel({ ...config, keyStorage: 'local' });
    expect(local.data['key:model']).toBe('SECRET'); expect(session.data['key:model']).toBeUndefined();
    await repo.saveModel(config); expect(session.data['key:model']).toBe('SECRET'); expect(local.data['key:model']).toBeUndefined();
  });
  it('requires fresh credentials when changing API origin', async () => {
    const repo = await import('../src/background/repository'); await repo.saveModel(config, 'SECRET');
    await expect(repo.saveModel({ ...config, baseUrl: 'https://other.example/v1' })).rejects.toThrow('重新输入');
    expect((await repo.settingsView()).models[0]?.baseUrl).toBe(config.baseUrl);
  });
  it('serializes concurrent model writes and deletes both key locations', async () => {
    const repo = await import('../src/background/repository');
    await Promise.all([repo.saveModel(config, 'FIRST'), repo.saveModel({ ...config, id: 'two' }, 'SECOND')]);
    expect((await repo.settingsView()).models).toHaveLength(2);
    await repo.deleteModel('model');
    expect((await repo.settingsView()).defaultModelId).toBe('two');
    expect(local.data['key:model']).toBeUndefined(); expect(session.data['key:model']).toBeUndefined();
  });
});

it('migrates existing preferences to English without losing models, keys or answer language', async () => {
  const repo = await import('../src/background/repository');
  local.data.settings = { preferences: { action: 'explain', language: '日本語', theme: 'dark', autoSelection: false, scope: 'paragraph', disabledSites: ['example.com'], grantedSites: [] }, models: [config], defaultModelId: config.id };
  session.data['key:model'] = 'SECRET';
  const view = await repo.settingsView();
  expect(view.preferences).toMatchObject({ uiLanguage: 'en', language: '日本語', theme: 'dark', autoSelection: false });
  expect(view.models[0]).toEqual({ ...config, keyStorage: 'local', hasKey: true });
  await repo.savePreferences({ ...view.preferences, uiLanguage: 'zh-CN' });
  expect((await repo.settingsView()).preferences).toMatchObject({ uiLanguage: 'zh-CN', language: '日本語' });
  expect(await repo.readKey(view.models[0]!)).toBe('SECRET');
});

it('migrates legacy session keys once and keeps them after a restart', async () => {
  local.data.settings = { preferences: {}, models: [{ ...config }], defaultModelId: config.id };
  session.data['key:model'] = 'LEGACY';
  let repo = await import('../src/background/repository');
  let view = await repo.settingsView();
  expect(view.models[0]).toMatchObject({ keyStorage: 'local', hasKey: true });
  expect(session.data['key:model']).toBeUndefined();
  expect(local.data['key:model']).toBe('LEGACY');
  session = area(); vi.stubGlobal('chrome', { storage: { local, session } }); vi.resetModules();
  repo = await import('../src/background/repository'); view = await repo.settingsView();
  expect(view.models[0]?.hasKey).toBe(true);
  // An explicit session-only choice after upgrading remains session-only.
  await repo.saveModel({ ...config, keyStorage: 'session' });
  vi.resetModules(); repo = await import('../src/background/repository');
  expect((await repo.settingsView()).models[0]?.keyStorage).toBe('session');
  expect(local.data['key:model']).toBeUndefined();
});
it('updates expired legacy key settings without inventing a missing secret', async () => {
  local.data.settings = { preferences: {}, models: [{ ...config }], defaultModelId: config.id };
  const repo = await import('../src/background/repository');
  expect((await repo.settingsView()).models[0]).toMatchObject({ keyStorage: 'local', hasKey: false });
  expect(local.data['key:model']).toBeUndefined();
});

it('migrates actions, persists per-template controls, and repairs references after deletion', async () => {
  const repo = await import('../src/background/repository');
  const initial = await repo.settingsView(); expect(initial.actions.map(a => a.id)).toEqual(['translate', 'summarize', 'explain', 'ask']);
  await repo.saveModel(config, 'SECRET');
  const action = { id: 'custom:tech' as const, name: 'Technical', icon: 'Code' as const, prompt: 'Explain {{selection}}', modelId: config.id, execution: 'edit' as const, showInQuickActions: false };
  await repo.saveAction(action);
  await expect(repo.savePreferences({ ...initial.preferences, action: action.id })).rejects.toThrow('请先启用');
  vi.resetModules(); const recovered = await import('../src/background/repository');
  expect((await recovered.settingsView()).actions.at(-1)).toEqual(action);
  await recovered.deleteModel(config.id);
  expect((await recovered.settingsView()).actions.at(-1)?.modelId).toBeNull();
  await recovered.deleteAction(action.id);
  expect((await recovered.settingsView()).preferences.action).toBe('translate');
  await expect(recovered.deleteAction('translate')).rejects.toThrow('不能删除');
  await expect(recovered.saveAction({ ...action, modelId: 'missing' })).rejects.toThrow('模型配置不存在');
  await expect(recovered.savePreferences({ ...initial.preferences, action: 'custom:missing' })).rejects.toThrow('操作模板不存在');
});

it('adds Ask AI to existing actions without resetting edits, visibility, order or preferences', async () => {
  const actions = structuredClone(DEFAULT_ACTIONS.filter(action => action.id !== 'ask'));
  actions[0] = { ...actions[0]!, name: 'My translation', prompt: 'Keep terminology: {{selection}}', showInQuickActions: false };
  const custom = { ...actions[1]!, id: 'custom:kept' as const, name: 'Kept action', execution: 'edit' as const };
  actions.unshift(custom);
  local.data.settings = { preferences: { ...DEFAULT_PREFERENCES, action: custom.id }, actions, models: [], defaultModelId: null };
  const repo = await import('../src/background/repository');
  const upgraded = await repo.settingsView();
  expect(upgraded.actions.slice(0, actions.length)).toEqual(actions);
  expect(upgraded.actions.at(-1)).toMatchObject({ id: 'ask', execution: 'ask' });
  expect(upgraded.preferences.action).toBe(custom.id);
  await repo.saveAction({ ...upgraded.actions.at(-1)!, showInQuickActions: false });
  await expect(repo.savePreferences({ ...upgraded.preferences, action: 'ask' })).rejects.toThrow('请先启用');
  vi.resetModules();
  const recovered = await import('../src/background/repository');
  const view = await recovered.settingsView();
  expect(view.actions.filter(action => action.id === 'ask')).toHaveLength(1);
  expect(view.actions.at(-1)).toMatchObject({ id: 'ask', execution: 'ask', showInQuickActions: false });
  expect(view.actions.slice(0, actions.length)).toEqual(actions);
  expect(view.preferences.action).toBe(custom.id);
  await expect(recovered.deleteAction('ask')).rejects.toThrow('不能删除');
});

it.each(['local', 'session'] as const)('keeps the previous key readable if a move to %s fails before metadata commits', async target => {
  const repo = await import('../src/background/repository');
  const previous = { ...config, keyStorage: target === 'local' ? 'session' as const : 'local' as const };
  await repo.saveModel(previous, 'EXISTING');
  local.set.mockRejectedValueOnce(new Error('write interrupted'));
  await expect(repo.saveModel({ ...config, keyStorage: target })).rejects.toThrow('write interrupted');
  vi.resetModules();
  const recovered = await import('../src/background/repository');
  const view = await recovered.settingsView();
  expect(view.models[0]).toMatchObject({ keyStorage: previous.keyStorage, hasKey: true });
  expect(await recovered.readKey(view.models[0]!)).toBe('EXISTING');
  await recovered.saveModel({ ...config, keyStorage: target });
  expect((await recovered.settingsView()).models[0]).toMatchObject({ keyStorage: target, hasKey: true });
});
it('commits a persistent key with its model metadata and preserves it when the form submits a blank key', async () => {
  const repo = await import('../src/background/repository');
  await repo.saveModel({ ...config, keyStorage: 'local' }, 'PERSISTENT');
  const commit = local.set.mock.calls.find(([values]) => values.settings && values['key:model'] === 'PERSISTENT');
  expect(commit).toBeDefined();
  await repo.saveModel({ ...config, name: 'Renamed', keyStorage: 'local' }, '');
  session = area(); vi.stubGlobal('chrome', { storage: { local, session } }); vi.resetModules();
  const recovered = await import('../src/background/repository');
  expect((await recovered.settingsView()).models[0]).toMatchObject({ name: 'Renamed', keyStorage: 'local', hasKey: true });
});
it('commits first-model all-site selection with model settings and retains it after restart', async () => {
  const repo = await import('../src/background/repository');
  await repo.saveModel({ ...config, keyStorage: 'local' }, 'SECRET', true);
  const commit = local.set.mock.calls.find(([values]) => (values.settings as { preferences: { allSites: boolean } } | undefined)?.preferences.allSites);
  expect(commit?.[0]).toMatchObject({ 'key:model': 'SECRET', settings: { preferences: { allSites: true, autoSelection: true } } });
  vi.resetModules();
  const recovered = await import('../src/background/repository');
  expect((await recovered.settingsView()).preferences).toMatchObject({ allSites: true, autoSelection: true });
  await recovered.saveModel({ ...config, name: 'Renamed', keyStorage: 'local' });
  expect((await recovered.settingsView()).preferences.allSites).toBe(true);
});
it('defaults to all-site selection before configuring a model', async () => {
  const repo = await import('../src/background/repository');
  expect((await repo.settingsView()).preferences).toMatchObject({ allSites: true, autoSelection: true });
});
it('preserves an explicit all-site opt-out through model edits and restarts', async () => {
  const repo = await import('../src/background/repository');
  await repo.saveModel(config, 'SECRET', false);
  expect((await repo.settingsView()).preferences).toMatchObject({ allSites: false, autoSelection: true });
  vi.resetModules();
  const recovered = await import('../src/background/repository');
  await recovered.saveModel({ ...config, name: 'Renamed', keyStorage: 'local' });
  expect((await recovered.settingsView()).preferences.allSites).toBe(false);
});


it('preserves the legacy enabled default at the front, then persists user order and derives the default', async () => {
  local.data.settings = { preferences: { ...DEFAULT_PREFERENCES, action: 'ask' }, actions: structuredClone(DEFAULT_ACTIONS), models: [], defaultModelId: null };
  const repo = await import('../src/background/repository');
  expect((await repo.settingsView()).actions.map(action => action.id)).toEqual(['ask', 'translate', 'summarize', 'explain']);
  await repo.reorderActions(['summarize', 'ask', 'translate', 'explain']);
  await repo.saveAction({ ...DEFAULT_ACTIONS[1]!, showInQuickActions: false });
  vi.resetModules();
  const recovered = await import('../src/background/repository');
  const view = await recovered.settingsView();
  expect(view.actions.map(action => action.id)).toEqual(['summarize', 'ask', 'translate', 'explain']);
  expect(view.preferences.action).toBe('ask');
  await recovered.saveAction({ ...view.actions[0]!, showInQuickActions: true });
  expect((await recovered.settingsView()).preferences.action).toBe('summarize');
  await recovered.savePreferences({ ...view.preferences, action: 'explain' });
  expect((await recovered.settingsView()).actions.map(action => action.id)).toEqual(['explain', 'summarize', 'ask', 'translate']);
});

it('rejects incomplete, duplicate or stale reorder requests without losing actions', async () => {
  const repo = await import('../src/background/repository');
  const before = await repo.settingsView();
  for (const ids of [null, ['ask'], ['ask', 'ask', 'explain', 'translate'], ['ask', 'summarize', 'explain', 'custom:missing']]) {
    await expect(repo.reorderActions(ids)).rejects.toThrow('操作列表已变化');
    expect((await repo.settingsView()).actions).toEqual(before.actions);
  }
});

it('never re-enables disabled actions, including a legacy disabled default and an entirely disabled list', async () => {
  const actions = DEFAULT_ACTIONS.map(action => ({ ...action, showInQuickActions: action.id === 'summarize' }));
  local.data.settings = { preferences: { ...DEFAULT_PREFERENCES, action: 'ask' }, actions, models: [], defaultModelId: null };
  const repo = await import('../src/background/repository');
  expect((await repo.settingsView()).preferences.action).toBe('summarize');
  await repo.saveAction({ ...actions[1]!, showInQuickActions: false });
  const view = await repo.settingsView();
  expect(view.actions.every(action => !action.showInQuickActions)).toBe(true);
  await repo.savePreferences({ ...view.preferences, theme: 'dark' });
  await repo.reorderActions(['ask', 'explain', 'summarize', 'translate']);
  expect((await repo.settingsView()).actions.every(action => !action.showInQuickActions)).toBe(true);
  await repo.saveAction({ ...actions[3]!, showInQuickActions: true });
  expect((await repo.settingsView()).preferences.action).toBe('ask');
});

it('deleting the first custom action chooses the next enabled action', async () => {
  const repo = await import('../src/background/repository');
  await repo.saveAction({ ...DEFAULT_ACTIONS[0]!, id: 'custom:first' });
  await repo.reorderActions(['custom:first', 'ask', 'translate', 'summarize', 'explain']);
  expect((await repo.settingsView()).preferences.action).toBe('custom:first');
  await repo.deleteAction('custom:first');
  expect((await repo.settingsView()).preferences.action).toBe('ask');
});
