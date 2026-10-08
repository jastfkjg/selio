import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { Chat } from '../../src/components/Chat';
import { useChat } from '../../src/hooks/useChat';
import { useTheme } from '../../src/hooks/useTheme';
import '../../src/styles.css';
function PanelChat({ tabId }: { tabId: number }) {
  const session = useChat(tabId);
  const theme = useTheme(session.preferences.theme);
  return <div className="selio-root" data-theme={theme}><Chat panel session={session} pending={session.proposal} onAccept={() => { if (session.proposal) session.send({ type: 'start', selection: session.proposal }); session.clearProposal(); }} onDismiss={session.clearProposal}/></div>;
}
function Panel() {
  const [tabId, setTabId] = useState<number | null>(null);
  useEffect(() => {
    let disposed = false;
    let windowId: number | undefined;
    const update = async () => {
      const window = await chrome.windows.getCurrent(); windowId = window.id;
      const tabs = await chrome.tabs.query({ active: true, windowId });
      if (!disposed) setTabId(tabs[0]?.id ?? null);
    };
    void update();
    const activated = (info: { tabId: number; windowId: number }) => { if (info.windowId === windowId) setTabId(info.tabId); };
    chrome.tabs.onActivated.addListener(activated);
    return () => { disposed = true; chrome.tabs.onActivated.removeListener(activated); };
  }, []);
  return tabId !== null ? <PanelChat key={tabId} tabId={tabId}/> : <div className="chat-empty"><p>请打开一个网页，开始阅读。</p></div>;
}
createRoot(document.getElementById('root')!).render(<Panel/>);
