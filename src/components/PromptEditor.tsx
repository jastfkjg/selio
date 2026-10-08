import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { resolvePrompt, validatePrompt } from '../shared/actions';
import type { ChatSession } from '../hooks/useChat';
import { translator } from '../shared/i18n';
import { Select } from './Select';

export function PromptEditor({ session }: { session: ChatSession }) {
  const { conversation: chat, send, connected } = session;
  const t = translator(session.preferences.uiLanguage);
  const [text, setText] = useState(chat?.promptDraft ?? '');
  const [error, setError] = useState('');
  const pending = useRef<string | null>(null);
  useEffect(() => {
    if (pending.current === null || chat?.promptDraft === pending.current) {
      pending.current = null; setText(chat?.promptDraft ?? '');
    }
  }, [chat?.promptDraft]);
  if (!chat) return null;
  return <form className="prompt-editor" onSubmit={e => {
    e.preventDefault(); if (!e.nativeEvent.isTrusted || !connected) return;
    try { const prompt = validatePrompt(text); setError(''); send({ type: 'execute', text: prompt }); }
    catch (e) { setError((e as Error).message); }
  }}>
    <div className="prompt-editor-body"><div><h2>{t('编辑本次 Prompt')}</h2><p>{t('只影响本次对话，不会修改保存的模板。执行后将替换当前操作的回答。')}</p></div>
    <label htmlFor={`prompt-${chat.id}`}>{t('Prompt 模板')}</label><textarea id={`prompt-${chat.id}`} className="prompt-textarea" rows={8} value={text} maxLength={8000} required spellCheck={false} disabled={!connected} onChange={e => { const value = e.target.value; pending.current = value; setText(value); send({ type: 'prompt-draft', text: value }); }}/>
    <small>{t('{{selection}} 使用选中文字；{{language}} 使用目标语言。')}</small>
    <details className="prompt-preview"><summary>{t('预览本次 Prompt')}</summary><pre>{resolvePrompt(text, chat.selection.text, chat.language)}</pre></details>
    <label htmlFor={`prompt-model-${chat.id}`}>{t('执行模型')}</label><Select id={`prompt-model-${chat.id}`} value={chat.modelId ?? ''} disabled={!connected || !session.models.length} onChange={e => { if (e.nativeEvent.isTrusted) send({ type: 'model', modelId: e.target.value }); }}>{session.models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</Select>
    {error && <p className="inline-status failure" role="alert">{t(error)}</p>}
    </div><div className="prompt-editor-actions"><button type="button" className="button secondary" onClick={() => send({ type: 'cancel-edit' })} disabled={!connected}>{t('取消')}</button><button type="submit" className="button primary" disabled={!connected || !text.trim()}>{t('执行 Prompt')}<ArrowUpRight size={15}/></button></div>
  </form>;
}
