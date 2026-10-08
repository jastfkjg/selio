import { DEFAULT_PREFERENCES, LIMITS, type Action, type ModelConfig, type Preferences, type SelectionSnapshot } from './types';
import { PROVIDER_IDS } from './providers';

export const isAction = (v: unknown): v is Action => v === 'translate' || v === 'summarize' || v === 'explain';
export function apiEndpoint(baseUrl: string, provider: ModelConfig['provider'] = 'custom'): string {
  let url: URL;
  try { url = new URL(baseUrl.trim()); } catch { throw new Error('请输入完整的 API Base URL。'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new Error('API 必须使用 HTTPS；本机 localhost 可使用 HTTP。');
  if (url.username || url.password || url.search || url.hash) throw new Error('Base URL 不能包含账号、查询参数或片段。');
  if (baseUrl.length > 1000) throw new Error('Base URL 过长。');
  const suffix = provider === 'anthropic' ? '/messages' : '/chat/completions';
  url.pathname = url.pathname.replace(/\/+$/, '').replace(provider === 'anthropic' ? /\/messages$/ : /\/chat\/completions$/, '') + suffix;
  return url.href;
}
export const originPattern = (url: string) => `${new URL(url).origin}/*`;
export function validateModel(value: ModelConfig): ModelConfig {
  if (!value || typeof value !== 'object') throw new Error('模型配置无效。');
  if (typeof value.id !== 'string' || !/^[\w-]{1,80}$/.test(value.id)) throw new Error('模型 ID 无效。');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80) throw new Error('请输入模型名称（最多 80 字）。');
  if (typeof value.model !== 'string' || !value.model.trim() || value.model.length > 150) throw new Error('请输入有效的模型标识。');
  if (!PROVIDER_IDS.includes(value.provider)) throw new Error('供应商无效。');
  if (!['session', 'local'].includes(value.keyStorage)) throw new Error('密钥保存方式无效。');
  if (typeof value.baseUrl !== 'string') throw new Error('Base URL 无效。');
  const endpoint = apiEndpoint(value.baseUrl, value.provider);
  if (!Number.isInteger(value.maxTokens) || value.maxTokens < 16 || value.maxTokens > 8192) throw new Error('输出上限应为 16–8192。');
  if (value.temperature !== undefined && (!Number.isFinite(value.temperature) || value.temperature < 0 || value.temperature > 2)) throw new Error('Temperature 应为 0–2。');
  if (value.provider === 'anthropic' && value.temperature !== undefined && value.temperature > 1) throw new Error('Anthropic Temperature 应为 0–1。');
  if (value.provider === 'kimi' && value.model.trim() === 'kimi-k2.5' && value.temperature !== undefined && value.temperature !== 0.6) throw new Error('Kimi K2.5 即时模式的 Temperature 固定为 0.6。');
  return { id: value.id, name: value.name.trim(), provider: value.provider, model: value.model.trim(), baseUrl: endpoint.replace(/\/(?:chat\/completions|messages)$/, ''), keyStorage: value.keyStorage, maxTokens: value.maxTokens, temperature: value.temperature };
}
export function validatePreferences(p: Preferences): Preferences {
  if (!p || !isAction(p.action) || !['selection', 'paragraph'].includes(p.scope) || !['light', 'dark', 'system'].includes(p.theme)) throw new Error('偏好设置无效。');
  if (p.uiLanguage !== undefined && !['en', 'zh-CN'].includes(p.uiLanguage)) throw new Error('界面语言无效。');
  if (typeof p.language !== 'string' || !p.language.trim() || p.language.length > 60) throw new Error('目标语言无效。');
  if (typeof p.autoSelection !== 'boolean') throw new Error('划词开关无效。');
  if (!Array.isArray(p.disabledSites) || p.disabledSites.length > 200 || p.disabledSites.some(s => typeof s !== 'string' || !/^[a-z0-9.-]+(:\d+)?$/i.test(s))) throw new Error('请输入网站域名，例如 example.com。');
  // Granted origins are managed by the permission workflow, never by a page payload.
  return { ...DEFAULT_PREFERENCES, uiLanguage: p.uiLanguage ?? 'en', action: p.action, language: p.language.trim(), theme: p.theme, scope: p.scope, autoSelection: p.autoSelection, disabledSites: [...new Set(p.disabledSites)], grantedSites: [] };
}
export function cleanText(text: string, limit: number): string {
  return text.replace(/\r\n?/g, '\n').replaceAll(String.fromCharCode(0), '').trim().slice(0, limit);
}
export function sanitizeSnapshot(value: SelectionSnapshot): SelectionSnapshot {
  if (!value || typeof value.text !== 'string') throw new Error('请先选中一段文字。');
  const text = cleanText(value.text, LIMITS.selection);
  if (!text) throw new Error('选中文字为空。');
  const r = value.rect;
  const rect = r && [r.x, r.y, r.width, r.height].every(Number.isFinite) ? { x: r.x, y: r.y, width: Math.max(0, r.width), height: Math.max(0, r.height) } : { x: 20, y: 20, width: 0, height: 0 };
  return { text, rect, pageTitle: typeof value.pageTitle === 'string' ? value.pageTitle.slice(0, 200) : '', ...(typeof value.paragraph === 'string' ? { paragraph: cleanText(value.paragraph, LIMITS.paragraph) } : {}) };
}
export function siteDisabled(host: string, sites: string[]): boolean {
  return sites.some(s => host === s || host.endsWith(`.${s}`));
}
