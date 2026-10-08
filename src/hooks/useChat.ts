import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_PREFERENCES, type ChatCommand, type Conversation, type Preferences, type ServerEvent } from '../shared/types';

export function useChat(tabId?: number) {
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [modelName, setModelName] = useState('未配置模型');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const idRef = useRef<string | undefined>(undefined);
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
          if (event.type === 'state') { idRef.current = event.conversation?.id; setConversation(event.conversation); }
          if (event.type === 'preferences') { setPreferences(event.preferences); setModelName(event.modelName); }
          if (event.type === 'error') setError(event.error);
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
    return () => { disposed = true; clearTimeout(retry); clearTimeout(watchdog); clearInterval(heartbeat); portRef.current?.disconnect(); };
  }, [tabId]);
  const send = useCallback((command: ChatCommand) => {
    setError('');
    try { portRef.current?.postMessage({ ...command, conversationId: command.conversationId ?? idRef.current }); }
    catch { setError('扩展连接中断，请刷新网页重试。'); }
  }, []);
  return { conversation, preferences, modelName, connected, error, setError, send };
}
export type ChatSession = ReturnType<typeof useChat>;
