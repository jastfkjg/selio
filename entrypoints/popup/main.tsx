import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { ArrowUpRight, MousePointer2, PanelRightOpen, Settings2, ShieldCheck } from 'lucide-react';
import { Brand } from '../../src/components/Brand';
import { rpc } from '../../src/shared/rpc';
import { originPattern } from '../../src/shared/validation';
import type { Settings } from '../../src/shared/types';
import { useTheme } from '../../src/hooks/useTheme';
import '../../src/styles.css';
function Popup() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tab, setTab] = useState<chrome.tabs.Tab>();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const theme = useTheme(settings?.preferences.theme ?? 'system');
  useEffect(() => { void rpc<Settings>('settings:get').then(setSettings).catch(e => setStatus(e.message)); void chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => setTab(tabs[0])); }, []);
  const ordinary = Boolean(tab?.url && /^https?:\/\//.test(tab.url));
  const granted = tab?.url && settings?.preferences.grantedSites.includes(originPattern(tab.url));
  const enable = async (persistent: boolean) => {
    if (!tab?.url || tab.id === undefined) return;
    setBusy(true);
    try {
      if (persistent) {
        const origin = originPattern(tab.url);
        const accepted = await chrome.permissions.request({ origins: [origin] });
        if (!accepted) { setStatus('未授权。你仍可通过右键菜单使用 Selio。'); return; }
        setSettings(await rpc<Settings>('site:add', tab.url));
      }
      await rpc('site:inject', { tabId: tab.id });
      setStatus('已就绪。回到网页，选中文字即可开始。');
    } catch (e) { setStatus(e instanceof Error ? e.message : '未能启用。'); }
    finally { setBusy(false); }
  };
  return <main className="selio-root popup" data-theme={theme}><div className="popup-top"><Brand/><button className="icon-button" aria-label="打开设置" onClick={() => void rpc('open:options')}><Settings2 size={18}/></button></div><h1>划词，即刻理解。</h1><p>Select. Understand. Explore.</p>
    {!settings?.models.length && <div className="inline-status">先连接你的模型，让阅读助手准备就绪。<button className="text-button" onClick={() => void rpc('open:options')}>配置模型 <ArrowUpRight size={13}/></button></div>}
    <div className="popup-site">{ordinary && tab?.url ? new URL(tab.url).hostname : '此页面可能不支持网页内浮窗'}</div>
    <button className="button primary" disabled={!ordinary || busy} onClick={() => void enable(true)}><MousePointer2 size={15}/>{granted ? '在此网站使用 Selio' : '允许此网站自动划词'}</button>
    <button className="button secondary" disabled={!ordinary || busy} onClick={() => void enable(false)}>仅在当前页面启用</button>
    <button className="button secondary" disabled={tab?.id === undefined} onClick={() => void rpc('chat:pin', { tabId: tab?.id }).catch(e => setStatus(e.message))}><PanelRightOpen size={15}/>打开阅读侧边栏</button>
    {status && <div className="inline-status" role="status">{status}</div>}
    <div className="popup-foot"><span><ShieldCheck size={11}/> 仅主动操作后发送文字</span><span>v0.1.0</span></div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Popup/>);
