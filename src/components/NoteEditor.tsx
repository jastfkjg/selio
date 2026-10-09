import { useEffect, useId, useRef, useState } from 'react';
import { NOTE_LIMITS, parseTags, validateNoteDetails } from '../shared/notes';
import { translator } from '../shared/i18n';
import type { UILanguage } from '../shared/types';

export function NoteEditor({ note = '', tags = [], language, onSave, onCancel }: {
  note?: string; tags?: string[]; language: UILanguage;
  onSave: (note: string, tags: string[]) => Promise<void>; onCancel: () => void;
}) {
  const t = translator(language);
  const id = useId();
  const [text, setText] = useState(note);
  const [labels, setLabels] = useState(tags.join(', '));
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => form.current?.scrollIntoView({ block: 'nearest' }));
    return () => cancelAnimationFrame(frame);
  }, []);
  const [error, setError] = useState('');
  const save = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { const details = validateNoteDetails(text, parseTags(labels)); await onSave(details.note, details.tags); }
    catch (error) { setError(error instanceof Error ? error.message : '收藏操作失败，请重试。'); }
    finally { pending.current = false; setBusy(false); }
  };
  return <form ref={form} className="note-editor" onSubmit={event => { event.preventDefault(); if (event.nativeEvent.isTrusted) void save(); }}>
    <div className="field"><label htmlFor={`${id}-note`}>{t('用户备注')} <small>{t('可选')}</small></label><textarea autoFocus id={`${id}-note`} value={text} onChange={event => setText(event.target.value)} maxLength={NOTE_LIMITS.note} rows={3} disabled={busy}/></div>
    <div className="field"><label htmlFor={`${id}-tags`}>{t('标签')} <small>{t('可选')}</small></label><input id={`${id}-tags`} value={labels} onChange={event => setLabels(event.target.value)} maxLength={1000} aria-describedby={`${id}-hint`} disabled={busy}/><small id={`${id}-hint`}>{t('用逗号分隔，最多 20 个标签。')}</small></div>
    {error && <p className="note-error" role="alert">{t(error)}</p>}
    <div className="note-editor-actions"><button type="button" className="button secondary" disabled={busy} onClick={onCancel}>{t('取消')}</button><button type="submit" className="button primary" disabled={busy}>{t(busy ? '正在保存…' : '保存笔记')}</button></div>
  </form>;
}
