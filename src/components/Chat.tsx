import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUp, Check, ChevronDown, Copy, Languages, ListFilter, PanelRightOpen, RotateCcw, Settings2, Sparkles, Square, X } from 'lucide-react';
import { ACTIONS, LIMITS, type Action, type SelectionSnapshot } from '../shared/types';
import { rpc } from '../shared/rpc';
import type { ChatSession } from '../hooks/useChat';
import { translator } from '../shared/i18n';
import { Brand, Mark } from './Brand';

const icons = { translate: Languages, summarize: ListFilter, explain: Sparkles };
export function Chat({ session, onClose, onPin, pending, onAccept, onDismiss, panel = false }: {
  session: ChatSession; onClose?: () => void; onPin?: () => void; pending?: SelectionSnapshot | null;
  onAccept?: () => void; onDismiss?: () => void; panel?: boolean;
}) {
  const t = translator(session.preferences.uiLanguage);
  const { conversation: chat, connected, error, send, setError } = session;
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState('');
  const [draft, setDraft] = useState('');
  const draftRef = useRef('');
  const chatIdRef = useRef<string | undefined>(undefined);
  const pendingDraft = useRef<string | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const followScroll = useRef(true);
  const generating = chat?.status === 'generating';
  useEffect(() => {
    if (chat?.id !== chatIdRef.current) {
      chatIdRef.current = chat?.id;
      pendingDraft.current = null;
      draftRef.current = chat?.draft ?? ''; setDraft(draftRef.current);
      followScroll.current = true;
    } else if (pendingDraft.current === null || chat?.draft === pendingDraft.current) {
      pendingDraft.current = null;
      draftRef.current = chat?.draft ?? ''; setDraft(draftRef.current);
    }
  }, [chat?.id, chat?.draft]);
  useEffect(() => {
    if (followScroll.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [chat?.messages, generating]);
  const changeDraft = (value: string) => {
    draftRef.current = value; pendingDraft.current = value; setDraft(value);
    send({ type: 'draft', text: value });
  };
  const submit = () => {
    if (!draftRef.current.trim() || generating || !connected) return;
    const text = draftRef.current;
    pendingDraft.current = ''; draftRef.current = ''; setDraft('');
    send({ type: 'ask', text });
  };
  const copy = async (id: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(''), 1800); }
    catch { setError("复制未成功，请选中回答后手动复制。"); }
  };
  return <section lang={session.preferences.uiLanguage} className={`chat ${panel ? 'chat-panel' : ''}`} aria-label={t("Selio 阅读助手")}>
    <header className="chat-header"><Brand compact/><span className="header-divider"/><span className="header-caption">{chat ? t(ACTIONS[chat.action]) : t("阅读助手")}</span><div className="header-tools">
      {onPin && <button className="icon-button" title={t("固定到侧边栏")} aria-label={t("固定到侧边栏")} onClick={e => { if (e.isTrusted) onPin(); }}><PanelRightOpen size={17}/></button>}
      <button className="icon-button" title={t("打开设置")} aria-label={t("打开设置")} onClick={() => void rpc('open:options').catch(e => setError(e.message))}><Settings2 size={16}/></button>
      {onClose && <button className="icon-button" aria-label={t("收起浮窗，保留对话")} title={t("收起浮窗，保留对话")} onClick={onClose}><X size={18}/></button>}
    </div></header>
    {pending && <div className="selection-notice"><div><strong>{t("发现新的选中文字")}</strong><p>{t("切换会结束当前对话，清除这段对话的草稿。")}</p></div><div className="inline-actions"><button className="small-button primary" onClick={e => { if (e.isTrusted) onAccept?.(); }}>{t("切换选区")}</button><button className="small-button" onClick={onDismiss}>{t("保留对话")}</button></div></div>}
    {!chat ? <div className="chat-empty"><span className="empty-mark"><Mark size={42}/></span><h2>{t("让每一次划词，")}<br/>{t("多一点理解。")}</h2><p>{t("在网页中选中文字，点击 Selio 图标。")}<br/>{t("翻译、提炼重点，或继续追问。")}</p><div className="empty-steps"><span>{t("选择文字")}</span><span>→</span><span>{t("获得理解")}</span><span>→</span><span>{t("继续探索")}</span></div><button className="text-button" onClick={() => void rpc('open:options')}>{t("配置模型与网站权限")} <span>↗</span></button></div> : <>
      <div className="action-tabs" role="group" aria-label={t("阅读操作")}>{(Object.keys(ACTIONS) as Action[]).map(action => { const Icon = icons[action]; return <button key={action} className={chat.action === action ? 'active' : ''} disabled={!connected} onClick={e => { if (e.isTrusted && action !== chat.action) send({ type: 'action', action }); }}><Icon size={15}/>{t(ACTIONS[action])}</button>; })}</div>
      <div className="context-row"><label htmlFor={`scope-${chat.id}`}>{t("发送范围")}</label><select id={`scope-${chat.id}`} value={chat.scope} disabled={!connected} onChange={e => { if (e.nativeEvent.isTrusted) send({ type: 'scope', scope: e.target.value as 'selection' | 'paragraph' }); }}><option value="selection">{t("仅选中文字")}</option><option value="paragraph">{t("选中文字 + 所在段落")}</option></select></div>
      <div className={`source-preview ${expanded ? 'expanded' : ''}`}><button onClick={() => setExpanded(!expanded)} aria-expanded={expanded}><span className="eyebrow">{t("选中文字")} <span>· {chat.selection.text.length.toLocaleString()}  {t("字符")}</span></span><ChevronDown size={14} className={expanded ? 'rotate' : ''}/></button><p>{chat.selection.text}</p>{expanded && chat.scope === 'paragraph' && <p className="paragraph-preview"><strong>{t("发送的段落：")}</strong>{chat.selection.paragraph}</p>}{chat.selection.text.length >= LIMITS.selection && <small>{t("长选区仅保留前")} {LIMITS.selection.toLocaleString()}  {t("字符")}</small>}</div>
      <div className="messages" ref={scroll} onScroll={() => { const el = scroll.current; if (el) followScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 70; }} aria-label={t("对话内容")}>
        {chat.messages.map(message => <article key={message.id} className={`message message-${message.role}`}>
          {message.role === 'user' ? <><span className="message-label">{t("你")}</span><p>{message.content}</p></> : <><span className="message-label"><span className="answer-dot"/>Selio {generating && message.id === chat.messages.at(-1)?.id && <span className="generating-label">{t("正在思考")}<span className="animated-dots">…</span></span>}</span><div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>, img: ({ alt }) => <span className="image-placeholder">{t("[图片：")}{alt || t("不加载外部图片")}]</span> }}>{message.content}</ReactMarkdown></div>{!message.content && generating && <div className="answer-skeleton"><i/><i/><i/></div>}{message.content && <button className="copy-button" onClick={() => void copy(message.id, message.content)} aria-label={t("复制回答")}>{copied === message.id ? <Check size={13}/> : <Copy size={13}/>} {copied === message.id ? t("已复制") : t("复制")}</button>}</>}
        </article>)}
      </div>
      {(chat.error || error) && <div className="error-notice" role="alert">{t(error || chat.error || '')}{(error || chat.error) && <button className="text-button" onClick={() => void rpc('open:options')}>{t("打开设置 ↗")}</button>}</div>}
      <div className="response-tools"><span className={`status ${generating ? 'working' : ''}`} role="status">{!connected ? t("正在恢复连接") : generating ? t("正在生成") : chat.status === 'idle' ? t("已完成") : t("可继续对话")}</span><button className="text-button" disabled={!connected} onClick={e => { if (e.isTrusted) send({ type: generating ? 'stop' : 'retry' }); }}>{generating ? <Square size={12}/> : <RotateCcw size={13}/>} {generating ? t("停止生成") : t("重新生成")}</button></div>
      <form className="composer" onSubmit={e => { e.preventDefault(); if (e.nativeEvent.isTrusted) submit(); }}><label className="sr-only" htmlFor={`question-${chat.id}`}>{t("继续追问")}</label><textarea id={`question-${chat.id}`} placeholder={t("继续追问，发现更多…")} value={draft} maxLength={LIMITS.question} rows={2} disabled={!connected} onChange={e => changeDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (e.isTrusted) submit(); } }}/><div className="composer-footer"><span>{t("Enter 发送 · Shift + Enter 换行")}</span><button className="send-button" type="submit" disabled={!draft.trim() || generating || !connected} aria-label={t("发送问题")}><ArrowUp size={19}/></button></div></form>
      <footer className="chat-footer"><span className="model-indicator"/>{chat.modelId ? chat.modelName : t(chat.modelName)}<span className="footer-spacer"/>{chat.action === 'translate' ? chat.language : t("AI 回答请核实")}</footer>
    </>}
    {!chat && error && <div className="error-notice" role="alert">{t(error)}</div>}
  </section>;
}
