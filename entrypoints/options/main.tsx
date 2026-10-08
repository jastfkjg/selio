import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { Check, ChevronRight, Cpu, Eye, EyeOff, Globe2, LockKeyhole, Pencil, Plus, Settings2, Shield, ShieldCheck, Trash2, X, Zap } from 'lucide-react';
import { Brand } from '../../src/components/Brand';
import { useTheme } from '../../src/hooks/useTheme';
import { rpc } from '../../src/shared/rpc';
import { apiEndpoint, originPattern, validateModel } from '../../src/shared/validation';
import { ACTIONS, type ModelConfig, type ModelView, type Preferences, type Provider, type Settings } from '../../src/shared/types';
import '../../src/styles.css';

const presets: Record<Provider, { baseUrl: string; model: string; name: string }> = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', name: 'OpenAI' },
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', name: 'DeepSeek' },
  custom: { baseUrl: '', model: '', name: '自定义模型' },
};
function newModel(): ModelConfig { return { id: crypto.randomUUID(), provider: 'openai', ...presets.openai, keyStorage: 'session', maxTokens: 2048 }; }
type Feedback = { text: string; failed?: boolean };
function ModelForm({ model, onSaved, onCancel }: { model: ModelView | null; onSaved: (settings: Settings) => void; onCancel: () => void }) {
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
      if (!key.trim() && !model?.hasKey) throw new Error('请输入 API Key。');
      // This request starts in the submit gesture, before asynchronous storage work.
      const permission = chrome.permissions.request({ origins: [originPattern(apiEndpoint(config.baseUrl))] });
      setBusy(true);
      if (!await permission) throw new Error('需要此 API 来源权限才能调用模型。配置尚未保存。');
      const settings = await rpc<Settings>('settings:model', { model: config, ...(key.trim() ? { key } : {}) });
      setKey(''); onSaved(settings);
    } catch (e) { setFeedback({ text: e instanceof Error ? e.message : '保存失败。', failed: true }); }
    finally { setBusy(false); }
  };
  return <form className="model-form" onSubmit={e => { e.preventDefault(); void save(); }} autoComplete="off"><div className="form-heading"><h2>{model ? '编辑模型' : '连接一个模型'}</h2><button type="button" className="icon-button" aria-label="关闭模型编辑" onClick={onCancel}><X size={17}/></button></div>
    <div className="form-grid"><div className="field"><label htmlFor="provider">供应商</label><select id="provider" value={form.provider} onChange={e => { const provider = e.target.value as Provider; setForm({ ...form, provider, ...presets[provider] }); setKey(''); }}><option value="openai">OpenAI</option><option value="deepseek">DeepSeek</option><option value="custom">Custom · OpenAI-compatible</option></select></div><div className="field"><label htmlFor="model-name">显示名称</label><input id="model-name" required maxLength={80} value={form.name} onChange={e => update('name', e.target.value)} placeholder="例如：日常阅读"/></div></div>
    <div className="field"><label htmlFor="base-url">Base URL</label><input id="base-url" type="url" required value={form.baseUrl} onChange={e => update('baseUrl', e.target.value)} placeholder="https://api.example.com/v1" spellCheck={false}/><small>使用 Chat Completions 接口，自动补全 /chat/completions。</small></div>
    <div className="field"><label htmlFor="model-id">模型标识</label><input id="model-id" required value={form.model} onChange={e => update('model', e.target.value)} placeholder="供应商提供的模型 ID" spellCheck={false}/></div>
    <div className="field"><label htmlFor="api-key">API Key {model?.hasKey && <span className="default-label">已保存</span>}</label><div className="key-field"><input id="api-key" type={showKey ? 'text' : 'password'} value={key} onChange={e => setKey(e.target.value)} placeholder={model?.hasKey ? '留空保留现有密钥' : '输入你的 API Key'} autoComplete="new-password" spellCheck={false}/><button type="button" className="icon-button" aria-label={showKey ? '隐藏密钥' : '显示密钥'} onClick={() => setShowKey(!showKey)}>{showKey ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></div>
    <div className="field"><label htmlFor="key-storage">密钥保存方式</label><select id="key-storage" value={form.keyStorage} onChange={e => update('keyStorage', e.target.value as 'session' | 'local')}><option value="session">仅本次浏览器会话 · 推荐</option><option value="local">保存在这台设备上</option></select><small>{form.keyStorage === 'session' ? '关闭浏览器、停用或重新加载扩展后，需要重新输入。' : '以明文保存在扩展本地存储中，未加密。拥有本机访问权限的人可能读取。不会同步到云端。'}</small></div>
    <details className="form-details"><summary>高级参数</summary><div className="form-grid"><div className="field"><label htmlFor="temperature">Temperature · 可选</label><input id="temperature" type="number" min="0" max="2" step="0.1" value={form.temperature ?? ''} onChange={e => update('temperature', e.target.value === '' ? undefined : Number(e.target.value))} placeholder="使用模型默认值"/></div><div className="field"><label htmlFor="max-tokens">最大输出 Tokens</label><input id="max-tokens" type="number" required min="16" max="8192" value={form.maxTokens} onChange={e => update('maxTokens', Number(e.target.value))}/></div></div></details>
    {feedback && <div className={`inline-status ${feedback.failed ? 'failure' : ''}`} role="alert">{feedback.text}</div>}
    <div className="form-actions"><span className="form-hint"><LockKeyhole size={11}/> 密钥仅用于你指定的 API</span><button type="submit" className="button primary" disabled={busy}>{busy ? '保存中…' : '保存模型'}<ChevronRight size={14}/></button></div>
  </form>;
}
function Options() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [section, setSection] = useState<'models' | 'general' | 'privacy'>('models');
  const [editing, setEditing] = useState<ModelView | null | undefined>(undefined);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [testing, setTesting] = useState('');
  const [deleting, setDeleting] = useState('');
  const [website, setWebsite] = useState('');
  const [disabledSite, setDisabledSite] = useState('');
  const [clearConfirm, setClearConfirm] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const theme = useTheme(settings?.preferences.theme ?? 'system');
  useEffect(() => { void rpc<Settings>('settings:get').then(s => { setSettings(s); if (!s.models.length) setEditing(null); }).catch(e => setFeedback({ text: e.message, failed: true })); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { void chrome.permissions.getAll().then(p => setPermissions(p.origins ?? [])); }, [settings]);
  const perform = async (type: string, payload?: unknown, success?: string) => {
    try { const next = await rpc<Settings>(type, payload); setSettings(next); if (success) setFeedback({ text: success }); return true; }
    catch (e) { setFeedback({ text: e instanceof Error ? e.message : '操作失败。', failed: true }); return false; }
  };
  const preferences = settings?.preferences;
  const savePreference = (patch: Partial<Preferences>) => { if (preferences) void perform('settings:preferences', { ...preferences, ...patch }, '偏好已保存。'); };
  const grantSite = async () => {
    try {
      const url = new URL(website.includes('://') ? website : `https://${website}`);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('请输入普通网页的地址。');
      if (!await chrome.permissions.request({ origins: [originPattern(url.href)] })) throw new Error('网站授权已取消。');
      if (await perform('site:add', url.href, '网站已授权。刷新该网站后即可划词。')) setWebsite('');
    } catch (e) { setFeedback({ text: e instanceof Error ? e.message : '授权失败。', failed: true }); }
  };
  const headings = { models: ['模型', '连接你信任的模型，让 Selio 成为你的阅读伙伴。'], general: ['阅读偏好', '按照你的习惯，调整每一次划词体验。'], privacy: ['隐私与网站权限', '你决定 Selio 在哪里出现，以及哪些内容可以被发送。'] };
  return <div className="selio-root settings-shell" data-theme={theme}><aside className="settings-sidebar"><div><Brand/><p className="sidebar-tagline">SELECT. UNDERSTAND. EXPLORE.</p></div><nav className="settings-nav" aria-label="设置导航">{([{ id: 'models', label: '模型', icon: Cpu, en: '01' }, { id: 'general', label: '阅读偏好', icon: Settings2, en: '02' }, { id: 'privacy', label: '隐私与权限', icon: Shield, en: '03' }] as const).map(item => <button key={item.id} className={section === item.id ? 'active' : ''} aria-current={section === item.id ? 'page' : undefined} onClick={() => { setSection(item.id); setFeedback(null); }}><item.icon size={16}/>{item.label}<small>{item.en}</small></button>)}</nav><div className="sidebar-bottom">为专注阅读而设计。<span>Selio for Chrome · v0.1.0</span></div></aside>
    <main className="settings-main"><div className="settings-topline"><span>你的阅读工作台 / SETTINGS</span><span className="local-badge"><i/>仅保存在本机</span></div><header className="page-heading"><h1>{headings[section][0]}</h1><p>{headings[section][1]}</p></header>
      {feedback && <div className={`inline-status ${feedback.failed ? 'failure' : ''}`} role={feedback.failed ? 'alert' : 'status'}>{feedback.text}</div>}
      {!settings ? <p role="status">正在读取设置…</p> : section === 'models' ? <>
        {settings.models.length > 0 && <><div className="section-title"><h2>我的模型</h2><span>{settings.models.length}</span><button className="text-button" onClick={() => setEditing(null)}><Plus size={14}/>添加模型</button></div><div className="model-list">{settings.models.map(model => <div className="model-row" key={model.id}><span className="model-avatar">{model.provider === 'custom' ? <Cpu size={17}/> : model.name.charAt(0)}</span><div className="model-info"><strong>{model.name}{settings.defaultModelId === model.id && <span className="default-label">默认</span>}</strong><small>{model.model} · {model.hasKey ? model.keyStorage === 'session' ? '会话密钥已就绪' : '本机密钥已保存' : '需要重新输入密钥'}</small></div><div className="model-row-tools">{deleting === model.id ? <><button className="small-button danger-button" onClick={() => { void perform('settings:delete', model.id, '模型已删除。'); setDeleting(''); if (editing?.id === model.id) setEditing(undefined); }}>确认删除</button><button className="small-button" onClick={() => setDeleting('')}>取消</button></> : <>
          {settings.defaultModelId !== model.id && <button className="small-button" onClick={() => void perform('settings:default', model.id, '已设为默认，新对话将使用此模型。')}>设为默认</button>}
          <button className="small-button" disabled={Boolean(testing)} onClick={async () => { setTesting(model.id); try { const text = await rpc<string>('settings:test', model.id); setFeedback({ text }); } catch (e) { setFeedback({ text: e instanceof Error ? e.message : '连接失败。', failed: true }); } finally { setTesting(''); } }}>{testing === model.id ? '测试中…' : '测试连接'}</button><button className="icon-button" aria-label={`编辑 ${model.name}`} onClick={() => setEditing(model)}><Pencil size={14}/></button><button className="icon-button" aria-label={`删除 ${model.name}`} onClick={() => setDeleting(model.id)}><Trash2 size={14}/></button></>}</div></div>)}</div></>}
        <div className="models-layout"><div>{editing !== undefined ? <ModelForm key={editing?.id ?? 'new'} model={editing} onCancel={() => setEditing(undefined)} onSaved={s => { setSettings(s); setEditing(undefined); setFeedback({ text: '模型已保存。可以测试连接，然后在网页中开始阅读。' }); }}/> : <button className="button secondary" onClick={() => setEditing(null)}><Plus size={15}/>连接新的模型</button>}<div className="privacy-note"><ShieldCheck size={17}/><p>你的文字直接发送给所选模型供应商。Selio 没有中转服务器，不收集浏览记录，也不会默认上传整张网页。</p></div></div><aside className="guide"><span className="eyebrow">你的模型，你的选择</span><h3>从一段文字，<br/>到一个新想法。</h3><p>连接一次，即可在阅读时随手翻译、总结与解释。</p><div className="guide-rule"/><div className="guide-item"><span>01</span><div><strong>连接模型</strong><p>使用自己的 API Key，自由选择供应商。</p></div></div><div className="guide-item"><span>02</span><div><strong>选中一段文字</strong><p>授权当前网站，点击选区旁的 Selio。</p></div></div><div className="guide-item"><span>03</span><div><strong>让理解再深一点</strong><p>直接追问，或固定到侧边栏继续探索。</p></div></div><div className="guide-rule"/><p><Zap size={12}/> 支持 OpenAI-compatible 流式接口</p></aside></div>
      </> : section === 'general' && preferences ? <div className="settings-section">
        <div className="setting-row"><div><h3>默认操作</h3><p>点击划词图标后，立即执行的动作。</p></div><select aria-label="默认操作" value={preferences.action} onChange={e => savePreference({ action: e.target.value as Preferences['action'] })}>{Object.entries(ACTIONS).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></div>
        <div className="setting-row"><div><h3>目标语言</h3><p>翻译与解释优先使用的语言。</p></div><select aria-label="目标语言" value={preferences.language} onChange={e => savePreference({ language: e.target.value })}>{['简体中文', '繁體中文', 'English', '日本語', '한국어', 'Español', 'Français', 'Deutsch'].map(language => <option key={language}>{language}</option>)}</select></div>
        <div className="setting-row"><div><h3>外观</h3><p>浮窗、侧边栏与设置页统一的阅读主题。</p></div><select aria-label="外观" value={preferences.theme} onChange={e => savePreference({ theme: e.target.value as Preferences['theme'] })}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></div>
        <div className="setting-row"><div><h3>自动划词图标</h3><p>仅在你已授权且未禁用的网站显示。</p></div><input className="toggle" type="checkbox" aria-label="自动划词图标" checked={preferences.autoSelection} onChange={e => savePreference({ autoSelection: e.target.checked })}/></div>
        <div className="setting-row"><div><h3>默认发送范围</h3><p>修改范围只影响新对话。默认不会读取整页内容。</p></div><select aria-label="默认发送范围" value={preferences.scope} onChange={e => savePreference({ scope: e.target.value as Preferences['scope'] })}><option value="selection">仅选中文字</option><option value="paragraph">选中文字 + 段落</option></select></div>
        <div className="privacy-note"><Check size={16}/><p>偏好会自动保存。更改默认模型、动作和语言后，新对话即会采用这些设置。</p></div>
      </div> : preferences && <div className="settings-section"><div className="section-title"><h2>允许自动划词的网站</h2></div><p className="form-hint">仅在你授权的网站检测选区。你也可以点击浏览器工具栏的 Selio，为当前网站授权。</p><form className="site-form" onSubmit={e => { e.preventDefault(); void grantSite(); }}><div className="field"><label htmlFor="website">网站地址</label><input id="website" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://example.com" required/></div><button className="button primary" type="submit">授权网站</button></form><div className="site-list">{preferences.grantedSites.length ? preferences.grantedSites.map(site => <div className="site-row" key={site}><Globe2 size={15}/>{site}<button className="icon-button" aria-label={`撤销 ${site}`} onClick={() => void perform('site:remove', site, '网站授权已撤销。')}><X size={15}/></button></div>) : <p className="empty-list">还没有自动划词的网站。右键菜单始终可以主动调用。</p>}</div>
        <div className="section-title"><h2>禁用自动划词</h2></div><p className="form-hint">输入域名即可暂停此站点及其子域名的图标；不影响主动右键调用。</p><form className="site-form" onSubmit={e => { e.preventDefault(); let host = disabledSite.trim().toLowerCase(); try { host = new URL(host.includes('://') ? host : `https://${host}`).hostname; } catch { /* Validation gives a friendly error. */ } savePreference({ disabledSites: [...preferences.disabledSites, host] }); setDisabledSite(''); }}><div className="field"><label htmlFor="disabled-site">网站域名</label><input id="disabled-site" value={disabledSite} onChange={e => setDisabledSite(e.target.value)} placeholder="example.com" required/></div><button type="submit" className="button secondary">添加</button></form><div className="site-list">{preferences.disabledSites.map(site => <div className="site-row" key={site}>{site}<button className="icon-button" aria-label={`移除禁用 ${site}`} onClick={() => savePreference({ disabledSites: preferences.disabledSites.filter(s => s !== site) })}><X size={15}/></button></div>)}</div>
        <div className="section-title"><h2>权限与数据</h2></div><div className="permission-details"><p>划词监听需要明确的网站授权；临时启用使用 activeTab，仅在你点击扩展后生效。API 来源单独按需授权。</p><p>密钥与设置仅允许可信扩展页面和后台访问。默认会话密钥不写入磁盘；选择本机保存时使用未加密的扩展存储。</p><p>对话暂存在浏览器会话内存中，关闭标签页即清除。关闭浮窗保留当前对话；切换选区后不提供历史列表。</p><details><summary>查看已授予的来源权限（{permissions.length}）</summary>{permissions.map(origin => <p key={origin}>{origin}</p>)}</details></div>
        <div className="danger-zone"><h3>清除本地数据</h3><p>删除模型、密钥、偏好和当前对话，同时撤销可选网站权限。此操作无法撤销。</p>{clearConfirm ? <div className="confirm-row"><span>确认清除全部 Selio 数据？</span><button className="button danger-button" onClick={async () => { if (await perform('data:clear', undefined, '所有 Selio 数据与可选权限已清除。')) { setClearConfirm(false); setEditing(null); } }}>确认清除</button><button className="button secondary" onClick={() => setClearConfirm(false)}>取消</button></div> : <button className="button danger-button" onClick={() => setClearConfirm(true)}><Trash2 size={14}/>清除全部数据</button>}</div>
      </div>}
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<Options/>);
