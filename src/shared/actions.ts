import type { Action, ActionIcon, PromptAction } from './types';
import type { Translator } from './i18n';

export const ACTION_ICONS: ActionIcon[] = ['Languages', 'ListFilter', 'Sparkles', 'Code', 'Pencil', 'BookOpen', 'Table', 'Search', 'MessageSquare', 'Lightbulb'];
export const DEFAULT_ACTIONS: PromptAction[] = [
  { id: 'translate', name: '翻译', icon: 'Languages', prompt: 'Translate the selected text into {{language}}. Preserve meaning, formatting, and technical terminology. Return only the translation, without an introduction.\n\nContent: {{selection}}', modelId: null, showInQuickActions: true, execution: 'direct' },
  { id: 'summarize', name: '总结', icon: 'ListFilter', prompt: 'Summarize the selected text in {{language}}. Be concise; adapt detail to its length. Do not invent information absent from the source.\n\nContent: {{selection}}', modelId: null, showInQuickActions: true, execution: 'direct' },
  { id: 'explain', name: '解释', icon: 'Sparkles', prompt: 'Explain the selected concept or passage in {{language}}. Use a helpful example when useful. Clearly distinguish source facts from your own supplementary explanation.\n\nContent: {{selection}}', modelId: null, showInQuickActions: true, execution: 'direct' },
];
export const isActionId = (value: unknown): value is Action => typeof value === 'string' && (DEFAULT_ACTIONS.some(a => a.id === value) || /^custom:[\w-]{1,80}$/.test(value));
export const builtinAction = (id: Action) => DEFAULT_ACTIONS.find(a => a.id === id);
export function actionLabel(action: Pick<PromptAction, 'id' | 'name'>, t: Translator): string {
  return builtinAction(action.id)?.name === action.name ? t(action.name) : action.name;
}
export function validatePrompt(prompt: unknown): string {
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 8000) throw new Error('请输入 Prompt（最多 8000 字）。');
  if (!/{{\s*selection\s*}}/.test(prompt)) throw new Error('Prompt 需要包含 {{selection}}。');
  if ([...prompt.matchAll(/{{\s*([\w]+)\s*}}/g)].some(match => !['selection', 'language'].includes(match[1]!))) throw new Error('仅支持 {{selection}} 和 {{language}} 变量。');
  return prompt.trim();
}
export function validateAction(value: PromptAction): PromptAction {
  if (!value || !isActionId(value.id)) throw new Error('操作模板无效。');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 40) throw new Error('请输入操作名称（最多 40 字）。');
  if (!ACTION_ICONS.includes(value.icon)) throw new Error('请选择有效的图标。');
  if (value.modelId !== null && (typeof value.modelId !== 'string' || !/^[\w-]{1,80}$/.test(value.modelId))) throw new Error('模型配置不存在。');
  if (typeof value.showInQuickActions !== 'boolean' || !['direct', 'edit'].includes(value.execution)) throw new Error('操作模板无效。');
  return { id: value.id, name: value.name.trim(), icon: value.icon, prompt: validatePrompt(value.prompt), modelId: value.modelId, showInQuickActions: value.showInQuickActions, execution: value.execution };
}
/** Never evaluate template code or interpolate webpage text into a system message. */
export function resolvePrompt(template: string, selection: string, language: string): string {
  return template.replace(/{{\s*(selection|language)\s*}}/g, (_, variable: string) => variable === 'selection' ? selection : language);
}
