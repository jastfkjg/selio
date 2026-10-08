import { DEFAULT_PREFERENCES, type ModelConfig, type Settings, type Preferences } from '../shared/types';
import { validateModel, validatePreferences } from '../shared/validation';

interface Saved { preferences: Preferences; models: ModelConfig[]; defaultModelId: string | null }
let ready: Promise<void> | undefined;
export function protectStorage(): Promise<void> {
  return ready ??= Promise.all([
    chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
    chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }),
  ]).then(() => undefined);
}
export async function readSaved(): Promise<Saved> {
  await protectStorage();
  const { settings } = await chrome.storage.local.get('settings');
  const saved = (settings as Saved | undefined) ?? { models: [], defaultModelId: null };
  return { ...saved, preferences: { ...DEFAULT_PREFERENCES, ...('preferences' in saved ? saved.preferences : {}) } };
}
export async function readKey(model: ModelConfig): Promise<string> {
  await protectStorage();
  const area = model.keyStorage === 'local' ? chrome.storage.local : chrome.storage.session;
  const key = (await area.get(`key:${model.id}`))[`key:${model.id}`];
  return typeof key === 'string' ? key : '';
}
export async function settingsView(): Promise<Settings> {
  const saved = await readSaved();
  return { ...saved, models: await Promise.all(saved.models.map(async model => ({ ...model, hasKey: Boolean(await readKey(model)) }))) };
}
let writes = Promise.resolve();
export function mutateSettings(fn: (saved: Saved) => Promise<void>): Promise<void> {
  const operation = writes.then(async () => {
    const saved = await readSaved();
    await fn(saved);
    await chrome.storage.local.set({ settings: saved });
  });
  writes = operation.catch(() => undefined);
  return operation;
}
export async function saveModel(raw: ModelConfig, key?: string): Promise<void> {
  const model = validateModel(raw);
  if (key !== undefined && (typeof key !== 'string' || key.length > 4096 || /[\r\n]/.test(key))) throw new Error('API Key 格式无效。');
  await mutateSettings(async saved => {
    const previous = saved.models.find(m => m.id === model.id);
    if (!previous && saved.models.length >= 12) throw new Error('最多保存 12 个模型配置。');
    // Changing the destination must never silently send an existing secret to a new origin.
    const changedOrigin = previous && new URL(previous.baseUrl).origin !== new URL(model.baseUrl).origin;
    if (changedOrigin && !key?.trim()) throw new Error('API 来源已改变，请重新输入该来源的 API Key。');
    const secret = key?.trim() || (previous ? await readKey(previous) : '');
    if (!secret) throw new Error('请输入 API Key。默认仅在当前浏览器会话中保存。');
    const storage = model.keyStorage === 'local' ? chrome.storage.local : chrome.storage.session;
    const other = model.keyStorage === 'local' ? chrome.storage.session : chrome.storage.local;
    await storage.set({ [`key:${model.id}`]: secret });
    await other.remove(`key:${model.id}`);
    saved.models = [...saved.models.filter(m => m.id !== model.id), model];
    saved.defaultModelId ??= model.id;
  });
}
export const deleteModel = (id: string) => mutateSettings(async saved => {
  saved.models = saved.models.filter(m => m.id !== id);
  if (saved.defaultModelId === id) saved.defaultModelId = saved.models[0]?.id ?? null;
  await Promise.all([chrome.storage.local.remove(`key:${id}`), chrome.storage.session.remove(`key:${id}`)]);
});
export const savePreferences = (preferences: Preferences) => mutateSettings(async saved => {
  saved.preferences = { ...validatePreferences(preferences), grantedSites: saved.preferences.grantedSites };
});
export const setDefault = (id: string) => mutateSettings(async saved => {
  if (!saved.models.some(m => m.id === id)) throw new Error('模型配置不存在。');
  saved.defaultModelId = id;
});
