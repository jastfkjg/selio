import { defineBackground } from 'wxt/utils/define-background';
import { ConversationEngine } from '../src/background/conversations';
import { clearNotes, deleteNote, readNotes, saveAnswer, updateNote } from '../src/background/notes';
import { deleteAction, saveAction, deleteModel, mutateSettings, protectStorage, readKey, readSaved, saveModel, savePreferences, setDefault, settingsView } from '../src/background/repository';
import { translator } from '../src/shared/i18n';
import { clearUsage, readUsage, recoverUsage, trackedStream } from '../src/background/usage';
import { ApiError, errorMessage } from '../src/llm/errors';
import { isAction, originPattern, siteDisabled } from '../src/shared/validation';
import { ALL_SITES } from '../src/shared/types';
import type { ChatCommand, Conversation, PageSnapshot, SelectionSnapshot, ServerEvent } from '../src/shared/types';

export default defineBackground(() => {
  const ports = new Map<chrome.runtime.Port, number>();
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
  function post(port: chrome.runtime.Port, event: ServerEvent) {
    try { port.postMessage(event); } catch { ports.delete(port); }
  }
  const engine = new ConversationEngine({
    async generate(modelId, action, actionName) {
      const saved = await readSaved();
      const model = saved.models.find(m => m.id === modelId) ?? saved.models.find(m => m.id === saved.defaultModelId);
      if (!model) throw new ApiError('configuration', '先添加一个模型，即可开始阅读。请打开设置配置 API。');
      const key = await readKey(model);
      if (!key) throw new ApiError('key_missing', model.keyStorage === 'session' ? '会话密钥已过期，请在设置中重新输入 API Key。' : '未找到 API Key，请在设置中重新输入并保存。');
      if (!await chrome.permissions.contains({ origins: [originPattern(model.baseUrl)] })) throw new ApiError('permission', '尚未授权模型 API 来源，请在设置中编辑并保存模型以授权。');
      return { modelId: model.id, modelName: model.name, stream: (messages, signal) => trackedStream(model, key, messages, signal, action, actionName) };
    },
    publish(state) {
      persist(state);
      for (const [port, tabId] of ports) if (tabId === state.tabId) post(port, { type: 'state', conversation: state });
    },
  });
  const ready = protectStorage().then(async () => {
    await recoverUsage();
    const saved = await chrome.storage.session.get(null);
    const liveTabs = new Map((await chrome.tabs.query({})).map(t => [t.id, t]));
    for (const [key, value] of Object.entries(saved)) {
      if (!key.startsWith('conversation:')) continue;
      const state = value as Conversation;
      if (liveTabs.has(state.tabId)) {
        if (state.page && liveTabs.get(state.tabId)?.url !== state.page.url) state.page.stale = true;
        engine.restore(state);
      }
      else await chrome.storage.session.remove(key);
    }
  });
  const trusted = (sender: chrome.runtime.MessageSender, names = ['options.html', 'popup.html', 'sidepanel.html']) => sender.id === chrome.runtime.id && names.some(name => sender.url === chrome.runtime.getURL(name));
  const content = (sender: chrome.runtime.MessageSender) => sender.id === chrome.runtime.id && sender.tab?.id !== undefined && sender.frameId === 0 && /^https?:\/\//.test(sender.url ?? '');

  let syncQueue = Promise.resolve();
  function syncScripts() {
    const next = syncQueue.then(async () => {
      const { preferences } = await readSaved();
      if (preferences.allSites && !await chrome.permissions.contains({ origins: ALL_SITES })) {
        preferences.allSites = false;
        await mutateSettings(async saved => { saved.preferences.allSites = false; });
      }
      const validSites: string[] = [];
      for (const origin of preferences.grantedSites) {
        if (await chrome.permissions.contains({ origins: [origin] })) validSites.push(origin);
      }
      if (validSites.length !== preferences.grantedSites.length) await mutateSettings(async saved => {
        const revoked = preferences.grantedSites.filter(origin => !validSites.includes(origin));
        saved.preferences.grantedSites = saved.preferences.grantedSites.filter(origin => !revoked.includes(origin));
      });
      const matches = preferences.autoSelection ? preferences.allSites ? ALL_SITES : validSites : [];
      const registered = await chrome.scripting.getRegisteredContentScripts();
      if (registered.some(s => s.id === 'selio-selection')) await chrome.scripting.unregisterContentScripts({ ids: ['selio-selection'] });
      if (matches.length) await chrome.scripting.registerContentScripts([{ id: 'selio-selection', matches, js: ['content-scripts/content.js'], runAt: 'document_idle', persistAcrossSessions: true }]);
      const saved = await readSaved();
      void chrome.action.setTitle({ title: `Selio · ${translator(saved.preferences.uiLanguage)('阅读助手')}` });
      void chrome.contextMenus.update('selio-read', { title: translator(saved.preferences.uiLanguage)('用 Selio 理解选中文字') }).catch(() => undefined);
      for (const port of ports.keys()) post(port, { type: 'preferences', preferences: saved.preferences, modelName: saved.models.find(m => m.id === saved.defaultModelId)?.name ?? '未配置模型', models: saved.models.map(({ id, name, provider, model }) => ({ id, name, provider, model })), actions: saved.actions.map(({ id, name, icon, modelId, execution, showInQuickActions }) => ({ id, name, icon, modelId, execution, showInQuickActions })) });
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
      for (const tab of tabs) {
        if (tab.id === undefined) continue;
        void chrome.tabs.sendMessage(tab.id, { type: 'selio:revoked', origins: removed.origins ?? [] }).catch(() => undefined);
        if (tab.url && /^https?:\/\//.test(tab.url)) void chrome.permissions.contains({ origins: [originPattern(tab.url)] }).then(allowed => { if (allowed) return chrome.tabs.sendMessage(tab.id!, { type: 'selio:enabled' }).catch(() => undefined); });
      }
    });
  });

  const pageLoads = new Map<number, Promise<void>>();
  const navigationVersions = new Map<number, number>();
  function loadPage(tabId: number, expectedId?: string, reuse = false): Promise<void> {
    const pending = pageLoads.get(tabId);
    if (pending) return pending;
    const task = (async () => {
      await ready;
      const tab = await chrome.tabs.get(tabId);
      if (!tab.url) throw new Error('无法读取此网页。请点击浏览器工具栏的 Selio 图标授予当前页访问权限，或在设置中授权此网站。');
      if (!/^https?:\/\//.test(tab.url)) throw new Error('此页面无法提取正文，请在普通文章或文档网页使用。');
      const saved = await readSaved();
      if (siteDisabled(new URL(tab.url).hostname, saved.preferences.disabledSites)) throw new Error('此网站已停用 Selio，请在网站权限中启用后重试。');
      const current = engine.get(tabId);
      if (reuse && current?.page?.url === tab.url && !current.page.stale) return;
      const version = navigationVersions.get(tabId) ?? 0;
      try { await chrome.scripting.executeScript({ target: { tabId }, files: ['content-scripts/page-extractor.js'] }); }
      catch { throw new Error('无法读取此网页。请点击浏览器工具栏的 Selio 图标授予当前页访问权限，或在设置中授权此网站。'); }
      const result = await chrome.tabs.sendMessage(tabId, { type: 'selio:extract-page' }, { frameId: 0 }) as { page?: PageSnapshot; error?: string };
      if (!result.page) throw new Error(result.error || '未能提取正文。');
      const after = await chrome.tabs.get(tabId);
      if ((navigationVersions.get(tabId) ?? 0) !== version || after.url !== result.page.url) throw new Error('网页已变化，请刷新正文后继续提问。');
      engine.startPage(tabId, result.page, saved.preferences, current?.modelId ?? saved.defaultModelId, expectedId);
    })();
    pageLoads.set(tabId, task);
    void task.finally(() => { if (pageLoads.get(tabId) === task) pageLoads.delete(tabId); }).catch(() => undefined);
    return task;
  }
  chrome.action.onClicked.addListener(tab => {
    if (tab.id === undefined) return;
    const tabId = tab.id;
    // Keep this synchronous with the toolbar gesture, before extraction or storage work.
    void chrome.sidePanel.open({ tabId }).catch(() => undefined);
    void ready.then(async () => {
      const saved = await readSaved();
      if (saved.preferences.autoSelection && tab.url && /^https?:\/\//.test(tab.url) && !siteDisabled(new URL(tab.url).hostname, saved.preferences.disabledSites)) {
        void chrome.scripting.executeScript({ target: { tabId }, files: ['content-scripts/content.js'] }).catch(() => undefined);
      }
      await loadPage(tabId, engine.get(tabId)?.id, true);
    }).catch(error => {
      for (const [port, id] of ports) if (id === tabId) post(port, { type: 'error', error: error instanceof Error ? error.message : '未能提取正文。' });
    });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== 'selio-read' || tab?.id === undefined || !info.selectionText) return;
    // Must run before any await to preserve Chrome's user activation.
    void chrome.sidePanel.open({ tabId: tab.id }).catch(() => undefined);
    const tabId = tab.id;
    const selection: SelectionSnapshot = { text: info.selectionText.slice(0, 12000), rect: { x: 20, y: 20, width: 0, height: 0 }, pageTitle: tab.title ?? '', pageUrl: info.pageUrl ?? tab.url };
    void ready.then(async () => {
      const settings = await readSaved();
      engine.start(tabId, selection, { ...settings.preferences, scope: 'selection' }, settings.defaultModelId, engine.get(tabId)?.id, settings.actions.find(a => a.id === settings.preferences.action));
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
          const saved = await readSaved();
          post(port, { type: 'preferences', preferences: saved.preferences, modelName: saved.models.find(m => m.id === saved.defaultModelId)?.name ?? '未配置模型', models: saved.models.map(({ id, name, provider, model }) => ({ id, name, provider, model })), actions: saved.actions.map(({ id, name, icon, modelId, execution, showInQuickActions }) => ({ id, name, icon, modelId, execution, showInQuickActions })) });
        }).catch(() => post(port, { type: 'error', error: '该标签页已关闭。' }));
        return;
      }
      const tabId = ports.get(port);
      if (tabId === undefined) return;
      const command = message as ChatCommand;
      if (!trusted(port.sender ?? {}, ['sidepanel.html']) && engine.get(tabId)?.page && command.type !== 'start' && command.type !== 'stop') return;
      const previous = tabQueues.get(tabId) ?? ready;
      const next = previous.then(async () => {
        if (command.type === 'ask' || command.type === 'retry') {
          const state = engine.get(tabId);
          if (state?.page && (await chrome.tabs.get(tabId)).url !== state.page.url) engine.stalePage(tabId);
        }
        switch (command.type) {
          case 'start': {
            if (!command.selection) throw new Error('请先选中文字。');
            const saved = await readSaved();
            engine.start(tabId, command.selection, saved.preferences, saved.defaultModelId, command.conversationId, saved.actions.find(a => a.id === saved.preferences.action));
            break;
          }
          case 'model': {
            const saved = await readSaved();
            const model = saved.models.find(m => m.id === command.modelId);
            if (!model) throw new Error('模型配置不存在。');
            engine.model(tabId, command.conversationId, model.id, model.name);
            break;
          }
          case 'ask': if (typeof command.text === 'string') engine.ask(tabId, command.conversationId, command.text); break;
          case 'retry': engine.retry(tabId, command.conversationId); break;
          case 'stop': engine.stop(tabId, command.conversationId); break;
          case 'draft': if (typeof command.text === 'string') engine.draft(tabId, command.conversationId, command.text); break;
          case 'execute': if (typeof command.text === 'string') engine.execute(tabId, command.conversationId, command.text); break;
          case 'edit-prompt': engine.editPrompt(tabId, command.conversationId); break;
          case 'prompt-draft': if (typeof command.text === 'string') engine.promptDraft(tabId, command.conversationId, command.text); break;
          case 'cancel-edit': engine.cancelEdit(tabId, command.conversationId); break;
          case 'action': {
            if (!isAction(command.action)) throw new Error('操作模板无效。');
            const saved = await readSaved();
            const template = saved.actions.find(a => a.id === command.action);
            if (!template) throw new Error('操作模板不存在。');
            engine.change(tabId, command.conversationId, command.action, undefined, undefined, template);
            break;
          }
          case 'scope': {
            if (command.scope !== 'selection' && command.scope !== 'paragraph') break;
            let paragraph: string | undefined;
            if (command.scope === 'paragraph' && !engine.get(tabId)?.branches?.[`${engine.get(tabId)!.action}:paragraph`]) {
              const state = engine.get(tabId);
              const result = await chrome.tabs.sendMessage(tabId, { type: 'selio:paragraph', text: state?.selection.text }).catch(() => null);
              if (typeof result?.paragraph !== 'string') throw new Error('此选区的段落已不可用，请返回网页重新选择，或保持仅选中文字。');
              paragraph = result.paragraph;
            }
            engine.change(tabId, command.conversationId, undefined, command.scope, paragraph, engine.get(tabId)?.template);
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
      if (['notes:find', 'notes:save'].includes(message.type) && (content(sender) || trusted(sender, ['sidepanel.html']))) {
        const p = message.payload;
        const tabId = content(sender) ? sender.tab!.id! : p?.tabId;
        const state = engine.get(tabId);
        if (!state || state.id !== p?.conversationId || (content(sender) && state.page)) throw new Error('会话已切换，请在当前会话重试。');
        if (!state.messages.some(item => item.id === p?.messageId && item.role === 'assistant')) throw new Error('回答已变化，请在当前回答重试。');
        if (message.type === 'notes:find') return (await readNotes()).find(item => item.conversationId === state.id && item.messageId === p.messageId) ?? null;
        return saveAnswer(state, p.messageId, p.note, p.tags);
      }
      if (!trusted(sender)) throw new Error('此操作只能从 Selio 设置或扩展页面发起。');
      const p = message.payload;
      switch (message.type) {
        case 'notes:list': return readNotes();
        case 'notes:update': return updateNote(p?.id, p?.note, p?.tags);
        case 'notes:delete': return deleteNote(p?.id);
        case 'page:load': {
          if (!trusted(sender, ['sidepanel.html']) || !Number.isInteger(p?.tabId)) throw new Error('标签页无效。');
          if (p.ensure && engine.get(p.tabId)) return;
          await loadPage(p.tabId, p.conversationId);
          return;
        }
        case 'usage:get': return readUsage();
        case 'usage:clear': await clearUsage(); return [];
        case 'settings:get': return settingsView();
        case 'actions:save': await saveAction(p); break;
        case 'actions:delete': if (!isAction(p)) throw new Error('操作模板无效。'); await deleteAction(p); break;
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
            for await (const chunk of trackedStream({ ...model, maxTokens: 256 }, key, [{ role: 'user', content: 'Reply only with OK.' }], controller.signal, 'test')) {
              if (chunk.trim()) received = true;
            }
            if (!received) throw new ApiError('empty', 'API 未返回文字。');
          } catch (error) { throw new Error(errorMessage(error)); } finally { clearTimeout(timer); controller.abort(); }
          return '连接成功，流式响应正常。';
        }
        case 'site:all': {
          if (typeof p !== 'boolean') throw new Error('偏好设置无效。');
          if (p && !await chrome.permissions.contains({ origins: ALL_SITES })) throw new Error('网站权限尚未授予。');
          await mutateSettings(async saved => { saved.preferences.allSites = p; });
          if (!p) await chrome.permissions.remove({ origins: ALL_SITES });
          break;
        }
        case 'site:toggle': {
          if (typeof p?.url !== 'string' || typeof p?.enabled !== 'boolean') throw new Error('网站地址无效。');
          const url = new URL(p.url);
          if (!['https:', 'http:'].includes(url.protocol)) throw new Error('仅支持普通 HTTP/HTTPS 网站。');
          await mutateSettings(async saved => {
            const sites = saved.preferences.disabledSites;
            saved.preferences.disabledSites = p.enabled
              ? sites.filter(site => url.hostname !== site && !url.hostname.endsWith(`.${site}`))
              : [...new Set([...sites, url.hostname])].slice(-200);
          });
          break;
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
          for (const tabId of pageLoads.keys()) navigationVersions.set(tabId, (navigationVersions.get(tabId) ?? 0) + 1);
          engine.clear();
          for (const timer of saveTimers.values()) clearTimeout(timer);
          saveTimers.clear();
          await Promise.all(writeQueues.values());
          await clearUsage();
          await clearNotes();
          await chrome.storage.local.clear(); await chrome.storage.session.clear();
          await chrome.storage.local.set({ keyStorageVersion: 2 });
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
    navigationVersions.set(tabId, (navigationVersions.get(tabId) ?? 0) + 1);
    engine.remove(tabId);
    clearTimeout(saveTimers.get(tabId)); saveTimers.delete(tabId);
    void (writeQueues.get(tabId) ?? Promise.resolve()).then(() => chrome.storage.session.remove(`conversation:${tabId}`));
  });
  chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (info.status === 'loading' || info.url) {
      navigationVersions.set(tabId, (navigationVersions.get(tabId) ?? 0) + 1);
      engine.stop(tabId); engine.stalePage(tabId);
    }
  });
});
