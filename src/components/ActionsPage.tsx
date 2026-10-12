import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react';
import { ACTION_ICONS, actionLabel, actionNavigation, builtinAction, validateAction, validatePrompt } from '../shared/actions';
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
    <fieldset className="execution-choices"><legend>{t('执行方式')}</legend>{form.id === 'ask' ? <div><strong>{t('发送消息时请求')}</strong><small>{t('打开操作不会请求模型，只有发送消息后才请求。')}</small></div> : (['direct', 'edit'] as const).map(mode => <label key={mode}><input type="radio" name="execution" value={mode} checked={form.execution === mode} onChange={() => update('execution', mode)}/><span><strong>{mode === 'direct' ? t('直接执行') : t('先编辑，再执行')}</strong><small>{mode === 'direct' ? t('点击或悬停后立即请求模型。') : t('先打开本次 Prompt，确认执行后才请求模型。')}</small></span></label>)}</fieldset>
    <label className="action-visibility"><span>{t('启用操作')}</span><input className="toggle" type="checkbox" checked={form.showInQuickActions} onChange={e => update('showInQuickActions', e.target.checked)}/></label>
    {error && <p className="inline-status failure" role="alert">{t(error)}</p>}
    <div className="form-actions"><button type="button" className="text-button" onClick={onCancel}>{t('取消')}</button><button className="button primary" type="submit" disabled={busy}>{busy ? t('保存中…') : t('保存操作')}<ChevronRight size={14}/></button></div>
  </form>;
}
export function ActionsPage({ settings, onSettings }: { settings: Settings; onSettings: (settings: Settings) => void }) {
  const t = translator(settings.preferences.uiLanguage);
  const [editing, setEditing] = useState<PromptAction | null>(null), [deleting, setDeleting] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const reorderFocus = useRef<{ id: Action; direction: 'up' | 'down' } | null>(null);
  useEffect(() => {
    if (busy || !reorderFocus.current) return;
    const { id, direction } = reorderFocus.current;
    const row = Array.from(list.current?.children ?? []).find(element => element.getAttribute('data-action-id') === id);
    const button = row?.querySelector<HTMLButtonElement>(`button[data-move="${direction}"]:not(:disabled)`) ?? row?.querySelector<HTMLButtonElement>('button[data-move]:not(:disabled)');
    button?.focus({ preventScroll: true });
    reorderFocus.current = null;
  }, [busy, settings.actions]);
  const { defaultAction } = actionNavigation(settings.actions);
  const perform = async (type: string, payload: unknown) => {
    setBusy(true); setError('');
    try { onSettings(await rpc<Settings>(type, payload)); return true; }
    catch (e) { setError(e instanceof Error ? e.message : '操作失败。'); }
    finally { setBusy(false); }
  };
  const move = async (index: number, direction: -1 | 1) => {
    const ids = settings.actions.map(action => action.id);
    const target = index + direction;
    if (busy || target < 0 || target >= ids.length) return;
    reorderFocus.current = { id: ids[index]!, direction: direction === -1 ? 'up' : 'down' };
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    if (await perform('actions:reorder', ids)) setAnnouncement(`${actionLabel(settings.actions[index]!, t)} · ${t('位置')} ${target + 1}`);
  };
  return <section className="actions-page">
    <div className="actions-toolbar"><div><h2>{t('操作顺序')}</h2><p className="form-hint actions-hint">{t('使用箭头调整顺序。第一个已启用的操作为默认操作；前 3 个显示为标签，其余收进“更多操作”。禁用的操作不会显示。')}</p></div><button className="button primary" disabled={busy} onClick={() => setEditing({ id: `custom:${crypto.randomUUID()}`, name: '', icon: 'Sparkles', prompt: 'Explain the following content in {{language}}.\n\n{{selection}}', modelId: null, showInQuickActions: true, execution: 'direct' })}><Plus size={15}/>{t('新建操作')}</button></div>
    <span className="sr-only" role="status">{announcement}</span>
    {!defaultAction && <p className="form-hint actions-hint">{t('所有操作均已禁用。启用任意操作后即可使用划词阅读。')}</p>}
    {error && <p className="inline-status failure" role="alert">{t(error)}</p>}
    <div className={`actions-layout ${editing ? 'is-editing' : ''}`}><div className="actions-list" ref={list}>{settings.actions.map((action, index) => <article className={`action-setting ${editing?.id === action.id ? 'selected' : ''}`} key={action.id} data-action-id={action.id}>
      <span className="model-avatar"><ActionIcon name={action.icon}/></span><div className="action-info"><strong>{actionLabel(action, t)}{defaultAction?.id === action.id && <span className="default-label">{t('默认')}</span>}</strong><small>{action.modelId ? settings.models.find(m => m.id === action.modelId)?.name : t('跟随当前模型')} · {action.execution === 'ask' ? t('发送消息时请求') : action.execution === 'direct' ? t('直接执行') : t('先编辑，再执行')}</small></div>
      <div className="action-setting-tools"><label className="action-quick-toggle"><span>{t(action.showInQuickActions ? '已启用' : '已禁用')}</span><input type="checkbox" className="toggle" aria-label={`${t('启用操作')} ${actionLabel(action, t)}`} checked={action.showInQuickActions} disabled={busy} onChange={e => void perform('actions:save', { ...action, showInQuickActions: e.target.checked })}/></label><div className="action-order-tools"><button type="button" className="icon-button" data-move="up" aria-label={`${t('上移')} ${actionLabel(action, t)}`} title={t('上移')} disabled={busy || index === 0} onClick={() => void move(index, -1)}><ArrowUp size={15}/></button><button type="button" className="icon-button" data-move="down" aria-label={`${t('下移')} ${actionLabel(action, t)}`} title={t('下移')} disabled={busy || index === settings.actions.length - 1} onClick={() => void move(index, 1)}><ArrowDown size={15}/></button></div><button className="icon-button" aria-label={`${t('编辑')} ${actionLabel(action, t)}`} onClick={() => setEditing(action)}><Pencil size={15}/></button>{!builtinAction(action.id) && <button className="icon-button" aria-label={`${t('删除')} ${actionLabel(action, t)}`} onClick={() => setDeleting(action.id)}><Trash2 size={15}/></button>}</div>
      {deleting === action.id && <div className="action-delete-confirm"><span>{t('删除此模板？已有对话仍会保留。')}</span><button className="small-button danger-button" disabled={busy} onClick={async () => { await perform('actions:delete', action.id); if (editing?.id === action.id) setEditing(null); setDeleting(null); }}>{t('删除操作')}</button><button className="small-button" onClick={() => setDeleting(null)}>{t('取消')}</button></div>}
    </article>)}</div>{editing && <ActionForm key={editing.id} initial={editing} settings={settings} t={t} onCancel={() => setEditing(null)} onSave={async action => { onSettings(await rpc<Settings>('actions:save', action)); setEditing(null); }}/>}</div>
  </section>;
}
