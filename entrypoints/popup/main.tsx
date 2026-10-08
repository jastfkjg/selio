import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { ArrowUpRight, PanelRightOpen, Settings2, ShieldCheck } from 'lucide-react';
import { Brand } from '../../src/components/Brand';
import { rpc } from '../../src/shared/rpc';
import { originPattern, siteDisabled } from '../../src/shared/validation';
import { ALL_SITES, type Settings } from '../../src/shared/types';
import { useTheme } from '../../src/hooks/useTheme';
import '../../src/styles.css';
import { translator } from '../../src/shared/i18n';
import { usePageLanguage, useSettingsUpdates } from '../../src/hooks/useLanguage';
function Popup() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const t = translator(settings?.preferences.uiLanguage);
  usePageLanguage(settings?.preferences.uiLanguage, t('阅读助手'));
  useSettingsUpdates(setSettings);
  const [tab, setTab] = useState<chrome.tabs.Tab>();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const theme = useTheme(settings?.preferences.theme ?? 'system');
  useEffect(() => { void rpc<Settings>('settings:get').then(setSettings).catch(e => setStatus(e.message)); void chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => setTab(tabs[0])); }, []);
  const ordinary = Boolean(tab?.url && /^https?:\/\//.test(tab.url));
  const granted = settings?.preferences.allSites || (tab?.url && settings?.preferences.grantedSites.includes(originPattern(tab.url)));
  const enabled = ordinary && !siteDisabled(new URL(tab!.url!).hostname, settings?.preferences.disabledSites ?? []);
  const autoEnabled = settings?.preferences.autoSelection ?? false;
  useEffect(() => {
    if (!enabled || !autoEnabled || tab?.id === undefined) return;
    // Opening the toolbar grants activeTab; no separate enable click is needed.
    void rpc('site:inject', { tabId: tab.id }).catch(() => undefined);
  }, [enabled, autoEnabled, tab?.id]);
  const toggleSite = async (value: boolean) => {
    if (!tab?.url) return;
    setBusy(true);
    try { setSettings(await rpc<Settings>('site:toggle', { url: tab.url, enabled: value })); }
    catch (error) { setStatus(error instanceof Error ? error.message : '未能启用。'); }
    finally { setBusy(false); }
  };
  const enable = async (persistent: boolean) => {
    if (!tab?.url || tab.id === undefined) return;
    setBusy(true);
    try {
      if (persistent) {
        const origin = originPattern(tab.url);
        const accepted = await chrome.permissions.request({ origins: [origin] });
        if (!accepted) { setStatus("未授权。你仍可通过右键菜单使用 Selio。"); return; }
        setSettings(await rpc<Settings>('site:add', tab.url));
      }
      await rpc('site:inject', { tabId: tab.id });
      setStatus("已就绪。回到网页，选中文字即可开始。");
    } catch (e) { setStatus(e instanceof Error ? e.message : "未能启用。"); }
    finally { setBusy(false); }
  };
  const enableAll = async () => {
    setBusy(true);
    try {
      if (!await chrome.permissions.request({ origins: ALL_SITES })) { setStatus('网站授权已取消。'); return; }
      setSettings(await rpc<Settings>('site:all', true));
      if (ordinary && tab?.id !== undefined) await rpc('site:inject', { tabId: tab.id });
      setStatus('已允许全部网站。其他已打开的网页刷新后生效。');
    } catch (error) { setStatus(error instanceof Error ? error.message : '授权失败。'); }
    finally { setBusy(false); }
  };
  return <main className="selio-root popup" data-theme={theme}><div className="popup-top"><Brand/><button className="icon-button" aria-label={t("打开设置")} onClick={() => void rpc('open:options')}><Settings2 size={18}/></button></div><h1>{t("划词，即刻理解。")}</h1><p>Select. Understand. Explore.</p>
    {!settings?.models.length && <div className="inline-status">{t("先连接你的模型，让阅读助手准备就绪。")}<button className="text-button" onClick={() => void rpc('open:options')}>{t("配置模型")} <ArrowUpRight size={13}/></button></div>}
    <div className="popup-site">{ordinary && tab?.url ? new URL(tab.url).hostname : t("此页面可能不支持网页内浮窗")}</div>
    {!settings?.preferences.allSites && <button className="button primary" disabled={busy} onClick={() => void enableAll()}><ShieldCheck size={15}/>{t('允许全部网站')}</button>}
    <label className="popup-site-toggle"><span>{t("在此网站使用 Selio")}</span><input type="checkbox" className="toggle" aria-label={t("在此网站使用 Selio")} checked={enabled} disabled={!settings || !ordinary || busy} onChange={e => void toggleSite(e.target.checked)}/></label>
    {!granted && <button className="button secondary" disabled={!ordinary || busy || !enabled} onClick={() => void enable(true)}>{t("允许此网站自动划词")}</button>}
    <button className="button secondary" disabled={tab?.id === undefined} onClick={() => void rpc('chat:pin', { tabId: tab?.id }).catch(e => setStatus(e.message))}><PanelRightOpen size={15}/>{t("打开阅读侧边栏")}</button>
    {status && <div className="inline-status" role="status">{t(status)}</div>}
    <div className="popup-foot"><span><ShieldCheck size={11}/>  {t("仅主动操作后发送文字")}</span><span>v0.1.0</span></div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Popup/>);
