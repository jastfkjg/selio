import { LIMITS, type Conversation, type SelectionSnapshot, type Preferences, type Action, type Scope, type ApiMessage, type PromptAction } from '../shared/types';
import { builtinAction, validatePrompt } from '../shared/actions';
import { sanitizeSnapshot, cleanText } from '../shared/validation';
import { selectPageContext } from '../page/context';
import type { PageSnapshot } from '../shared/types';
import { buildMessages } from '../llm/prompts';
import { ApiError, errorMessage } from '../llm/errors';

export interface GenerationContext { modelId: string; modelName: string; stream: (messages: ApiMessage[], signal: AbortSignal) => AsyncIterable<string> }
interface EngineDependencies {
  generate: (modelId: string | null, action: Action, actionName?: string) => Promise<GenerationContext>;
  publish: (conversation: Conversation) => void;
}
/** One owner per tab, with request identity checked after every async boundary. */
export class ConversationEngine {
  states = new Map<number, Conversation>();
  private running = new Map<number, AbortController>();
  constructor(private dependencies: EngineDependencies) {}
  restore(state: Conversation) {
    if (state.status === 'interrupted' && state.error === '生成已停止，已保留收到的内容。') {
      state.status = 'stopped'; delete state.error;
      const answer = state.messages.at(-1);
      if (answer?.role === 'assistant') answer.stopped = true;
    }
    if (state.status === 'generating') {
      state.status = 'interrupted';
      state.error = '后台连接已重启，已保留最近内容。点击重新生成继续。';
      delete state.requestId;
    }
    this.states.set(state.tabId, state);
  }
  get(tabId: number) { return this.states.get(tabId) ?? null; }
  private emit(state: Conversation) { state.updatedAt = Date.now(); this.dependencies.publish(structuredClone(state)); }
  private require(tabId: number, id: string | undefined): Conversation {
    const state = this.get(tabId);
    if (!state || state.id !== id) throw new Error('会话已切换，请在当前会话重试。');
    return state;
  }
  start(tabId: number, snapshot: SelectionSnapshot, preferences: Preferences, modelId: string | null, expectedId?: string, template?: PromptAction) {
    const existing = this.get(tabId);
    if (existing && existing.id !== expectedId) throw new Error('当前已有对话，请确认切换选中文字。');
    this.stop(tabId);
    const selection = sanitizeSnapshot(snapshot);
    if (preferences.scope !== 'paragraph') delete selection.paragraph;
    const state: Conversation = {
      id: crypto.randomUUID(), tabId, selection, action: preferences.action, scope: preferences.scope,
      language: preferences.language, modelId, modelName: '未配置模型', messages: [], draft: '', status: 'idle', updatedAt: Date.now(),
    };
    this.states.set(tabId, state);
    this.prepare(state, template ?? builtinAction(state.action));
    return state;
  }
  startPage(tabId: number, page: PageSnapshot, preferences: Preferences, modelId: string | null, expectedId?: string) {
    const existing = this.get(tabId);
    if (existing && existing.id !== expectedId) throw new Error('会话已切换，请在当前会话重试。');
    this.stop(tabId);
    const state: Conversation = {
      id: crypto.randomUUID(), tabId, page, action: 'summarize', scope: 'selection',
      selection: { text: '', pageTitle: page.title, rect: { x: 0, y: 0, width: 0, height: 0 } },
      language: preferences.language, modelId, modelName: '未配置模型', messages: [], draft: existing?.mode === 'general' ? existing.draft : '', status: 'idle', updatedAt: Date.now(),
    };
    this.states.set(tabId, state); this.emit(state);
    return state;
  }
  startChat(tabId: number, preferences: Preferences, modelId: string | null, expectedId?: string, pageError?: string) {
    const existing = this.get(tabId);
    if (existing && existing.id !== expectedId) throw new Error('会话已切换，请在当前会话重试。');
    this.stop(tabId);
    // A new context boundary also drops page-derived answers from outgoing history.
    const state: Conversation = {
      id: crypto.randomUUID(), tabId, mode: 'general', action: 'summarize', scope: 'selection',
      selection: { text: '', pageTitle: '', rect: { x: 0, y: 0, width: 0, height: 0 } },
      language: preferences.language, modelId, modelName: '未配置模型', messages: [],
      draft: existing?.draft ?? '', status: 'idle', updatedAt: Date.now(),
      ...(pageError ? { pageError } : {}),
    };
    this.states.set(tabId, state); this.emit(state);
    return state;
  }
  stalePage(tabId: number) {
    const state = this.get(tabId);
    if (!state?.page) return;
    this.stop(tabId); state.page.stale = true; this.emit(state);
  }
  setPageError(tabId: number, id: string, error?: string) {
    const state = this.require(tabId, id);
    if (error) state.pageError = error;
    else delete state.pageError;
    this.emit(state);
  }
  ask(tabId: number, id: string | undefined, text: string) {
    const state = this.require(tabId, id);
    if (state.page?.stale) throw new Error('网页已变化，请刷新正文后继续提问。');
    if (state.status === 'generating') throw new Error('请先停止当前生成。');
    if (state.status === 'editing') throw new Error('请先执行或取消 Prompt 编辑。');
    const question = cleanText(text, LIMITS.question);
    if (!question) throw new Error('请输入问题。');
    state.messages = state.messages.slice(-(LIMITS.turns * 2 - 2));
    while (state.messages.reduce((n, m) => n + m.content.length, 0) > 96000) state.messages.shift();
    state.messages.push({ id: crypto.randomUUID(), role: 'user', content: question });
    state.draft = '';
    this.begin(state);
  }
  retry(tabId: number, id: string | undefined) {
    const state = this.require(tabId, id);
    if (state.page?.stale) throw new Error('网页已变化，请刷新正文后继续提问。');
    if ((state.page || state.mode === 'general' || state.action === 'ask') && !state.messages.some(m => m.role === 'user')) return;
    if (state.status === 'editing') throw new Error('请先执行或取消 Prompt 编辑。');
    this.stop(tabId);
    if (state.messages.at(-1)?.role === 'assistant') state.messages.pop();
    this.begin(state);
  }
  change(tabId: number, id: string | undefined, action?: Action, scope?: Scope, paragraph?: string, template?: PromptAction) {
    const state = this.require(tabId, id);
    if (state.page || state.mode === 'general') throw new Error('网页问答不支持划词操作。');
    const nextAction = action ?? state.action;
    const sameAction = nextAction === state.action;
    const wasEditing = state.status === 'editing';
    const currentPrompt = wasEditing ? state.promptDraft : state.prompt;
    const nextScope = scope ?? state.scope;
    if (nextAction === state.action && nextScope === state.scope) return;
    this.stop(tabId);
    const branches = state.branches ??= {};
    branches[`${state.action}:${state.scope}`] = structuredClone({
      messages: state.messages, draft: state.draft, status: state.status, error: state.error,
      modelId: state.modelId, modelName: state.modelName, selection: state.selection,
      template: state.template, prompt: state.prompt, promptDraft: state.promptDraft, editingStatus: state.editingStatus,
    });
    state.action = nextAction; state.scope = nextScope;
    const cached = branches[`${nextAction}:${nextScope}`];
    const definition = template ?? (state.template?.id === nextAction ? state.template : builtinAction(nextAction));
    if (cached && (!definition || (cached.template?.prompt ?? builtinAction(nextAction)?.prompt) === definition.prompt)) {
      Object.assign(state, structuredClone(cached), { modelId: cached.template?.modelId ? cached.modelId : state.modelId, modelName: cached.template?.modelId ? cached.modelName : state.modelName });
      this.emit(state);
      return;
    }
    if (nextScope === 'paragraph') state.selection.paragraph = cleanText(paragraph || state.selection.paragraph || state.selection.text, LIMITS.paragraph);
    if (nextScope === 'selection') delete state.selection.paragraph;
    state.messages = []; state.draft = '';
    this.prepare(state, definition, sameAction ? currentPrompt : undefined, sameAction, sameAction && wasEditing);
  }


  private prepare(state: Conversation, template?: PromptAction, prompt?: string, preserveModel = false, defer = false) {
    if (!template) throw new Error('操作模板不存在。');
    state.template = structuredClone(template);
    state.prompt = prompt ?? template.prompt; state.promptDraft = state.prompt;
    if (!preserveModel) state.modelId = template.modelId ?? state.modelId;
    delete state.error; delete state.editingStatus;
    if (state.action === 'ask') { state.status = 'idle'; this.emit(state); }
    else if (defer || template.execution === 'edit') { state.status = 'editing'; this.emit(state); }
    else this.begin(state);
  }
  editPrompt(tabId: number, id: string | undefined) {
    const state = this.require(tabId, id);
    if (state.page || state.mode === 'general') throw new Error('网页问答不支持划词操作。');
    if (state.action === 'ask') throw new Error('Ask AI 仅在发送消息时请求模型。');
    if (state.status === 'generating') throw new Error('请先停止当前生成。');
    if (state.status === 'editing') return;
    state.editingStatus = state.status;
    state.promptDraft = state.prompt ?? state.template?.prompt ?? builtinAction(state.action)?.prompt ?? '';
    state.status = 'editing'; this.emit(state);
  }
  promptDraft(tabId: number, id: string | undefined, text: string) {
    const state = this.require(tabId, id);
    if (state.status !== 'editing') return;
    state.promptDraft = text.slice(0, 8000); this.emit(state);
  }
  cancelEdit(tabId: number, id: string | undefined) {
    const state = this.require(tabId, id);
    if (state.status !== 'editing') return;
    state.status = state.editingStatus ?? 'idle'; delete state.editingStatus; this.emit(state);
  }
  execute(tabId: number, id: string | undefined, text: string) {
    const state = this.require(tabId, id);
    if (state.action === 'ask') throw new Error('Ask AI 仅在发送消息时请求模型。');
    if (state.status !== 'editing') return;
    state.prompt = validatePrompt(text); state.promptDraft = state.prompt;
    state.messages = []; state.draft = ''; delete state.editingStatus;
    this.begin(state);
  }

  model(tabId: number, id: string | undefined, modelId: string, modelName: string) {
    const state = this.require(tabId, id);
    if (state.status === 'generating') throw new Error('请先停止当前生成。');
    state.modelId = modelId; state.modelName = modelName;
    delete state.error;
    if (state.status === 'error') state.status = 'idle';
    this.emit(state);
  }
  draft(tabId: number, id: string | undefined, text: string) {
    const state = this.require(tabId, id);
    state.draft = text.slice(0, LIMITS.question);
    this.emit(state);
  }
  stop(tabId: number, id?: string) {
    const state = this.get(tabId);
    if (id && state?.id !== id) return;
    this.running.get(tabId)?.abort();
    this.running.delete(tabId);
    if (state?.status === 'generating') {
      state.status = 'stopped';
      delete state.error;
      const answer = state.messages.at(-1);
      if (answer?.role === 'assistant') answer.stopped = true;
      delete state.requestId;
      this.emit(state);
    }
  }
  remove(tabId: number) { this.stop(tabId); this.states.delete(tabId); }
  clear() { for (const tabId of this.states.keys()) this.remove(tabId); }
  private begin(state: Conversation) {
    const controller = new AbortController();
    this.running.set(state.tabId, controller);
    state.requestId = crypto.randomUUID();
    state.status = 'generating';
    delete state.error;
    const requestId = state.requestId;
    if (state.page) {
      const questions = state.messages.filter(m => m.role === 'user');
      const question = questions.at(-1)?.content ?? '';
      state.pageContext = selectPageContext(state.page, question, questions.at(-2)?.content);
    }
    const messages = buildMessages(state);
    state.messages.push({ id: crypto.randomUUID(), role: 'assistant', content: '', ...(state.pageContext ? { pageContext: structuredClone(state.pageContext) } : {}) });
    this.emit(state);
    void this.run(state, requestId, messages, controller);
  }
  private async run(state: Conversation, requestId: string, messages: ApiMessage[], controller: AbortController) {
    const current = () => this.get(state.tabId)?.id === state.id && state.requestId === requestId && !controller.signal.aborted;
    try {
      const generation = await this.dependencies.generate(state.modelId, state.action, state.mode === 'general' ? 'AI Chat' : state.page ? 'Ask This Page' : state.template?.name);
      if (!current()) return;
      state.modelId = generation.modelId;
      state.modelName = generation.modelName;
      const answer = state.messages.at(-1)!;
      for await (const chunk of generation.stream(messages, controller.signal)) {
        if (!current()) return;
        answer.content += chunk.slice(0, LIMITS.output - answer.content.length);
        this.emit(state);
        if (answer.content.length >= LIMITS.output) throw new ApiError('limit', '回答已达到长度上限，请继续追问。');
      }
      if (!current()) return;
      if (!answer.content.trim()) throw new ApiError('empty', '模型没有返回文字，请检查模型是否支持 Chat Completions。');
      state.status = 'idle';
    } catch (error) {
      if (!current()) return;
      state.status = 'error';
      state.error = errorMessage(error);
    } finally {
      if (current()) {
        this.running.delete(state.tabId);
        delete state.requestId;
        this.emit(state);
      }
    }
  }
}
