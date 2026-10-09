import { useEffect, useRef, useState } from 'react';
import { Bookmark, Download, ExternalLink, Pencil, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { NoteEditor } from './NoteEditor';
import { Select } from './Select';
import { filterNotes, notesMarkdown, sourceHost, sourceUrl } from '../shared/notes';
import { translator } from '../shared/i18n';
import { rpc } from '../shared/rpc';
import type { SavedNote, UILanguage } from '../shared/types';

export function NotesList({ language }: { language: UILanguage }) {
  const t = translator(language);
  const [notes, setNotes] = useState<SavedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [host, setHost] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [revision, setRevision] = useState(0);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let disposed = false;
    let request = 0;
    const refresh = async () => {
      const version = ++request;
      try { const result = await rpc<SavedNote[]>('notes:list'); if (!disposed && version === request) { setNotes(result); setError(''); } }
      catch (error) { if (!disposed && version === request) setError(error instanceof Error ? error.message : '收藏操作失败，请重试。'); }
      finally { if (!disposed && version === request) setLoading(false); }
    };
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => { if (area === 'local' && changes.notes) void refresh(); };
    chrome.storage.onChanged.addListener(changed); void refresh();
    return () => { disposed = true; chrome.storage.onChanged.removeListener(changed); };
  }, [revision]);
  const hosts = [...new Set(notes.map(note => sourceHost(note.sourceUrl)).filter(Boolean))].sort();
  const visible = filterNotes(notes, query, host);
  const current = notes.find(note => note.id === selected);
  const back = () => { setSelected(null); setEditing(false); setConfirmDelete(false); requestAnimationFrame(() => search.current?.focus()); };
  const exportNotes = () => {
    const url = URL.createObjectURL(new Blob([notesMarkdown(current ? [current] : visible, language)], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `selio-notes-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="notes-panel" aria-label={t('收藏与 AI 笔记')}>
    <header className="notes-heading"><div><h1>{t('收藏与 AI 笔记')}</h1><p>{t('保存在本机，随时回顾。')}</p></div><button className="button secondary" disabled={loading || !(current || visible.length)} onClick={exportNotes} title={t('导出当前筛选结果')}><Download size={14}/>{t('导出 Markdown')}</button></header>
    {error && <div className="note-error" role="alert">{t(error)} <button className="text-button" onClick={() => setRevision(value => value + 1)}>{t('重试')}</button></div>}
    {current ? <div className="note-detail">
      <button className="text-button" onClick={back}>← {t('返回收藏')}</button>
      <h2>{current.sourceTitle || t('未命名来源')}</h2>
      {sourceUrl(current.sourceUrl) ? <a className="note-source" href={sourceUrl(current.sourceUrl)} target="_blank" rel="noopener noreferrer">{sourceHost(current.sourceUrl)}<ExternalLink size={13}/></a> : <p>{t('来源不可用')}</p>}
      <time dateTime={new Date(current.createdAt).toISOString()}>{new Date(current.createdAt).toLocaleString(language)}</time>
      <h3>{t('选中文字')}</h3><blockquote>{current.selection || t('网页问答')}</blockquote>
      <h3>{t('AI 回答')}</h3><div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>, img: ({ alt }) => <span className="image-placeholder">{alt || t('不加载外部图片')}</span> }}>{current.answer}</ReactMarkdown></div>
      {editing ? <NoteEditor key={current.id} note={current.note} tags={current.tags} language={language} onCancel={() => setEditing(false)} onSave={async (note, tags) => {
        const updated = await rpc<SavedNote>('notes:update', { id: current.id, note, tags });
        setNotes(items => items.map(item => item.id === updated.id ? updated : item)); setEditing(false);
      }}/> : <><h3>{t('用户备注')}</h3><p className="note-content">{current.note || t('暂无备注')}</p><div className="note-tags">{current.tags.map(tag => <span key={tag}>{tag}</span>)}</div><button className="text-button" onClick={() => setEditing(true)}><Pencil size={13}/>{t('编辑备注与标签')}</button></>}
      <div className="note-delete">{confirmDelete ? <><p>{t('删除这条收藏？')}</p><button className="button secondary" disabled={deleting} onClick={() => setConfirmDelete(false)}>{t('取消')}</button><button className="button danger-button" disabled={deleting} onClick={() => {
        setDeleting(true);
        void rpc('notes:delete', { id: current.id }).then(() => { setNotes(items => items.filter(item => item.id !== current.id)); back(); }, error => setError(error.message)).finally(() => setDeleting(false));
      }}>{t('确认删除')}</button></> : <button className="text-button" onClick={() => setConfirmDelete(true)}><Trash2 size={13}/>{t('删除收藏')}</button>}</div>
    </div> : <>
      <div className="notes-filters"><div className="field"><label htmlFor="notes-search">{t('搜索收藏')}</label><input ref={search} id="notes-search" type="search" placeholder={t('搜索原文、回答、备注或标签')} value={query} onChange={event => setQuery(event.target.value)}/></div><div className="field"><label htmlFor="notes-source">{t('筛选来源')}</label><Select id="notes-source" value={host} onChange={event => setHost(event.target.value)}><option value="">{t('全部来源')}</option>{[...new Set([...hosts, ...(host ? [host] : [])])].map(value => <option key={value} value={value}>{value}</option>)}</Select></div></div>
      <p className="notes-count" role="status">{loading ? t('正在读取…') : `${visible.length} / ${notes.length} ${t('条收藏')}`}</p>
      {!loading && !visible.length && <div className="notes-empty"><Bookmark size={28}/><h2>{t(notes.length ? '没有匹配的收藏' : '把有用的回答留下来')}</h2><p>{t(notes.length ? '试试其他关键词或来源。' : '在回答下方点击 Save，添加备注和标签。')}</p>{notes.length > 0 && <button className="text-button" onClick={() => { setQuery(''); setHost(''); }}>{t('清除筛选')}</button>}</div>}
      <ul className="notes-list">{visible.map(note => <li key={note.id}><button className="note-row" onClick={() => { setSelected(note.id); setEditing(false); setConfirmDelete(false); }}><span className="note-row-meta"><span>{sourceHost(note.sourceUrl) || t('来源不可用')}</span><time dateTime={new Date(note.createdAt).toISOString()}>{new Date(note.createdAt).toLocaleDateString(language)}</time></span><strong>{note.sourceTitle || t('未命名来源')}</strong><p>{note.selection || note.answer}</p>{note.note && <p className="note-row-comment">{note.note}</p>}<span className="note-tags">{note.tags.map(tag => <span key={tag}>{tag}</span>)}</span></button></li>)}</ul>
    </>}
  </section>;
}
