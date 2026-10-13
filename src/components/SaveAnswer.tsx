import { useEffect, useRef, useState } from 'react';
import { Bookmark, Check } from 'lucide-react';
import { NoteEditor } from './NoteEditor';
import { discardNoteDraft } from '../hooks/useNoteDraft';
import { subscribeNotes } from '../shared/note-events';
import { rpc } from '../shared/rpc';
import { translator } from '../shared/i18n';
import type { SavedNote, UILanguage } from '../shared/types';

export function SaveAnswer({ tabId, conversationId, messageId, disabled, language }: {
  tabId: number; conversationId: string; messageId: string; disabled: boolean; language: UILanguage;
}) {
  const t = translator(language);
  const [saved, setSaved] = useState<SavedNote | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let active = true, revision = 0;
    const refresh = () => {
      const request = ++revision;
      void rpc<SavedNote | null>('notes:find', { tabId, conversationId, messageId }).then(note => {
        if (!active || request !== revision) return;
        setSaved(previous => { if (!note && previous) discardNoteDraft(previous.id); return note; });
        if (!note) setOpen(false);
      }).catch(() => undefined);
    };
    refresh(); const unsubscribe = subscribeNotes(refresh);
    // Trusted extension pages receive storage events directly; content scripts use the chat port.
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => { if (area === 'local' && changes.notes) refresh(); };
    chrome.storage.onChanged.addListener(changed);
    return () => { active = false; unsubscribe(); chrome.storage.onChanged.removeListener(changed); };
  }, [tabId, conversationId, messageId]);
  const save = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try { setSaved(await rpc<SavedNote>('notes:save', { tabId, conversationId, messageId })); }
    catch (error) { setError(error instanceof Error ? error.message : '收藏操作失败，请重试。'); }
    finally { pending.current = false; setBusy(false); }
  };
  const close = () => { setOpen(false); trigger.current?.focus(); };
  return <div className="save-answer">
    <div className="save-answer-tools">
      {saved ? <><span className="saved-status" role="status"><Check size={13} aria-hidden="true"/>{t('已收藏')}</span><button ref={trigger} className="copy-button" aria-expanded={open} onClick={() => { setOpen(value => !value); setError(''); }}>{t(saved.note || saved.tags.length ? '编辑笔记' : '添加备注')}</button><button className="copy-button" onClick={event => { if (event.isTrusted) void rpc('notes:open', { id: saved.id, tabId }).catch(error => setError(error.message)); }}>{t('查看收藏')}</button></> : <button ref={trigger} className="copy-button save-button" disabled={disabled || busy} onClick={event => { if (event.isTrusted) void save(); }}><Bookmark size={13} aria-hidden="true"/>{t(busy ? '正在保存…' : '收藏')}</button>}
    </div>
    {error && <p className="note-error" role="alert">{t(error)}</p>}
    {open && saved && <NoteEditor key={saved.id} note={saved} language={language} onClose={close}/>}
  </div>;
}
