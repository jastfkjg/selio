import { useEffect, useRef, useState } from 'react';
import { Bookmark, Check } from 'lucide-react';
import { NoteEditor } from './NoteEditor';
import { rpc } from '../shared/rpc';
import { translator } from '../shared/i18n';
import type { SavedNote, UILanguage } from '../shared/types';

export function SaveAnswer({ tabId, conversationId, messageId, disabled, language }: {
  tabId: number; conversationId: string; messageId: string; disabled: boolean; language: UILanguage;
}) {
  const t = translator(language);
  const [saved, setSaved] = useState<SavedNote | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let active = true;
    void rpc<SavedNote | null>('notes:find', { tabId, conversationId, messageId }).then(note => { if (active) setSaved(note); }).catch(() => undefined);
    return () => { active = false; };
  }, [tabId, conversationId, messageId]);
  const edit = async () => {
    setLoading(true); setError('');
    try { setSaved(await rpc<SavedNote | null>('notes:find', { tabId, conversationId, messageId })); setOpen(true); }
    catch (error) { setError(error instanceof Error ? error.message : '收藏操作失败，请重试。'); }
    finally { setLoading(false); }
  };
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <div className="save-answer">
    <button ref={trigger} className="copy-button save-button" disabled={disabled || loading} aria-expanded={open} onClick={event => { if (event.isTrusted) { if (open) close(); else void edit(); } }}>{saved ? <Check size={13}/> : <Bookmark size={13}/>} {t(loading ? '正在读取…' : saved ? '已收藏' : '收藏')}</button>
    {error && <p className="note-error" role="alert">{t(error)}</p>}
    {open && <NoteEditor note={saved?.note} tags={saved?.tags} language={language} onCancel={close} onSave={async (note, tags) => {
      const result = await rpc<SavedNote>('notes:save', { tabId, conversationId, messageId, note, tags });
      setSaved(result); close();
    }}/>}
    <span className="sr-only" role="status">{saved ? t('笔记已保存到本机。') : ''}</span>
  </div>;
}
