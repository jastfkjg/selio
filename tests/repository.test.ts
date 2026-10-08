import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelConfig } from '../src/shared/types';
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
  const initial = await repo.settingsView(); expect(initial.actions.map(a => a.id)).toEqual(['translate', 'summarize', 'explain']);
  await repo.saveModel(config, 'SECRET');
  const action = { id: 'custom:tech' as const, name: 'Technical', icon: 'Code' as const, prompt: 'Explain {{selection}}', modelId: config.id, execution: 'edit' as const, showInQuickActions: false };
  await repo.saveAction(action);
  await repo.savePreferences({ ...initial.preferences, action: action.id });
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
