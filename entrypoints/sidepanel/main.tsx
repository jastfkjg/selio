import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { Bookmark, MessageSquare } from 'lucide-react';
import { NotesList } from '../../src/components/NotesList';
import { Chat } from '../../src/components/Chat';
import { useChat } from '../../src/hooks/useChat';
import { useTheme } from '../../src/hooks/useTheme';
import '../../src/styles.css';
import { translator } from '../../src/shared/i18n';
import { usePageLanguage } from '../../src/hooks/useLanguage';
import { rpc } from '../../src/shared/rpc';
import { DEFAULT_PREFERENCES, type Preferences } from '../../src/shared/types';
function PanelChat({ tabId }: { tabId: number }) {
  const session = useChat(tabId);
  const [loading, setLoading] = useState(false);
  const attempted = useRef(false);
  const load = async (ensure = false) => {
    setLoading(true); session.setError('');
    try { await rpc('page:load', { tabId, conversationId: session.conversation?.id, ensure }); }
    catch (error) { session.setError(error instanceof Error ? error.message : '未能提取正文。'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    if (!session.connected || attempted.current) return;
    attempted.current = true;
    if (!session.conversation) void load(true);
  });
  const theme = useTheme(session.preferences.theme);
  usePageLanguage(session.preferences.uiLanguage, translator(session.preferences.uiLanguage)('阅读助手'));
  return <div className="selio-root" data-theme={theme}><Chat panel session={session} pageTools={{ loading, onLoad: () => void load() }}/></div>;
}
function Panel() {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const t = translator(preferences.uiLanguage);
  const theme = useTheme(preferences.theme);
  const [view, setView] = useState<'chat' | 'notes'>('chat');
  useEffect(() => {
    const refresh = () => { void rpc<Preferences>('public:preferences').then(setPreferences).catch(() => undefined); };
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => { if (area === 'local' && changes.settings) refresh(); };
    refresh(); chrome.storage.onChanged.addListener(changed);
    return () => chrome.storage.onChanged.removeListener(changed);
  }, []);
  const [tabId, setTabId] = useState<number | null>(null);
  useEffect(() => {
    let disposed = false;
    let windowId: number | undefined;
    let revision = 0;
    const update = async () => {
      const request = ++revision;
      const window = await chrome.windows.getCurrent(); windowId = window.id;
      const tabs = await chrome.tabs.query({ active: true, windowId });
      if (!disposed && request === revision) setTabId(tabs[0]?.id ?? null);
    };
    void update();
    const activated = (info: { tabId: number; windowId: number }) => {
      if (windowId === undefined) { void update(); return; }
      if (info.windowId === windowId) { revision++; setTabId(info.tabId); }
    };
    chrome.tabs.onActivated.addListener(activated);
    return () => { disposed = true; chrome.tabs.onActivated.removeListener(activated); };
  }, []);
  return <div className="selio-root panel-shell" data-theme={theme} lang={preferences.uiLanguage}>
    <nav className="panel-navigation" aria-label={t('侧边栏导航')}><button aria-pressed={view === 'chat'} onClick={() => setView('chat')}><MessageSquare size={15}/>{t('阅读助手')}</button><button aria-pressed={view === 'notes'} onClick={() => setView('notes')}><Bookmark size={15}/>{t('收藏笔记')}</button></nav>
    <div className="panel-chat-view" hidden={view !== 'chat'}>{tabId !== null ? <PanelChat key={tabId} tabId={tabId}/> : <div className="chat-empty"><p>{t("请打开一个网页，开始阅读。")}</p></div>}</div>
    {view === 'notes' && <NotesList language={preferences.uiLanguage}/>}
  </div>;
}
createRoot(document.getElementById('root')!).render(<Panel/>);
