import { useEffect, useId, useRef } from 'react';
import { Check, X } from 'lucide-react';
import { NOTE_LIMITS, parseTags } from '../shared/notes';
import { translator } from '../shared/i18n';
import { useNoteDraft } from '../hooks/useNoteDraft';
import type { SavedNote, UILanguage } from '../shared/types';

export function NoteEditor({ note, knownTags = [], language, onClose }: {
  note: SavedNote; knownTags?: string[]; language: UILanguage; onClose: () => void;
}) {
  const t = translator(language);
  const id = useId();
  const draft = useNoteDraft(note);
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const loaded = draft.status !== 'loading';
  useEffect(() => {
    if (!loaded) return;
    const frame = requestAnimationFrame(() => { form.current?.scrollIntoView({ block: 'nearest' }); input.current?.focus({ preventScroll: true }); });
    return () => cancelAnimationFrame(frame);
  }, [loaded]);
  const tags = parseTags(draft.labels);
  const suggestions = knownTags.filter(tag => !tags.some(value => value.toLocaleLowerCase() === tag.toLocaleLowerCase())).slice(0, 5);
  const close = () => { void draft.flush(); onClose(); };
  return <form ref={form} className="note-editor" onSubmit={event => { event.preventDefault(); if (event.nativeEvent.isTrusted) void draft.flush(); }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void draft.flush(); }
  }}>
    <div className="note-editor-heading"><label htmlFor={`${id}-note`}>{t('我的笔记')}</label><button type="button" className="icon-button" aria-label={t('收起编辑')} onClick={close}><X size={14} aria-hidden="true"/></button></div>
    <textarea ref={input} id={`${id}-note`} placeholder={t('记下你的理解…')} value={draft.text} onChange={event => draft.change(event.target.value, draft.labels)} maxLength={NOTE_LIMITS.note} rows={3} disabled={draft.status === 'loading'}/>
    <div className="note-tag-field"><label htmlFor={`${id}-tags`}>{t('标签')}</label><input id={`${id}-tags`} placeholder={t('用逗号分隔')} value={draft.labels} onChange={event => draft.change(draft.text, event.target.value)} maxLength={1000} disabled={draft.status === 'loading'}/></div>
    {suggestions.length > 0 && <div className="note-tag-suggestions" aria-label={t('已有标签')}>{suggestions.map(tag => <button key={tag} type="button" onClick={() => draft.change(draft.text, [...tags, tag].join(', '))}>+ {tag}</button>)}</div>}
    <div className="note-editor-footer"><span role="status">{draft.status === 'saved' && <Check size={12} aria-hidden="true"/>}{t(draft.status === 'loading' ? '正在读取…' : draft.status === 'saved' ? '已自动保存' : draft.status === 'error' ? '未保存，草稿已保留' : '正在保存…')}</span>{draft.status === 'error' ? <button type="submit" className="text-button">{t('重试')}</button> : <small>{draft.text.length.toLocaleString()} / {NOTE_LIMITS.note.toLocaleString()}</small>}</div>
    {draft.error && <p className="note-error" role="alert">{t(draft.error)}</p>}
  </form>;
}
