import { UsagePage } from '../../src/components/UsagePage';
import { Select } from '../../src/components/Select';
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { BarChart3, Check, ChevronRight, Cpu, Eye, EyeOff, Globe2, LockKeyhole, Pencil, Plus, Settings2, Shield, ShieldCheck, Trash2, X, Zap } from 'lucide-react';
import { Brand } from '../../src/components/Brand';
import { useTheme } from '../../src/hooks/useTheme';
import { rpc } from '../../src/shared/rpc';
import { apiEndpoint, originPattern, validateModel } from '../../src/shared/validation';
import { ALL_SITES, ACTIONS, type ModelConfig, type ModelView, type Preferences, type Settings } from '../../src/shared/types';
import '../../src/styles.css';
import { translator, type Translator } from '../../src/shared/i18n';
import { usePageLanguage, useSettingsUpdates } from '../../src/hooks/useLanguage';
import { ProviderPicker } from '../../src/components/ProviderPicker';
import { providerPreset } from '../../src/shared/providers';

function newModel(): ModelConfig { return { id: crypto.randomUUID(), provider: 'openai', ...providerPreset('openai'), keyStorage: 'session', maxTokens: 2048 }; }
type Feedback = { text: string; failed?: boolean };
function ModelForm({ model, onSaved, onCancel, t }: { t: Translator; model: ModelView | null; onSaved: (settings: Settings) => void; onCancel: () => void }) {
  const [form, setForm] = useState<ModelConfig>(() => model ?? newModel());
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const update = <K extends keyof ModelConfig>(field: K, value: ModelConfig[K]) => setForm(previous => ({ ...previous, [field]: value }));
  const save = async () => {
    setFeedback(null);
    try {
      const config = validateModel(form);
      if (!key.trim() && !model?.hasKey) throw new Error("请输入 API Key。");
      // This request starts in the submit gesture, before asynchronous storage work.
      const permission = chrome.permissions.request({ origins: [originPattern(apiEndpoint(config.baseUrl, config.provider))] });
      setBusy(true);
      if (!await permission) throw new Error("需要此 API 来源权限才能调用模型。配置尚未保存。");
      const settings = await rpc<Settings>('settings:model', { model: config, ...(key.trim() ? { key } : {}) });
      setKey(''); onSaved(settings);
    } catch (e) { setFeedback({ text: e instanceof Error ? e.message : "保存失败。", failed: true }); }
    finally { setBusy(false); }
  };
  return <form className="model-form" onSubmit={e => { e.preventDefault(); void save(); }} autoComplete="off"><div className="form-heading"><h2>{model ? t("编辑模型") : t("连接一个模型")}</h2><button type="button" className="icon-button" aria-label={t("关闭模型编辑")} onClick={onCancel}><X size={17}/></button></div>
    <div className="form-grid"><div className="field"><ProviderPicker label={t("供应商")} value={form.provider} onChange={provider => { setForm({ ...form, provider, ...providerPreset(provider), temperature: undefined }); setKey(''); }}/></div><div className="field"><label htmlFor="model-name">{t("显示名称")}</label><input id="model-name" required maxLength={80} value={form.name} onChange={e => update('name', e.target.value)} placeholder={t("例如：日常阅读")}/></div></div>
    <div className="field"><label htmlFor="base-url">Base URL</label><input id="base-url" type="url" required value={form.baseUrl} onChange={e => update('baseUrl', e.target.value)} placeholder="https://api.example.com/v1" spellCheck={false}/><small>{form.provider === 'anthropic' ? t("使用 Anthropic Messages 接口，自动补全 /messages。") : t("使用 Chat Completions 接口，自动补全 /chat/completions。")}</small>{(form.provider === 'qwen' || form.provider === 'kimi') && <small>{t("API 地址与密钥需属于同一区域。中国大陆账户请修改 Base URL：")}<code>{form.provider === 'qwen' ? 'https://dashscope.aliyuncs.com/compatible-mode/v1' : 'https://api.moonshot.cn/v1'}</code></small>}</div>
    <div className="field"><label htmlFor="model-id">{t("模型标识")}</label><input id="model-id" required value={form.model} onChange={e => update('model', e.target.value)} placeholder={t("供应商提供的模型 ID")} spellCheck={false}/></div>
    <div className="field"><label htmlFor="api-key">API Key {model?.hasKey && <span className="default-label">{t("已保存")}</span>}</label><div className="key-field"><input id="api-key" type={showKey ? 'text' : 'password'} value={key} onChange={e => setKey(e.target.value)} placeholder={model?.hasKey ? t("留空保留现有密钥") : t("输入你的 API Key")} autoComplete="new-password" spellCheck={false}/><button type="button" className="icon-button" aria-label={showKey ? t("隐藏密钥") : t("显示密钥")} onClick={() => setShowKey(!showKey)}>{showKey ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></div>
    <div className="field"><label htmlFor="key-storage">{t("密钥保存方式")}</label><Select id="key-storage" value={form.keyStorage} onChange={e => update('keyStorage', e.target.value as 'session' | 'local')}><option value="session">{t("仅本次浏览器会话 · 推荐")}</option><option value="local">{t("保存在这台设备上")}</option></Select><small>{form.keyStorage === 'session' ? t("关闭浏览器、停用或重新加载扩展后，需要重新输入。") : t("以明文保存在扩展本地存储中，未加密。拥有本机访问权限的人可能读取。不会同步到云端。")}</small></div>
    {form.provider === 'kimi' && form.model === 'kimi-k2.5' && <p className="form-hint">{t("Kimi K2.5 使用即时模式，Temperature 固定为 0.6。")}</p>}<details className="form-details"><summary>{t("高级参数")}</summary><div className="form-grid"><div className="field"><label htmlFor="temperature">{t("Temperature · 可选")}</label><input id="temperature" type="number" min="0" max={form.provider === 'anthropic' ? 1 : 2} step="0.1" value={form.temperature ?? ''} onChange={e => update('temperature', e.target.value === '' ? undefined : Number(e.target.value))} placeholder={t("使用模型默认值")} disabled={form.provider === 'kimi' && form.model === 'kimi-k2.5'}/></div><div className="field"><label htmlFor="max-tokens">{t("最大输出 Tokens")}</label><input id="max-tokens" type="number" required min="16" max="8192" value={form.maxTokens} onChange={e => update('maxTokens', Number(e.target.value))}/></div></div></details>
    {feedback && <div className={`inline-status ${feedback.failed ? 'failure' : ''}`} role="alert">{t(feedback.text)}</div>}
    <div className="form-actions"><span className="form-hint"><LockKeyhole size={11}/>  {t("密钥仅用于你指定的 API")}</span><button type="submit" className="button primary" disabled={busy}>{busy ? t("保存中…") : t("保存模型")}<ChevronRight size={14}/></button></div>
  </form>;
}
function Options() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const t = translator(settings?.preferences.uiLanguage);
  usePageLanguage(settings?.preferences.uiLanguage, t('设置'));
  useSettingsUpdates(setSettings);
  const [section, setSection] = useState<'models' | 'general' | 'privacy' | 'usage'>('models');
  const [editing, setEditing] = useState<ModelView | null | undefined>(undefined);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [testing, setTesting] = useState('');
  const [deleting, setDeleting] = useState('');
  const [website, setWebsite] = useState('');
  const [disabledSite, setDisabledSite] = useState('');
  const [allSitesBusy, setAllSitesBusy] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const theme = useTheme(settings?.preferences.theme ?? 'system');
  useEffect(() => { void rpc<Settings>('settings:get').then(s => { setSettings(s); if (!s.models.length) setEditing(null); }).catch(e => setFeedback({ text: e.message, failed: true })); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { void chrome.permissions.getAll().then(p => setPermissions(p.origins ?? [])); }, [settings]);
  const perform = async (type: string, payload?: unknown, success?: string) => {
    try { const next = await rpc<Settings>(type, payload); setSettings(next); if (success) setFeedback({ text: success }); return true; }
    catch (e) { setFeedback({ text: e instanceof Error ? e.message : "操作失败。", failed: true }); return false; }
  };
  const preferences = settings?.preferences;
  const savePreference = (patch: Partial<Preferences>) => { if (preferences) void perform('settings:preferences', { ...preferences, ...patch }, '偏好已保存。'); };
  const allSites = async (enabled: boolean) => {
    setAllSitesBusy(true);
    try {
      if (enabled && !await chrome.permissions.request({ origins: ALL_SITES })) throw new Error('网站授权已取消。');
      await perform('site:all', enabled, enabled ? '已允许全部网站。其他已打开的网页刷新后生效。' : '已撤销全部网站访问权限。');
    } catch (error) { setFeedback({ text: error instanceof Error ? error.message : '授权失败。', failed: true }); }
    finally { setAllSitesBusy(false); }
  };
  const grantSite = async () => {
    try {
      const url = new URL(website.includes('://') ? website : `https://${website}`);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error("请输入普通网页的地址。");
      if (!await chrome.permissions.request({ origins: [originPattern(url.href)] })) throw new Error("网站授权已取消。");
      if (await perform('site:add', url.href, "网站已授权。刷新该网站后即可划词。")) setWebsite('');
    } catch (e) { setFeedback({ text: e instanceof Error ? e.message : "授权失败。", failed: true }); }
  };
  const headings = { usage: [t('Token 用量'), t('了解每次阅读的消耗，所有记录仅保存在本机。')], models: [t("模型"), t("连接你信任的模型，让 Selio 成为你的阅读伙伴。")], general: [t("阅读偏好"), t("按照你的习惯，调整每一次划词体验。")], privacy: [t("隐私与网站权限"), t("你决定 Selio 在哪里出现，以及哪些内容可以被发送。")] };
  return <div className="selio-root settings-shell" data-theme={theme}><aside className="settings-sidebar"><div><Brand/><p className="sidebar-tagline">SELECT. UNDERSTAND. EXPLORE.</p></div><nav className="settings-nav" aria-label={t("设置导航")}>{([{ id: 'models', label: t("模型"), icon: Cpu, en: '01' }, { id: 'general', label: t("阅读偏好"), icon: Settings2, en: '02' }, { id: 'privacy', label: t("隐私与权限"), icon: Shield, en: '03' }, { id: 'usage', label: t('Token 用量'), icon: BarChart3, en: '04' }] as const).map(item => <button key={item.id} className={section === item.id ? 'active' : ''} aria-current={section === item.id ? 'page' : undefined} onClick={() => { setSection(item.id); setFeedback(null); }}><item.icon size={16}/>{item.label}<small>{item.en}</small></button>)}</nav><div className="sidebar-bottom">{t("为专注阅读而设计。")}<span>Selio for Chrome · v0.1.0</span></div></aside>
    <main className="settings-main"><div className="settings-topline"><span>{t("你的阅读工作台 / SETTINGS")}</span><span className="local-badge"><i/>{t("仅保存在本机")}</span><label className="language-control"><Globe2 size={13}/><span className="sr-only">{t('界面语言')}</span><Select aria-label={t('界面语言')} value={settings?.preferences.uiLanguage ?? 'en'} disabled={!settings} onChange={e => savePreference({ uiLanguage: e.target.value as Preferences['uiLanguage'] })}><option value="en">English</option><option value="zh-CN">简体中文</option></Select></label></div><header className="page-heading"><h1>{headings[section][0]}</h1><p>{headings[section][1]}</p></header>
      {feedback && <div className={`inline-status ${feedback.failed ? 'failure' : ''}`} role={feedback.failed ? 'alert' : 'status'}>{t(feedback.text)}</div>}
      {!settings ? <p role="status">{t("正在读取设置…")}</p> : section === 'usage' ? <UsagePage language={settings.preferences.uiLanguage}/> : section === 'models' ? <>
        {settings.models.length > 0 && <><div className="section-title"><h2>{t("我的模型")}</h2><span>{settings.models.length}</span><button className="text-button" onClick={() => setEditing(null)}><Plus size={14}/>{t("添加模型")}</button></div><div className="model-list">{settings.models.map(model => <div className="model-row" key={model.id}><span className="model-avatar">{model.provider === 'custom' ? <Cpu size={17}/> : model.name.charAt(0)}</span><div className="model-info"><strong>{model.name}{settings.defaultModelId === model.id && <span className="default-label">{t("默认")}</span>}</strong><small>{model.model} · {model.hasKey ? model.keyStorage === 'session' ? t("会话密钥已就绪") : t("本机密钥已保存") : t("需要重新输入密钥")}</small></div><div className="model-row-tools">{deleting === model.id ? <><button className="small-button danger-button" onClick={() => { void perform('settings:delete', model.id, "模型已删除。"); setDeleting(''); if (editing?.id === model.id) setEditing(undefined); }}>{t("确认删除")}</button><button className="small-button" onClick={() => setDeleting('')}>{t("取消")}</button></> : <>
          {settings.defaultModelId !== model.id && <button className="small-button" onClick={() => void perform('settings:default', model.id, "已设为默认，新对话将使用此模型。")}>{t("设为默认")}</button>}
          <button className="small-button" disabled={Boolean(testing)} onClick={async () => { setTesting(model.id); try { const text = await rpc<string>('settings:test', model.id); setFeedback({ text }); } catch (e) { setFeedback({ text: e instanceof Error ? e.message : "连接失败。", failed: true }); } finally { setTesting(''); } }}>{testing === model.id ? t("测试中…") : t("测试连接")}</button><button className="icon-button" aria-label={`${t('编辑')} ${model.name}`} onClick={() => setEditing(model)}><Pencil size={14}/></button><button className="icon-button" aria-label={`${t('删除')} ${model.name}`} onClick={() => setDeleting(model.id)}><Trash2 size={14}/></button></>}</div></div>)}</div></>}
        <div className="models-layout"><div>{editing !== undefined ? <ModelForm t={t} key={editing?.id ?? 'new'} model={editing} onCancel={() => setEditing(undefined)} onSaved={s => { setSettings(s); setEditing(undefined); setFeedback({ text: '模型已保存。可以测试连接，然后在网页中开始阅读。' }); }}/> : <button className="button secondary" onClick={() => setEditing(null)}><Plus size={15}/>{t("连接新的模型")}</button>}<div className="privacy-note"><ShieldCheck size={17}/><p>{t("你的文字直接发送给所选模型供应商。Selio 没有中转服务器，不收集浏览记录，也不会默认上传整张网页。")}</p></div></div><aside className="guide"><span className="eyebrow">{t("你的模型，你的选择")}</span><h3>{t("从一段文字，")}<br/>{t("到一个新想法。")}</h3><p>{t("连接一次，即可在阅读时随手翻译、总结与解释。")}</p><div className="guide-rule"/><div className="guide-item"><span>01</span><div><strong>{t("连接模型")}</strong><p>{t("使用自己的 API Key，自由选择供应商。")}</p></div></div><div className="guide-item"><span>02</span><div><strong>{t("选中一段文字")}</strong><p>{t("授权当前网站，点击选区旁的 Selio。")}</p></div></div><div className="guide-item"><span>03</span><div><strong>{t("让理解再深一点")}</strong><p>{t("直接追问，或固定到侧边栏继续探索。")}</p></div></div><div className="guide-rule"/><p><Zap size={12}/>  {t("支持 Chat Completions 与 Anthropic Messages")}</p></aside></div>
      </> : section === 'general' && preferences ? <div className="settings-section"><div className="setting-row"><div><h3>{t('界面语言')}</h3><p>{t('仅更改界面文案，不影响翻译与解释的目标语言。')}</p></div><Select aria-label={t('界面语言') + ' · preferences'} value={preferences.uiLanguage} onChange={e => savePreference({ uiLanguage: e.target.value as Preferences['uiLanguage'] })}><option value="en">English</option><option value="zh-CN">简体中文</option></Select></div>
        <div className="setting-row"><div><h3>{t("默认操作")}</h3><p>{t("点击划词图标后，立即执行的动作。")}</p></div><Select aria-label={t("默认操作")} value={preferences.action} onChange={e => savePreference({ action: e.target.value as Preferences['action'] })}>{Object.entries(ACTIONS).map(([key, label]) => <option value={key} key={key}>{t(label)}</option>)}</Select></div>
        <div className="setting-row"><div><h3>{t("目标语言")}</h3><p>{t("翻译与解释优先使用的语言。")}</p></div><Select aria-label={t("目标语言")} value={preferences.language} onChange={e => savePreference({ language: e.target.value })}>{['简体中文', '繁體中文', 'English', '日本語', '한국어', 'Español', 'Français', 'Deutsch'].map(language => <option key={language}>{language}</option>)}</Select></div>
        <div className="setting-row"><div><h3>{t("外观")}</h3><p>{t("浮窗、侧边栏与设置页统一的阅读主题。")}</p></div><Select aria-label={t("外观")} value={preferences.theme} onChange={e => savePreference({ theme: e.target.value as Preferences['theme'] })}><option value="system">{t("跟随系统")}</option><option value="light">{t("浅色")}</option><option value="dark">{t("深色")}</option></Select></div>
        <div className="setting-row"><div><h3>{t("自动划词图标")}</h3><p>{t("仅在你已授权且未禁用的网站显示。")}</p></div><input className="toggle" type="checkbox" aria-label={t("自动划词图标")} checked={preferences.autoSelection} onChange={e => savePreference({ autoSelection: e.target.checked })}/></div>
        <div className="setting-row"><div><h3>{t("默认发送范围")}</h3><p>{t("修改范围只影响新对话。默认不会读取整页内容。")}</p></div><Select aria-label={t("默认发送范围")} value={preferences.scope} onChange={e => savePreference({ scope: e.target.value as Preferences['scope'] })}><option value="selection">{t("仅选中文字")}</option><option value="paragraph">{t("选中文字 + 段落")}</option></Select></div>
        <div className="privacy-note"><Check size={16}/><p>{t("偏好会自动保存。更改默认模型、动作和语言后，新对话即会采用这些设置。")}</p></div>
      </div> : preferences && <div className="settings-section"><div className="setting-row"><div><h3>{t('允许全部网站')}</h3><p>{t('一次授权，在所有普通网页显示划词图标。禁用列表仍然生效。')}</p></div><input className="toggle" type="checkbox" aria-label={t('允许全部网站')} checked={preferences.allSites} disabled={allSitesBusy} onChange={e => void allSites(e.target.checked)}/></div><div className="section-title"><h2>{t("允许自动划词的网站")}</h2></div><p className="form-hint">{t("仅在你授权的网站检测选区。你也可以点击浏览器工具栏的 Selio，为当前网站授权。")}</p><form className="site-form" onSubmit={e => { e.preventDefault(); void grantSite(); }}><div className="field"><label htmlFor="website">{t("网站地址")}</label><input id="website" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://example.com" required/></div><button className="button primary" type="submit">{t("授权网站")}</button></form><div className="site-list">{preferences.grantedSites.length ? preferences.grantedSites.map(site => <div className="site-row" key={site}><Globe2 size={15}/>{site}<button className="icon-button" aria-label={`${t('撤销')} ${site}`} onClick={() => void perform('site:remove', site, "网站授权已撤销。")}><X size={15}/></button></div>) : <p className="empty-list">{t("还没有自动划词的网站。右键菜单始终可以主动调用。")}</p>}</div>
        <div className="section-title"><h2>{t("禁用自动划词")}</h2></div><p className="form-hint">{t("输入域名即可暂停此站点及其子域名的图标；不影响主动右键调用。")}</p><form className="site-form" onSubmit={e => { e.preventDefault(); let host = disabledSite.trim().toLowerCase(); try { host = new URL(host.includes('://') ? host : `https://${host}`).hostname; } catch { /* Validation gives a friendly error. */ } savePreference({ disabledSites: [...preferences.disabledSites, host] }); setDisabledSite(''); }}><div className="field"><label htmlFor="disabled-site">{t("网站域名")}</label><input id="disabled-site" value={disabledSite} onChange={e => setDisabledSite(e.target.value)} placeholder="example.com" required/></div><button type="submit" className="button secondary">{t("添加")}</button></form><div className="site-list">{preferences.disabledSites.map(site => <div className="site-row" key={site}>{site}<button className="icon-button" aria-label={`${t('移除禁用')} ${site}`} onClick={() => savePreference({ disabledSites: preferences.disabledSites.filter(s => s !== site) })}><X size={15}/></button></div>)}</div>
        <div className="section-title"><h2>{t("权限与数据")}</h2></div><div className="permission-details"><p>{t("划词监听需要明确的网站授权；临时启用使用 activeTab，仅在你点击扩展后生效。API 来源单独按需授权。")}</p><p>{t("密钥与设置仅允许可信扩展页面和后台访问。默认会话密钥不写入磁盘；选择本机保存时使用未加密的扩展存储。")}</p><p>{t("对话暂存在浏览器会话内存中，关闭标签页即清除。关闭浮窗保留当前对话；切换选区后不提供历史列表。")}</p><details><summary>{t("查看已授予的来源权限（")}{permissions.length})</summary>{permissions.map(origin => <p key={origin}>{origin}</p>)}</details></div>
        <div className="danger-zone"><h3>{t("清除本地数据")}</h3><p>{t("删除模型、密钥、偏好和当前对话，同时撤销可选网站权限。此操作无法撤销。")}</p>{clearConfirm ? <div className="confirm-row"><span>{t("确认清除全部 Selio 数据？")}</span><button className="button danger-button" onClick={async () => { if (await perform('data:clear', undefined, "所有 Selio 数据与可选权限已清除。")) { setClearConfirm(false); setEditing(null); } }}>{t("确认清除")}</button><button className="button secondary" onClick={() => setClearConfirm(false)}>{t("取消")}</button></div> : <button className="button danger-button" onClick={() => setClearConfirm(true)}><Trash2 size={14}/>{t("清除全部数据")}</button>}</div>
      </div>}
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<Options/>);
