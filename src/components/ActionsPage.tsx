import { useRef, useState } from 'react';
import { ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react';
import { ACTION_ICONS, actionLabel, builtinAction, validateAction, validatePrompt } from '../shared/actions';
import type { Action, PromptAction, Settings } from '../shared/types';
import { translator, type Translator } from '../shared/i18n';
import { rpc } from '../shared/rpc';
import { ActionIcon } from './ActionIcon';
import { Select } from './Select';

function ActionForm({ initial, settings, t, onSave, onCancel }: { initial: PromptAction; settings: Settings; t: Translator; onSave: (action: PromptAction) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState<PromptAction>({ ...initial, name: actionLabel(initial, t) });
  const initialLabel = useRef(actionLabel(initial, t));
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const update = <K extends keyof PromptAction>(key: K, value: PromptAction[K]) => setForm(previous => ({ ...previous, [key]: value }));
  const validate = () => { try { validatePrompt(form.prompt); setError(''); } catch (e) { setError((e as Error).message); } };
  return <form className="model-form action-form" onSubmit={async e => {
    e.preventDefault(); setError(''); setBusy(true);
    try { await onSave(validateAction({ ...form, name: form.name === initialLabel.current ? initial.name : form.name })); }
    catch (e) { setError(e instanceof Error ? e.message : '保存失败。'); }
    finally { setBusy(false); }
  }}>
    <div className="form-heading"><h2>{settings.actions.some(a => a.id === initial.id) ? t('编辑操作') : t('创建操作')}</h2><button type="button" className="icon-button" aria-label={t('关闭操作编辑')} onClick={onCancel}><X size={17}/></button></div>
    <div className="form-grid"><div className="field"><label htmlFor="action-name">{t('操作名称')}</label><input id="action-name" required maxLength={40} value={form.name} onChange={e => update('name', e.target.value)} placeholder={t('例如：技术解释')}/></div><div className="field"><label htmlFor="action-icon">{t('图标')}</label><Select id="action-icon" value={form.icon} options={ACTION_ICONS.map(icon => ({ value: icon, label: icon, content: <span className="action-icon-option"><ActionIcon name={icon}/>{icon}</span> }))} onChange={e => update('icon', e.target.value as PromptAction['icon'])}/></div></div>
    <div className="field"><label htmlFor="action-prompt">{t('Prompt 模板')}</label><textarea id="action-prompt" className="prompt-textarea" required maxLength={8000} rows={9} spellCheck={false} value={form.prompt} onBlur={validate} onChange={e => update('prompt', e.target.value)} aria-describedby="template-help"/><small id="template-help">{t('{{selection}} 使用选中文字；{{language}} 使用目标语言。')}</small></div>
    <div className="field"><label htmlFor="action-model">{t('默认使用的模型')}</label><Select id="action-model" value={form.modelId ?? ''} onChange={e => update('modelId', e.target.value || null)}><option value="">{t('跟随当前模型')}</option>{settings.models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</Select><small>{t('未指定时，新选区使用全局默认模型；对话内沿用当前模型。')}</small></div>
    <fieldset className="execution-choices"><legend>{t('执行方式')}</legend>{(['direct', 'edit'] as const).map(mode => <label key={mode}><input type="radio" name="execution" value={mode} checked={form.execution === mode} onChange={() => update('execution', mode)}/><span><strong>{mode === 'direct' ? t('直接执行') : t('先编辑，再执行')}</strong><small>{mode === 'direct' ? t('点击或悬停后立即请求模型。') : t('先打开本次 Prompt，确认执行后才请求模型。')}</small></span></label>)}</fieldset>
    <label className="action-visibility"><span>{t('显示在快捷操作区域')}</span><input className="toggle" type="checkbox" checked={form.showInQuickActions} onChange={e => update('showInQuickActions', e.target.checked)}/></label>
    {error && <p className="inline-status failure" role="alert">{t(error)}</p>}
    <div className="form-actions"><button type="button" className="text-button" onClick={onCancel}>{t('取消')}</button><button className="button primary" type="submit" disabled={busy}>{busy ? t('保存中…') : t('保存操作')}<ChevronRight size={14}/></button></div>
  </form>;
}
export function ActionsPage({ settings, onSettings }: { settings: Settings; onSettings: (settings: Settings) => void }) {
  const t = translator(settings.preferences.uiLanguage);
  const [editing, setEditing] = useState<PromptAction | null>(null), [deleting, setDeleting] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const perform = async (type: string, payload: unknown) => {
    setBusy(true); setError('');
    try { onSettings(await rpc<Settings>(type, payload)); }
    catch (e) { setError(e instanceof Error ? e.message : '操作失败。'); }
    finally { setBusy(false); }
  };
  return <section className="actions-page">
    <div className="actions-toolbar"><label>{t('默认操作')}<Select aria-label={t('默认操作')} value={settings.preferences.action} disabled={busy} onChange={e => void perform('settings:preferences', { ...settings.preferences, action: e.target.value })}>{settings.actions.map(action => <option key={action.id} value={action.id}>{actionLabel(action, t)}</option>)}</Select></label><button className="button primary" onClick={() => setEditing({ id: `custom:${crypto.randomUUID()}`, name: '', icon: 'Sparkles', prompt: 'Explain the following content in {{language}}.\n\n{{selection}}', modelId: null, showInQuickActions: true, execution: 'direct' })}><Plus size={15}/>{t('新建操作')}</button></div>
    <p className="form-hint actions-hint">{t('快捷区由你决定。隐藏的操作仍可在“更多操作”中找到；默认操作单独设置。')}</p>
    {error && <p className="inline-status failure" role="alert">{t(error)}</p>}
    <div className={`actions-layout ${editing ? 'is-editing' : ''}`}><div className="actions-list">{settings.actions.map(action => <article className={`action-setting ${editing?.id === action.id ? 'selected' : ''}`} key={action.id}>
      <span className="model-avatar"><ActionIcon name={action.icon}/></span><div className="action-info"><strong>{actionLabel(action, t)}{settings.preferences.action === action.id && <span className="default-label">{t('默认')}</span>}</strong><small>{action.modelId ? settings.models.find(m => m.id === action.modelId)?.name : t('跟随当前模型')} · {action.execution === 'direct' ? t('直接执行') : t('先编辑，再执行')}</small></div>
      <div className="action-setting-tools"><label className="action-quick-toggle"><span>{t('快捷区')}</span><input type="checkbox" className="toggle" aria-label={`${t('显示快捷操作')} ${actionLabel(action, t)}`} checked={action.showInQuickActions} disabled={busy} onChange={e => void perform('actions:save', { ...action, showInQuickActions: e.target.checked })}/></label><button className="icon-button" aria-label={`${t('编辑')} ${actionLabel(action, t)}`} onClick={() => setEditing(action)}><Pencil size={15}/></button>{!builtinAction(action.id) && <button className="icon-button" aria-label={`${t('删除')} ${actionLabel(action, t)}`} onClick={() => setDeleting(action.id)}><Trash2 size={15}/></button>}</div>
      {deleting === action.id && <div className="action-delete-confirm"><span>{t('删除此模板？已有对话仍会保留。')}</span><button className="small-button danger-button" disabled={busy} onClick={async () => { await perform('actions:delete', action.id); if (editing?.id === action.id) setEditing(null); setDeleting(null); }}>{t('删除操作')}</button><button className="small-button" onClick={() => setDeleting(null)}>{t('取消')}</button></div>}
    </article>)}</div>{editing && <ActionForm key={editing.id} initial={editing} settings={settings} t={t} onCancel={() => setEditing(null)} onSave={async action => { onSettings(await rpc<Settings>('actions:save', action)); setEditing(null); }}/>}</div>
  </section>;
}
