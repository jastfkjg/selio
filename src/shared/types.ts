export type BuiltinAction = 'translate' | 'summarize' | 'explain';
export type Action = BuiltinAction | `custom:${string}`;
export type ActionIcon = 'Languages' | 'ListFilter' | 'Sparkles' | 'Code' | 'Pencil' | 'BookOpen' | 'Table' | 'Search' | 'MessageSquare' | 'Lightbulb';
export interface PromptAction {
  id: Action; name: string; icon: ActionIcon; prompt: string; modelId: string | null;
  showInQuickActions: boolean; execution: 'direct' | 'edit';
}
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
  allSites: boolean;
  scope: Scope;
  disabledSites: string[];
  grantedSites: string[];
}
export const DEFAULT_PREFERENCES: Preferences = {
  uiLanguage: 'en', action: 'translate', language: '简体中文', theme: 'system', autoSelection: true, allSites: false,
  scope: 'selection', disabledSites: [], grantedSites: [],
};
export const ACTIONS: Record<BuiltinAction, string> = { translate: '翻译', summarize: '总结', explain: '解释' };
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
export type PublicModel = Pick<ModelConfig, 'id' | 'name' | 'provider' | 'model'>;
export interface Settings { actions: PromptAction[]; preferences: Preferences; models: ModelView[]; defaultModelId: string | null }
export interface Rect { x: number; y: number; width: number; height: number }
export interface SelectionSnapshot { text: string; paragraph?: string; rect: Rect; pageTitle: string }
export interface Message { id: string; role: 'user' | 'assistant'; content: string; stopped?: boolean }
export type ConversationBranch = Pick<Conversation, 'messages' | 'draft' | 'status' | 'error' | 'modelId' | 'modelName' | 'selection' | 'template' | 'prompt' | 'promptDraft' | 'editingStatus'>;
export interface Conversation {
  template?: PromptAction;
  prompt?: string;
  promptDraft?: string;
  editingStatus?: 'idle' | 'error' | 'interrupted' | 'stopped';
  branches?: Partial<Record<`${Action}:${Scope}`, ConversationBranch>>;
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
  status: 'idle' | 'generating' | 'error' | 'interrupted' | 'stopped' | 'editing';
  error?: string;
  requestId?: string;
  updatedAt: number;
}
export interface ChatCommand {
  type: 'start' | 'ask' | 'retry' | 'stop' | 'draft' | 'action' | 'scope' | 'model' | 'execute' | 'edit-prompt' | 'prompt-draft' | 'cancel-edit';
  modelId?: string;
  conversationId?: string;
  selection?: SelectionSnapshot;
  text?: string;
  action?: Action;
  scope?: Scope;
}
export type ServerEvent =
  | { type: 'state'; conversation: Conversation | null }
  | { type: 'error'; error: string }
  | { type: 'preferences'; preferences: Preferences; modelName: string; models: PublicModel[]; actions: PromptAction[] };
export interface ApiMessage { role: 'system' | 'user' | 'assistant'; content: string }
export const LIMITS = { selection: 12000, paragraph: 16000, question: 4000, output: 32000, history: 24000, turns: 12 };

export interface TokenUsage { input?: number; output?: number; total?: number; cachedInput?: number; cacheWrite?: number }
export interface UsageRecord {
  id: string; startedAt: number; finishedAt?: number; modelId: string; modelName: string;
  provider: Provider; model: string; action: Action | 'test'; actionName?: string;
  status: 'running' | 'completed' | 'cancelled' | 'error' | 'interrupted';
  usage?: TokenUsage;
}
export const ALL_SITES = ['https://*/*', 'http://*/*'];
