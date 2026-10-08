import { defineBackground } from 'wxt/utils/define-background';
import { ConversationEngine } from '../src/background/conversations';
import { deleteModel, mutateSettings, protectStorage, readKey, readSaved, saveModel, savePreferences, setDefault, settingsView } from '../src/background/repository';
import { translator } from '../src/shared/i18n';
import { adapterFor } from '../src/llm/adapter';
import { ApiError, errorMessage } from '../src/llm/errors';
import { isAction, originPattern } from '../src/shared/validation';
import type { ChatCommand, Conversation, SelectionSnapshot, ServerEvent } from '../src/shared/types';

export default defineBackground(() => {
  const ports = new Map<chrome.runtime.Port, number>();
  const pending = new Map<number, SelectionSnapshot>();
  const saveTimers = new Map<number, ReturnType<typeof setTimeout>>();
  const writeQueues = new Map<number, Promise<void>>();
  function persist(state: Conversation) {
    if (state.status === 'generating' && saveTimers.has(state.tabId)) return;
    clearTimeout(saveTimers.get(state.tabId));
    const save = () => {
      saveTimers.delete(state.tabId);
      const previous = writeQueues.get(state.tabId) ?? Promise.resolve();
      const next = previous.then(() => chrome.storage.session.set({ [`conversation:${state.tabId}`]: state })).catch(() => {
        for (const [port, id] of ports) if (id === state.tabId) post(port, { type: 'error', error: '浏览器会话存储已满，当前对话暂时无法恢复。可在设置中清除数据。' });
      });
      writeQueues.set(state.tabId, next);
    };
    if (state.status === 'generating') saveTimers.set(state.tabId, setTimeout(save, 400));
    else save();
  }
  function post(port: chrome.runtime.Port, event: ServerEvent | { type: 'proposal'; selection: SelectionSnapshot }) {
    try { port.postMessage(event); } catch { ports.delete(port); }
  }
  const engine = new ConversationEngine({
    async generate(modelId) {
      const saved = await readSaved();
      const model = saved.models.find(m => m.id === modelId) ?? saved.models.find(m => m.id === saved.defaultModelId);
      if (!model) throw new ApiError('configuration', '先添加一个模型，即可开始阅读。请打开设置配置 API。');
      const key = await readKey(model);
      if (!key) throw new ApiError('key_missing', '会话密钥已过期，请在设置中重新输入 API Key。');
      if (!await chrome.permissions.contains({ origins: [originPattern(model.baseUrl)] })) throw new ApiError('permission', '尚未授权模型 API 来源，请在设置中编辑并保存模型以授权。');
      return { modelId: model.id, modelName: model.name, stream: (messages, signal) => adapterFor(model.provider).stream(model, key, messages, signal) };
    },
    publish(state) {
      persist(state);
      for (const [port, tabId] of ports) if (tabId === state.tabId) post(port, { type: 'state', conversation: state });
    },
  });
  const ready = protectStorage().then(async () => {
    const saved = await chrome.storage.session.get(null);
    const liveTabs = new Set((await chrome.tabs.query({})).map(t => t.id));
    for (const [key, value] of Object.entries(saved)) {
      if (!key.startsWith('conversation:')) continue;
      const state = value as Conversation;
      if (liveTabs.has(state.tabId)) engine.restore(state);
      else await chrome.storage.session.remove(key);
    }
  });
  const trusted = (sender: chrome.runtime.MessageSender, names = ['options.html', 'popup.html', 'sidepanel.html']) => sender.id === chrome.runtime.id && names.some(name => sender.url === chrome.runtime.getURL(name));
  const content = (sender: chrome.runtime.MessageSender) => sender.id === chrome.runtime.id && sender.tab?.id !== undefined && sender.frameId === 0 && /^https?:\/\//.test(sender.url ?? '');

  let syncQueue = Promise.resolve();
  function syncScripts() {
    const next = syncQueue.then(async () => {
      const { preferences } = await readSaved();
      const matches = [];
      if (preferences.autoSelection) for (const origin of preferences.grantedSites) {
        if (await chrome.permissions.contains({ origins: [origin] })) matches.push(origin);
      }
      const registered = await chrome.scripting.getRegisteredContentScripts();
      if (registered.some(s => s.id === 'selio-selection')) await chrome.scripting.unregisterContentScripts({ ids: ['selio-selection'] });
      if (matches.length) await chrome.scripting.registerContentScripts([{ id: 'selio-selection', matches, js: ['content-scripts/content.js'], runAt: 'document_idle', persistAcrossSessions: true }]);
      const saved = await readSaved();
      void chrome.action.setTitle({ title: `Selio · ${translator(saved.preferences.uiLanguage)('阅读助手')}` });
      void chrome.contextMenus.update('selio-read', { title: translator(saved.preferences.uiLanguage)('用 Selio 理解选中文字') }).catch(() => undefined);
      for (const port of ports.keys()) post(port, { type: 'preferences', preferences: saved.preferences, modelName: saved.models.find(m => m.id === saved.defaultModelId)?.name ?? '未配置模型' });
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (tab.id === undefined) continue;
        void chrome.tabs.sendMessage(tab.id, { type: 'selio:preferences', preferences: saved.preferences }).catch(() => undefined);
      }
    });
    syncQueue = next.catch(() => undefined);
    return next;
  }
  void ready.then(syncScripts).catch(() => undefined);
  chrome.runtime.onInstalled.addListener(() => {
    void readSaved().then(async saved => { await chrome.contextMenus.removeAll(); chrome.contextMenus.create({ id: 'selio-read', title: translator(saved.preferences.uiLanguage)('用 Selio 理解选中文字'), contexts: ['selection'] }); });
  });
  chrome.permissions.onAdded.addListener(() => { void syncScripts(); });
  chrome.permissions.onRemoved.addListener(removed => {
    void syncScripts();
    void chrome.tabs.query({}).then(tabs => {
      for (const tab of tabs) if (tab.id !== undefined) void chrome.tabs.sendMessage(tab.id, { type: 'selio:revoked', origins: removed.origins ?? [] }).catch(() => undefined);
    });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== 'selio-read' || tab?.id === undefined || !info.selectionText) return;
    // Must run before any await to preserve Chrome's user activation.
    void chrome.sidePanel.open({ tabId: tab.id }).catch(() => undefined);
    const tabId = tab.id;
    const selection: SelectionSnapshot = { text: info.selectionText.slice(0, 12000), rect: { x: 20, y: 20, width: 0, height: 0 }, pageTitle: tab.title ?? '' };
    void ready.then(async () => {
      const settings = await readSaved();
      if (!engine.get(tabId)) engine.start(tabId, selection, { ...settings.preferences, scope: 'selection' }, settings.defaultModelId);
      else {
        pending.set(tabId, selection);
        for (const [port, id] of ports) if (id === tabId) post(port, { type: 'proposal', selection });
      }
    });
  });

  const tabQueues = new Map<number, Promise<void>>();
  chrome.runtime.onConnect.addListener(port => {
    if (port.name !== 'selio-chat' || (!trusted(port.sender ?? {}, ['sidepanel.html']) && !content(port.sender ?? {}))) { port.disconnect(); return; }
    port.onDisconnect.addListener(() => ports.delete(port));
    port.onMessage.addListener(message => {
      if (!message || typeof message !== 'object') return;
      if (message.type === 'ping') { post(port, { type: 'state', conversation: engine.get(ports.get(port) ?? -1) }); return; }
      if (message.type === 'subscribe') {
        const tabId = content(port.sender ?? {}) ? port.sender!.tab!.id! : message.tabId;
        if (!Number.isInteger(tabId) || tabId < 0) return;
        ports.set(port, tabId);
        void ready.then(async () => {
          if (ports.get(port) !== tabId) return;
          await chrome.tabs.get(tabId);
          post(port, { type: 'state', conversation: engine.get(tabId) });
          if (pending.has(tabId)) post(port, { type: 'proposal', selection: pending.get(tabId)! });
          const saved = await readSaved();
          post(port, { type: 'preferences', preferences: saved.preferences, modelName: saved.models.find(m => m.id === saved.defaultModelId)?.name ?? '未配置模型' });
        }).catch(() => post(port, { type: 'error', error: '该标签页已关闭。' }));
        return;
      }
      const tabId = ports.get(port);
      if (tabId === undefined) return;
      const command = message as ChatCommand;
      const previous = tabQueues.get(tabId) ?? ready;
      const next = previous.then(async () => {
        switch (command.type) {
          case 'start': {
            if (!command.selection) throw new Error('请先选中文字。');
            const saved = await readSaved();
            engine.start(tabId, command.selection, saved.preferences, saved.defaultModelId, command.conversationId);
            pending.delete(tabId);
            break;
          }
          case 'ask': if (typeof command.text === 'string') engine.ask(tabId, command.conversationId, command.text); break;
          case 'retry': engine.retry(tabId, command.conversationId); break;
          case 'stop': engine.stop(tabId, command.conversationId); break;
          case 'draft': if (typeof command.text === 'string') engine.draft(tabId, command.conversationId, command.text); break;
          case 'action': if (isAction(command.action)) engine.change(tabId, command.conversationId, command.action); break;
          case 'scope': {
            if (command.scope !== 'selection' && command.scope !== 'paragraph') break;
            let paragraph: string | undefined;
            if (command.scope === 'paragraph') {
              const state = engine.get(tabId);
              const result = await chrome.tabs.sendMessage(tabId, { type: 'selio:paragraph', text: state?.selection.text }).catch(() => null);
              if (typeof result?.paragraph !== 'string') throw new Error('此选区的段落已不可用，请返回网页重新选择，或保持仅选中文字。');
              paragraph = result.paragraph;
            }
            engine.change(tabId, command.conversationId, undefined, command.scope, paragraph);
          }
        }
      }).catch(error => post(port, { type: 'error', error: error instanceof Error ? error.message : '操作未完成，请重试。' }));
      tabQueues.set(tabId, next);
    });
  });

  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!message || typeof message.type !== 'string' || sender.id !== chrome.runtime.id) return;
    if (message.type === 'chat:pin') {
      const tabId = content(sender) ? sender.tab!.id : trusted(sender) ? message.payload?.tabId : undefined;
      if (!Number.isInteger(tabId)) { respond({ ok: false, error: '无法打开当前标签页的侧边栏。' }); return; }
      void chrome.sidePanel.open({ tabId }).then(() => respond({ ok: true }), () => respond({ ok: false, error: '侧边栏未能打开，请再次点击，或使用 Chrome 的侧边栏入口。' }));
      return true;
    }
    void (async () => {
      await ready;
      if (message.type === 'public:preferences' && (content(sender) || trusted(sender))) return (await readSaved()).preferences;
      if (message.type === 'open:options' && (content(sender) || trusted(sender))) return chrome.runtime.openOptionsPage();
      if (!trusted(sender)) throw new Error('此操作只能从 Selio 设置或扩展页面发起。');
      const p = message.payload;
      switch (message.type) {
        case 'settings:get': return settingsView();
        case 'settings:model': await saveModel(p?.model, p?.key); break;
        case 'settings:delete': if (typeof p !== 'string') throw new Error('模型无效。'); await deleteModel(p); break;
        case 'settings:default': if (typeof p !== 'string') throw new Error('模型无效。'); await setDefault(p); break;
        case 'settings:preferences': await savePreferences(p); break;
        case 'settings:test': {
          const saved = await readSaved();
          const model = saved.models.find(m => m.id === p);
          if (!model) throw new Error('请先保存模型配置。');
          const key = await readKey(model);
          if (!key) throw new Error('请重新输入并保存 API Key。');
          if (!await chrome.permissions.contains({ origins: [originPattern(model.baseUrl)] })) throw new Error('请先保存模型，授予 API 来源权限。');
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 20000);
          try {
            let received = false;
            for await (const chunk of adapterFor(model.provider).stream({ ...model, maxTokens: 256 }, key, [{ role: 'user', content: 'Reply only with OK.' }], controller.signal)) {
              if (chunk.trim()) { received = true; break; }
            }
            if (!received) throw new ApiError('empty', 'API 未返回文字。');
          } catch (error) { throw new Error(errorMessage(error)); } finally { clearTimeout(timer); controller.abort(); }
          return '连接成功，流式响应正常。';
        }
        case 'site:add': {
          if (typeof p !== 'string') throw new Error('网站地址无效。');
          const url = new URL(p);
          if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('仅支持普通 HTTP/HTTPS 网站。');
          const origin = originPattern(url.href);
          if (!await chrome.permissions.contains({ origins: [origin] })) throw new Error('网站权限尚未授予。');
          await mutateSettings(async saved => { saved.preferences.grantedSites = [...new Set([...saved.preferences.grantedSites, origin])].slice(-200); });
          break;
        }
        case 'site:remove': {
          if (typeof p !== 'string') throw new Error('网站地址无效。');
          const saved = await readSaved();
          if (!saved.preferences.grantedSites.includes(p)) throw new Error('网站不存在。');
          await mutateSettings(async s => { s.preferences.grantedSites = s.preferences.grantedSites.filter(site => site !== p); });
          await chrome.permissions.remove({ origins: [p] });
          break;
        }
        case 'site:inject': {
          if (!Number.isInteger(p?.tabId)) throw new Error('标签页无效。');
          try { await chrome.scripting.executeScript({ target: { tabId: p.tabId }, files: ['content-scripts/content.js'] }); }
          catch { throw new Error('此页面不允许扩展注入。请在普通网页使用；已有对话可在侧边栏继续。'); }
          void chrome.tabs.sendMessage(p.tabId, { type: 'selio:enabled' }).catch(() => undefined);
          return;
        }
        case 'data:clear': {
          engine.clear(); pending.clear();
          for (const timer of saveTimers.values()) clearTimeout(timer);
          saveTimers.clear();
          await Promise.all(writeQueues.values());
          await chrome.storage.local.clear(); await chrome.storage.session.clear();
          const permissions = await chrome.permissions.getAll();
          if (permissions.origins?.length) await chrome.permissions.remove({ origins: permissions.origins });
          for (const port of ports.keys()) post(port, { type: 'state', conversation: null });
          break;
        }
        default: throw new Error('不支持的操作。');
      }
      await syncScripts();
      return settingsView();
    })().then(data => respond({ ok: true, data }), error => respond({ ok: false, error: error instanceof Error ? error.message : '操作失败。' }));
    return true;
  });
  chrome.tabs.onRemoved.addListener(tabId => {
    engine.remove(tabId); pending.delete(tabId);
    clearTimeout(saveTimers.get(tabId)); saveTimers.delete(tabId);
    void (writeQueues.get(tabId) ?? Promise.resolve()).then(() => chrome.storage.session.remove(`conversation:${tabId}`));
  });
  chrome.tabs.onUpdated.addListener((tabId, info) => { if (info.status === 'loading') engine.stop(tabId); });
});
