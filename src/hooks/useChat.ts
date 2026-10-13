import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_ACTIONS } from '../shared/actions';
import { notesChanged } from '../shared/note-events';
import { applyProgress, DraftQueue } from '../shared/chat-updates';
import { DEFAULT_PREFERENCES, type ChatCommand, type Conversation, type Preferences, type PublicModel, type PublicAction, type ServerEvent } from '../shared/types';

export function useChat(tabId?: number) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  // All-site access is unknown until the background sends the saved settings.
  const [preferences, setPreferences] = useState<Preferences>({ ...DEFAULT_PREFERENCES, allSites: false });
  const [actions, setActions] = useState<PublicAction[]>(DEFAULT_ACTIONS);
  const [models, setModels] = useState<PublicModel[]>([]);
  const [modelName, setModelName] = useState('未配置模型');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const idRef = useRef<string | undefined>(undefined);
  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;
  const [commands] = useState(() => new DraftQueue(command => {
    try { portRef.current?.postMessage(command); }
    catch { setError('扩展连接中断，请刷新网页重试。'); }
  }));
  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout>;
    let heartbeat: ReturnType<typeof setInterval>;
    let watchdog: ReturnType<typeof setTimeout>;
    setConversation(null); idRef.current = undefined;
    const connect = () => {
      if (disposed) return;
      try {
        const port = chrome.runtime.connect({ name: 'selio-chat' });
        let received = false;
        let lost = false;
        portRef.current = port;
        const reconnect = () => {
          if (disposed || lost) return;
          lost = true;
          clearInterval(heartbeat); clearTimeout(watchdog);
          setConnected(false);
          setError('连接已断开，正在恢复。已收到的回答仍保留。');
          port.disconnect();
          retry = setTimeout(connect, 1000);
        };
        port.onMessage.addListener((event: ServerEvent) => {
          if (disposed || lost || portRef.current !== port) return;
          clearTimeout(watchdog);
          if (!received) { setError(''); received = true; }
          setConnected(true);
          if (event.type === 'state') { idRef.current = event.conversation?.id; conversationRef.current = event.conversation; setConversation(event.conversation); }
          if (event.type === 'progress') setConversation(state => applyProgress(state, event));
          if (event.type === 'preferences') { setPreferences(event.preferences); setModelName(event.modelName); setModels(event.models); setActions(event.actions); }
          if (event.type === 'error') setError(event.error);
          if (event.type === 'notes-changed') notesChanged();
        });
        port.onDisconnect.addListener(reconnect);
        port.postMessage({ type: 'subscribe', tabId });
        watchdog = setTimeout(reconnect, 5000);
        heartbeat = setInterval(() => {
          try {
            port.postMessage({ type: 'ping' });
            clearTimeout(watchdog); watchdog = setTimeout(reconnect, 5000);
          } catch { reconnect(); }
        }, 10000);
      } catch { setConnected(false); setError('扩展已更新，请刷新网页后继续。'); }
    };
    connect();
    const hidden = () => { if (document.hidden) commands.flush(); };
    window.addEventListener('pagehide', commands.flush);
    document.addEventListener('visibilitychange', hidden);
    return () => { commands.flush(); disposed = true; clearTimeout(retry); clearTimeout(watchdog); clearInterval(heartbeat); portRef.current?.disconnect(); window.removeEventListener('pagehide', commands.flush); document.removeEventListener('visibilitychange', hidden); };
  }, [tabId, commands]);
  const send = useCallback((command: ChatCommand) => {
    setError('');
    const state = conversationRef.current;
    commands.send({ ...command, conversationId: command.conversationId ?? idRef.current, ...((command.type === 'draft' || command.type === 'prompt-draft') ? { action: state?.action, scope: state?.scope } : {}) });
  }, [commands]);
  return { conversation, preferences, modelName, models, actions, connected, error, setError, send, flushDraft: commands.flush };
}
export type ChatSession = ReturnType<typeof useChat>;
