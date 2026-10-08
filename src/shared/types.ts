export type Action = 'translate' | 'summarize' | 'explain';
export type Scope = 'selection' | 'paragraph';
export type Theme = 'system' | 'light' | 'dark';
export type Provider = 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'qwen' | 'kimi' | 'custom';
export type UILanguage = 'en' | 'zh-CN';
export interface Preferences {
  uiLanguage: UILanguage;
  action: Action;
  language: string;
  theme: Theme;
  autoSelection: boolean;
  scope: Scope;
  disabledSites: string[];
  grantedSites: string[];
}
export const DEFAULT_PREFERENCES: Preferences = {
  uiLanguage: 'en', action: 'translate', language: '简体中文', theme: 'system', autoSelection: true,
  scope: 'selection', disabledSites: [], grantedSites: [],
};
export const ACTIONS: Record<Action, string> = { translate: '翻译', summarize: '总结', explain: '解释' };
export interface ModelConfig {
  id: string;
  name: string;
  provider: Provider;
  baseUrl: string;
  model: string;
  keyStorage: 'session' | 'local';
  temperature?: number;
  maxTokens: number;
}
export interface ModelView extends ModelConfig { hasKey: boolean }
export interface Settings { preferences: Preferences; models: ModelView[]; defaultModelId: string | null }
export interface Rect { x: number; y: number; width: number; height: number }
export interface SelectionSnapshot { text: string; paragraph?: string; rect: Rect; pageTitle: string }
export interface Message { id: string; role: 'user' | 'assistant'; content: string }
export interface Conversation {
  id: string;
  tabId: number;
  selection: SelectionSnapshot;
  action: Action;
  scope: Scope;
  language: string;
  modelId: string | null;
  modelName: string;
  messages: Message[];
  draft: string;
  status: 'idle' | 'generating' | 'error' | 'interrupted';
  error?: string;
  requestId?: string;
  updatedAt: number;
}
export interface ChatCommand {
  type: 'start' | 'ask' | 'retry' | 'stop' | 'draft' | 'action' | 'scope';
  conversationId?: string;
  selection?: SelectionSnapshot;
  text?: string;
  action?: Action;
  scope?: Scope;
}
export type ServerEvent =
  | { type: 'state'; conversation: Conversation | null }
  | { type: 'error'; error: string }
  | { type: 'preferences'; preferences: Preferences; modelName: string };
export interface ApiMessage { role: 'system' | 'user' | 'assistant'; content: string }
export const LIMITS = { selection: 12000, paragraph: 16000, question: 4000, output: 32000, history: 24000, turns: 12 };
