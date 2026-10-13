import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, Download, ExternalLink, Pencil, Search, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { AnswerContent } from './AnswerContent';
import { NoteEditor } from './NoteEditor';
import { Select } from './Select';
import { discardNoteDraft } from '../hooks/useNoteDraft';
import { filterNotes, noteActionLabel, noteMatches, notesMarkdown, noteTitle, searchTerms, sourceHost, sourceUrl } from '../shared/notes';
import { translator } from '../shared/i18n';
import { rpc } from '../shared/rpc';
import type { SavedNote, UILanguage } from '../shared/types';

function Highlight({ text, query }: { text: string; query: string }) {
  const terms = searchTerms(query).sort((a, b) => b.length - a.length);
  if (!terms.length) return <>{text}</>;
  const pattern = new RegExp(`(${terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'giu');
  return <>{text.split(pattern).map((part, index) => index % 2 ? <mark key={index}>{part}</mark> : part)}</>;
}
export function NotesList({ language, active, request }: { language: UILanguage; active: boolean; request: { id: string; request: string } | null }) {
  const t = translator(language);
  const [notes, setNotes] = useState<SavedNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [host, setHost] = useState('');
  const [tag, setTag] = useState('');
  const [filters, setFilters] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [revision, setRevision] = useState(0);
  const scroll = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());
  const editButton = useRef<HTMLButtonElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let disposed = false, latest = 0;
    const refresh = async () => {
      const version = ++latest;
      try { const result = await rpc<SavedNote[]>('notes:list'); if (!disposed && version === latest) { setNotes(result); setError(''); } }
      catch (error) { if (!disposed && version === latest) setError(error instanceof Error ? error.message : '收藏操作失败，请重试。'); }
      finally { if (!disposed && version === latest) setLoading(false); }
    };
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => { if (area === 'local' && changes.notes) void refresh(); };
    chrome.storage.onChanged.addListener(changed); void refresh();
    return () => { disposed = true; chrome.storage.onChanged.removeListener(changed); };
  }, [revision]);
  useEffect(() => { if (request) { setSelected(request.id); setEditing(false); setConfirmDelete(false); } }, [request]);
  const current = notes.find(note => note.id === selected);
  useEffect(() => {
    if (selected && !loading && !error && !current) { discardNoteDraft(selected); setSelected(null); setEditing(false); }
  }, [selected, loading, error, current]);
  useLayoutEffect(() => { if (active && scroll.current) scroll.current.scrollTop = positions.current.get(selected ?? 'list') ?? 0; }, [selected, active]);
  const hosts = [...new Set(notes.map(note => sourceHost(note.sourceUrl)).filter(Boolean))].sort();
  const tags = [...new Set(notes.flatMap(note => note.tags))].sort();
  const visible = filterNotes(notes, query, host, tag);
  const open = (id: string) => {
    setSelected(id); setEditing(false); setConfirmDelete(false);
    requestAnimationFrame(() => detailHeading.current?.focus({ preventScroll: true }));
  };
  const back = () => {
    setSelected(null); setEditing(false); setConfirmDelete(false);
    requestAnimationFrame(() => {
      const row = [...(scroll.current?.querySelectorAll<HTMLButtonElement>('.note-row-open') ?? [])].find(element => element.dataset.noteId === selected);
      (row ?? search.current)?.focus({ preventScroll: true });
    });
  };
  const exportNotes = () => {
    const url = URL.createObjectURL(new Blob([notesMarkdown(current ? [current] : visible, language)], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `selio-notes-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportLabel = current ? t('导出这条笔记') : `${t('导出')} ${visible.length} ${language === 'en' && visible.length === 1 ? 'note' : t('条')}`;
  return <section className="notes-panel" aria-label={t('收藏与 AI 笔记')}>
    <header className="notes-heading">
      {current ? <button className="icon-button" aria-label={t('返回收藏')} title={t('返回收藏')} onClick={back}><ArrowLeft size={17} aria-hidden="true"/></button> : <h1>{t('收藏笔记')}<small>{notes.length}</small></h1>}
      {current && <span className="note-detail-caption">{t('收藏笔记')}</span>}
      <button className="text-button notes-export" disabled={loading || !(current || visible.length)} onClick={exportNotes} title={`${exportLabel} · Markdown`}><Download size={14} aria-hidden="true"/>{exportLabel}</button>
    </header>
    {error && <div className="note-error" role="alert">{t(error)} <button className="text-button" onClick={() => setRevision(value => value + 1)}>{t('重试')}</button></div>}
    <div ref={scroll} className="notes-scroll" onScroll={event => { positions.current.set(selected ?? 'list', event.currentTarget.scrollTop); }}>
    {current ? <div className="note-detail">
      <h2 ref={detailHeading} tabIndex={-1}>{noteTitle(current) || t('未命名来源')}</h2>
      <div className="note-detail-meta">{sourceUrl(current.sourceUrl) && <a className="note-source" href={sourceUrl(current.sourceUrl)} target="_blank" rel="noopener noreferrer" title={current.sourceUrl}>{current.sourceTitle || sourceHost(current.sourceUrl)}<ExternalLink size={12} aria-hidden="true"/></a>}<span>{noteActionLabel(current, language)}</span><time dateTime={new Date(current.createdAt).toISOString()}>{new Date(current.createdAt).toLocaleDateString(language)}</time>{current.incomplete && <span className="note-incomplete">{t('回答未完成')}</span>}</div>
      {editing ? <NoteEditor key={current.id} note={current} knownTags={tags} language={language} onClose={() => { setEditing(false); requestAnimationFrame(() => editButton.current?.focus({ preventScroll: true })); }}/> : <div className="note-personal">
        <div className="note-personal-heading"><h3>{t('我的笔记')}</h3><button ref={editButton} className="text-button" onClick={() => setEditing(true)}><Pencil size={13} aria-hidden="true"/>{t(current.note || current.tags.length ? '编辑笔记' : '添加备注')}</button></div>
        {current.note ? <p className="note-content">{current.note}</p> : <button className="note-add-prompt" onClick={() => setEditing(true)}>{t('记下你的理解…')}</button>}
        <div className="note-tags">{current.tags.map(value => <button key={value} onClick={() => { setTag(value); back(); }}>{value}</button>)}</div>
      </div>}
      {current.selection && <details className="note-section" open={current.selection.length < 240}><summary>{t('选中文字')}</summary><blockquote>{current.selection}</blockquote></details>}
      {current.question && current.selection && <div className="note-question"><h3>{t('问题')}</h3><p>{current.question}</p></div>}
      <details className="note-section" open><summary>{t('AI 回答')}{current.incomplete && <span className="note-incomplete">{t('回答未完成')}</span>}</summary><AnswerContent key={current.id} text={current.answer} language={language} page={current.evidence ? { ...current.evidence.page, title: current.sourceTitle, url: current.sourceUrl } : undefined} context={current.evidence?.context} totalChunks={current.evidence?.totalChunks} saved/>{current.generation && <p className="note-model">{t('生成模型')} · {current.generation.model || current.generation.modelName}</p>}</details>
      <div className="note-delete">{confirmDelete ? <><p>{t('删除这条收藏？')}</p><button className="button secondary" disabled={deleting} onClick={() => setConfirmDelete(false)}>{t('取消')}</button><button className="button danger-button" disabled={deleting} onClick={() => {
        setDeleting(true);
        void rpc('notes:delete', { id: current.id }).then(() => { discardNoteDraft(current.id); setNotes(items => items.filter(item => item.id !== current.id)); back(); }, error => setError(error.message)).finally(() => setDeleting(false));
      }}>{t('确认删除')}</button></> : <button className="text-button" onClick={() => setConfirmDelete(true)}><Trash2 size={13} aria-hidden="true"/>{t('删除收藏')}</button>}</div>
    </div> : <>
      <div className="notes-search-row"><div className="notes-search"><Search size={15} aria-hidden="true"/><label className="sr-only" htmlFor="notes-search">{t('搜索收藏')}</label><input ref={search} id="notes-search" type="search" maxLength={200} placeholder={t('搜索笔记…')} value={query} onChange={event => setQuery(event.target.value)}/></div><button className="icon-button notes-filter-toggle" aria-label={t('筛选收藏')} title={t('筛选收藏')} aria-expanded={filters} aria-controls="notes-filters" onClick={() => setFilters(value => !value)}><SlidersHorizontal size={17} aria-hidden="true"/>{(host || tag) && <i/>}</button></div>
      {filters && <div id="notes-filters" className="notes-filters"><div className="field"><label htmlFor="notes-source">{t('筛选来源')}</label><Select id="notes-source" value={host} onChange={event => setHost(event.target.value)}><option value="">{t('全部来源')}</option>{[...new Set([...hosts, ...(host ? [host] : [])])].map(value => <option key={value} value={value}>{value}</option>)}</Select></div><div className="field"><label htmlFor="notes-tag">{t('标签')}</label><Select id="notes-tag" value={tag} onChange={event => setTag(event.target.value)}><option value="">{t('全部标签')}</option>{[...new Set([...tags, ...(tag ? [tag] : [])])].map(value => <option key={value} value={value}>{value}</option>)}</Select></div></div>}
      {(host || tag) && <div className="note-tags active-note-filters">{host && <button onClick={() => setHost('')} aria-label={`${t('移除来源筛选')} ${host}`}>{host}<X size={11} aria-hidden="true"/></button>}{tag && <button onClick={() => setTag('')} aria-label={`${t('移除标签筛选')} ${tag}`}>{tag}<X size={11} aria-hidden="true"/></button>}</div>}
      <p className="notes-count" role="status">{loading ? t('正在读取…') : query || host || tag ? `${visible.length} / ${notes.length} ${t('条收藏')}` : t('保存在本机，随时回顾。')}</p>
      {!loading && !visible.length && !error && <div className="notes-empty"><Bookmark size={28} aria-hidden="true"/><h2>{t(notes.length ? '没有匹配的收藏' : '把有用的回答留下来')}</h2><p>{t(notes.length ? '试试其他关键词或来源。' : '点击回答下方的收藏，即可保存。')}</p>{notes.length > 0 && <button className="text-button" onClick={() => { setQuery(''); setHost(''); setTag(''); }}>{t('清除筛选')}</button>}</div>}
      <ul className="notes-list">{visible.map(note => {
        const matches = noteMatches(note, query);
        return <li key={note.id}><article className="note-row"><button className="note-row-open" data-note-id={note.id} onClick={() => open(note.id)}>
          <strong><Highlight text={noteTitle(note) || t('未命名来源')} query={query}/></strong>
          <span className="note-row-meta"><span title={note.sourceUrl}>{sourceHost(note.sourceUrl) || noteActionLabel(note, language)}</span><time dateTime={new Date(note.createdAt).toISOString()}>{new Date(note.createdAt).toLocaleDateString(language)}</time>{note.incomplete && <span className="note-incomplete">{t('未完成')}</span>}</span>
          <span className="note-row-source"><Highlight text={note.sourceTitle} query={query}/></span>
          {matches.length ? matches.slice(0, 3).map((match, index) => <p className="note-match" key={index}><span>{t('匹配于')}{t(match.field)} · </span><Highlight text={match.text} query={query}/></p>) : <p className={note.note ? 'note-row-comment' : ''}>{note.note || note.answer}</p>}
        </button><div className="note-tags">{note.tags.slice(0, 2).map(value => <button key={value} onClick={() => setTag(value)}><Highlight text={value} query={query}/></button>)}{note.tags.length > 2 && <button aria-label={t('查看全部标签')} onClick={() => open(note.id)}>+{note.tags.length - 2}</button>}</div></article></li>;
      })}</ul>
    </>}
    </div>
  </section>;
}
