import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { ModelConfig } from '../src/shared/types';
const config: ModelConfig = { id: 'model', name: 'Model', provider: 'custom', baseUrl: 'https://example.com/v1', model: 'model', keyStorage: 'session', maxTokens: 2048 };
function area() {
  const data: Record<string, unknown> = {};
  return { data, get: vi.fn(async (key: string) => ({ [key]: data[key] })), set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(data, structuredClone(values)); }), remove: vi.fn(async (key: string) => { delete data[key]; }), setAccessLevel: vi.fn(async () => undefined) };
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
