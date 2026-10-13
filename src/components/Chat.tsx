import { SaveAnswer } from './SaveAnswer';
import { PageContext } from './PageContext';
import { ActionIcon } from './ActionIcon';
import { PromptEditor } from './PromptEditor';
import { actionLabel, actionNavigation, builtinAction } from '../shared/actions';
import { Select } from './Select';
import { MoreActions } from './MoreActions';
import { useEffect, useRef, useState } from 'react';
import { AnswerContent } from './AnswerContent';
import { ArrowUp, GripHorizontal, Check, ChevronDown, Copy, Pencil, PanelRightOpen, RotateCcw, Settings2, Square, X } from 'lucide-react';
import { LIMITS, type Action } from '../shared/types';
import { rpc } from '../shared/rpc';
import type { ChatSession } from '../hooks/useChat';
import { translator } from '../shared/i18n';
import type { useFloatingWindow } from '../hooks/useFloatingWindow';
import { Brand, Mark } from './Brand';

export function Chat({ session, onClose, onPin, windowControls, pageTools, panel = false }: {
  pageTools?: { loading: boolean; onLoad: () => void; onToggle: () => void; onGrant?: () => void };
  windowControls?: ReturnType<typeof useFloatingWindow>;
  session: ChatSession; onClose?: () => void; onPin?: () => void;
  panel?: boolean;
}) {
  const t = translator(session.preferences.uiLanguage);
  const { conversation: chat, connected, error, send, setError } = session;
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [chat?.id]);
  const [copied, setCopied] = useState('');
  const [draft, setDraft] = useState('');
  const draftRef = useRef('');
  const chatIdRef = useRef<string | undefined>(undefined);
  const pendingDraft = useRef<string | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const followScroll = useRef(true);
  const page = chat?.page;
  const sidebarChat = Boolean(page || chat?.mode === 'general');
  const blocked = Boolean(page?.stale || pageTools?.loading);
  const generating = chat?.status === 'generating';
  const editing = chat?.status === 'editing';
  const asking = chat?.action === 'ask' && !sidebarChat;
  const currentModel = session.models.find(model => model.id === chat?.modelId);
  const modelLabel = currentModel?.model ?? t('未配置模型');
  const currentAction = chat ? session.actions.find(a => a.id === chat.action) ?? chat.template ?? builtinAction(chat.action) : undefined;
  const { quick: quickActions, more: moreActions } = actionNavigation(session.actions);
  const selectAction = (action: Action) => { if (action !== chat?.action) send({ type: 'action', action }); };

  const branchId = chat ? `${chat.id}:${chat.action}:${chat.scope}` : undefined;
  useEffect(() => {
    if (branchId !== chatIdRef.current) {
      chatIdRef.current = branchId;
      pendingDraft.current = null;
      draftRef.current = chat?.draft ?? ''; setDraft(draftRef.current);
      followScroll.current = true;
    } else if (pendingDraft.current === null || chat?.draft === pendingDraft.current) {
      pendingDraft.current = null;
      draftRef.current = chat?.draft ?? ''; setDraft(draftRef.current);
    }
  }, [branchId, chat?.draft]);
  useEffect(() => {
    if (followScroll.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [chat?.messages, generating]);
  const changeDraft = (value: string) => {
    draftRef.current = value; pendingDraft.current = value; setDraft(value);
    send({ type: 'draft', text: value });
  };
  const submit = () => {
    if (!draftRef.current.trim() || generating || !connected || blocked) return;
    const text = draftRef.current;
    pendingDraft.current = ''; draftRef.current = ''; setDraft('');
    send({ type: 'ask', text });
  };
  const copy = async (id: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(''), 1800); }
    catch { setError("复制未成功，请选中回答后手动复制。"); }
  };
  const pageToggle = pageTools && chat && <button className="page-context-toggle" role="switch" aria-checked={Boolean(page)} aria-label={t('使用当前页面')} title={t('切换会开始新对话，不携带旧对话内容。')} disabled={!connected || generating || pageTools.loading} onClick={() => { session.flushDraft(); pageTools.onToggle(); }}><span className="toggle-track"><i/></span>{t('当前网页')}</button>;
  return <section lang={session.preferences.uiLanguage} className={`chat ${panel ? 'chat-panel' : ''} ${panel && (sidebarChat || !chat) ? 'page-chat' : ''}`} aria-label={t("Selio 阅读助手")}>
    <header className={`chat-header ${windowControls ? 'draggable-header' : ''}`} onPointerDown={e => { if (windowControls && !(e.target as Element).closest('button')) windowControls.start(e, 'move'); }}>{panel ? sidebarChat || !chat ? pageToggle : <span className="panel-chat-title">{currentAction ? actionLabel(currentAction, t) : t("阅读助手")}</span> : <><Brand compact/>{currentAction && !quickActions.some(action => action.id === currentAction.id) && <><span className="header-divider"/><span className="header-caption">{actionLabel(currentAction, t)}</span></>}</>}{windowControls && <button className="icon-button drag-handle" aria-label={t('移动浮窗')} title={t('拖动移动，双击恢复位置和大小')} onPointerDown={e => windowControls.start(e, 'move')} onKeyDown={e => windowControls.keyboard(e)} onDoubleClick={windowControls.reset}><GripHorizontal size={16}/></button>}<div className="header-tools">
      {panel && pageTools && <button className="icon-button" title={t(chat?.mode === 'general' ? '开始新对话' : page ? '刷新正文并开始新对话' : '询问当前网页')} aria-label={t(chat?.mode === 'general' ? '开始新对话' : page ? '刷新正文并开始新对话' : '询问当前网页')} disabled={!connected || generating || pageTools.loading} onClick={() => { session.flushDraft(); pageTools.onLoad(); }}><RotateCcw size={16}/></button>}
      {onPin && <button className="icon-button" title={t("固定到侧边栏")} aria-label={t("固定到侧边栏")} onClick={e => { if (e.isTrusted) { session.flushDraft(); onPin(); } }}><PanelRightOpen size={17}/></button>}
      <button className="icon-button" title={t("打开设置")} aria-label={t("打开设置")} onClick={() => void rpc('open:options').catch(e => setError(e.message))}><Settings2 size={16}/></button>
      {onClose && <button className="icon-button" aria-label={t("收起浮窗，保留对话")} title={t("收起浮窗，保留对话")} onClick={() => { session.flushDraft(); onClose(); }}><X size={18}/></button>}
    </div></header>
    {pageTools?.loading && <div className="page-loading" role="status">{t('正在提取正文…')}</div>}
    {!chat ? panel ? <div className="chat-empty page-empty" aria-busy={pageTools?.loading}><p>{t(pageTools?.loading ? '正在提取正文…' : '无需划词，直接针对当前网页提问。')}</p><button className="text-button" onClick={() => void rpc('open:options')}>{t('配置模型与网站权限')} ↗</button></div> : <div className="chat-empty"><span className="empty-mark"><Mark size={42}/></span><h2>{t("让每一次划词，")}<br/>{t("多一点理解。")}</h2><p>{t("在网页中选中文字，点击 Selio 图标。")}<br/>{t("翻译、提炼重点，或继续追问。")}</p><div className="empty-steps"><span>{t("选择文字")}</span><span>→</span><span>{t("获得理解")}</span><span>→</span><span>{t("继续探索")}</span></div><button className="text-button" onClick={() => void rpc('open:options')}>{t("配置模型与网站权限")} <span>↗</span></button></div> : <>
      {pageTools && ((!panel || !sidebarChat) || pageTools.onGrant) && <div className="page-context-controls">{(!panel || !sidebarChat) && pageToggle}{pageTools.onGrant && <button className="text-button selection-access" onClick={pageTools.onGrant}>{t('在此网站启用自动划词')} ↗</button>}</div>}
      {pageTools && chat.pageError && <details className="page-unavailable" open={chat.mode !== 'general'}><summary>{t(page ? '正文刷新失败，已保留原对话。' : chat.mode === 'general' ? '网页不可用' : '无法启用页面上下文，仍可使用选中文字。')}</summary><p role="alert">{t(chat.pageError)}</p></details>}
      {page && <div className="page-source">{page.stale && <p className="page-limit" role="status">{t('网页已变化，请刷新正文后继续提问。')}</p>}<PageContext key={chat.id} page={page} language={session.preferences.uiLanguage}/></div>}
      {!sidebarChat && <>
      {quickActions.length > 0 && <div className="action-toolbar"><div className="action-tabs" role="group" aria-label={t("阅读操作")}>{quickActions.map(action => <button key={action.id} className={chat.action === action.id ? 'active' : ''} title={actionLabel(action, t)} aria-pressed={chat.action === action.id} disabled={!connected} onClick={e => { if (e.isTrusted) selectAction(action.id); }}><ActionIcon name={action.icon} size={15}/><span>{actionLabel(action, t)}</span></button>)}</div>{moreActions.length > 0 && <MoreActions actions={moreActions} value={chat.action} disabled={!connected} t={t} onSelect={selectAction}/>}</div>}
      <button className="context-disclosure" aria-label={t("展开上下文")} aria-expanded={expanded} aria-controls={`context-${chat.id}`} onClick={() => setExpanded(!expanded)}><span>{t("发送范围")}<span className="context-count"> · {chat.selection.text.length.toLocaleString()} {t("字符")}</span></span><ChevronDown size={14} className={expanded ? 'rotate' : ''}/></button>
      {expanded && <div id={`context-${chat.id}`} className="context-details"><div className="context-row"><label htmlFor={`scope-${chat.id}`}>{t("发送范围")}</label><Select id={`scope-${chat.id}`} value={chat.scope} disabled={!connected} onChange={e => { if (e.nativeEvent.isTrusted) send({ type: 'scope', scope: e.target.value as 'selection' | 'paragraph' }); }}><option value="selection">{t("仅选中文字")}</option><option value="paragraph">{t("选中文字 + 所在段落")}</option></Select></div>
      <div className="source-preview expanded"><span className="eyebrow">{t("选中文字")}</span><p>{chat.selection.text}</p>{chat.scope === 'paragraph' && <p className="paragraph-preview"><strong>{t("发送的段落：")}</strong>{chat.selection.paragraph}</p>}{chat.selection.text.length >= LIMITS.selection && <small>{t("长选区仅保留前")} {LIMITS.selection.toLocaleString()} {t("字符")}</small>}</div></div>}
      </>}
      {editing ? <PromptEditor key={branchId} session={session}/> : <div className={`messages ${chat.mode === 'general' && !chat.messages.length ? 'general-chat-idle' : ''}`} ref={scroll} onClickCapture={event => { if ((event.target as Element).closest('.citation-button, .page-context summary')) followScroll.current = false; }} onScroll={() => { const el = scroll.current; if (el) followScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 70; }} aria-label={t("对话内容")}>
        {asking && !chat.messages.length && <div className="selection-empty"><h2>{t('想了解什么？')}</h2></div>}
        {chat.mode === 'general' && !chat.messages.length && <div className="general-chat-empty"><h2>{t('有什么可以帮你？')}</h2></div>}
        {page && !chat.messages.length && <div className="page-suggestions"><h2>{t('想了解这页的什么？')}</h2>{[['概括内容', '这篇文章主要讲了什么？'], ['关键论点', '作者有哪些关键论点？'], ['实现细节', '文中有没有说明实现细节？']].map(([label, question]) => <button key={question} className="page-question" aria-label={t(question!)} disabled={!connected || blocked} onClick={() => send({ type: 'ask', text: t(question!) })}>{t(label!)}<ArrowUp size={14}/></button>)}</div>}
        {chat.messages.map(message => <article key={message.id} className={`message message-${message.role}`}>
          {message.role === 'user' ? <><span className="message-label">{t("你")}</span><p>{message.content}</p></> : <><span className="message-label"><span className="answer-dot"/>Selio {generating && message.id === chat.messages.at(-1)?.id && <span className="generating-label">{t("正在思考")}<span className="animated-dots">…</span></span>}</span><AnswerContent text={message.content} language={session.preferences.uiLanguage} page={page} context={message.pageContext}/> {message.stopped && <p className="generation-stopped"><Square size={10}/>{t("已停止生成")}</p>}{!message.content && generating && message.id === chat.messages.at(-1)?.id && <div className="answer-skeleton"><i/><i/><i/></div>}{message.content && <div className="answer-actions"><button className="copy-button" onClick={() => void copy(message.id, message.content)} aria-label={t("复制回答")}>{copied === message.id ? <Check size={13}/> : <Copy size={13}/>} {copied === message.id ? t("已复制") : t("复制")}</button><SaveAnswer tabId={chat.tabId} conversationId={chat.id} messageId={message.id} disabled={!connected || (generating && message.id === chat.messages.at(-1)?.id)} language={session.preferences.uiLanguage}/></div>}</>}
        </article>)}
      </div>}
      {((!editing && chat.error) || error) && <div className="error-notice" role="alert">{t(error || chat.error || '')}{chat.mode === 'general' && error && <p>{t('仍可在下方直接与 AI 对话。')}</p>}{(error || chat.error) && <button className="text-button" onClick={() => void rpc('open:options')}>{t("打开设置 ↗")}</button>}</div>}
      {!editing && <>{((!sidebarChat && !asking) || chat.messages.length > 0 || generating || !connected) && <div className="response-tools"><span className={`status ${generating ? 'working' : ''}`} role="status">{!connected ? t("正在恢复连接") : generating ? t("正在生成") : chat.status === 'idle' && chat.messages.length > 0 ? t("已完成") : t("可继续对话")}</span><div className="response-buttons">{!sidebarChat && !asking && <button className="text-button" disabled={!connected || generating} onClick={() => send({ type: 'edit-prompt' })}><Pencil size={12}/>{t("编辑 Prompt")}</button>}<button className="text-button" disabled={!connected || generating || blocked || !chat.messages.length} onClick={e => { if (e.isTrusted) send({ type: 'retry' }); }}><RotateCcw size={13}/> {t("重新生成")}</button></div></div>}
      <form className="composer" onSubmit={e => { e.preventDefault(); if (e.nativeEvent.isTrusted) submit(); }}><label className="sr-only" htmlFor={`question-${chat.id}`}>{t(asking ? "询问 AI" : "继续追问")}</label><textarea id={`question-${chat.id}`} placeholder={t(chat.mode === 'general' ? "问点什么…" : page ? "询问当前网页…" : asking ? "提个问题…" : "继续追问，发现更多…")} value={draft} maxLength={LIMITS.question} rows={2} disabled={!connected || blocked} onBlur={session.flushDraft} onChange={e => changeDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (e.isTrusted) submit(); } }}/><div className="composer-footer"><div className="composer-model">{session.models.length > 1 ? <Select aria-label={t("切换模型")} value={chat.modelId ?? ''} disabled={!connected || generating} selectedContent={<span title={modelLabel}>{modelLabel}</span>} options={session.models.map(model => ({ value: model.id, label: model.model === model.name ? model.model : `${model.model} · ${model.name}`, content: <span className="model-option"><strong>{model.model}</strong>{model.model !== model.name && <small>{model.name}</small>}</span> }))} onChange={e => { if (e.nativeEvent.isTrusted) send({ type: 'model', modelId: e.target.value }); }}/> : <span title={modelLabel}><i className="model-indicator"/>{modelLabel}</span>}</div>{generating ? <button className="send-button stop-button" type="button" disabled={!connected} aria-label={t("停止生成")} title={t("停止生成")} onClick={e => { if (e.isTrusted) send({ type: 'stop' }); }}><Square size={13} fill="currentColor"/></button> : <button className="send-button" type="submit" disabled={!draft.trim() || !connected || blocked} aria-label={t("发送问题")}><ArrowUp size={19}/></button>}</div></form>
      </>}
    </>}
    {!chat && error && <div className="error-notice" role="alert">{t(error)}</div>}
  </section>;
}
