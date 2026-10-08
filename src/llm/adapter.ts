import type { ApiMessage, ModelConfig } from '../shared/types';
import { apiEndpoint } from '../shared/validation';
import { ApiError, httpError } from './errors';
import { parseAnthropicDelta, parseDelta, sseData } from './sse';

export interface ProviderAdapter {
  stream(config: ModelConfig, key: string, messages: ApiMessage[], signal: AbortSignal): AsyncIterable<string>;
}
function adapter(anthropic: boolean): ProviderAdapter {
  return {
    async *stream(config, key, messages, signal) {
      const controller = new AbortController();
      const relay = () => controller.abort();
      signal.addEventListener('abort', relay, { once: true });
      let timedOut = false;
      const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 120000);
      try {
        signal.throwIfAborted();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const body = {
          model: config.model,
          stream: true,
          max_tokens: config.maxTokens,
          ...(config.temperature === undefined ? {} : { temperature: config.temperature }),
          ...(anthropic ? {
            system: messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n'),
            messages: messages.filter(m => m.role !== 'system'),
          } : { messages }),
          ...(config.provider === 'kimi' && config.model === 'kimi-k2.5'
            ? { thinking: { type: 'disabled' }, temperature: 0.6 } : {}),
        };
        if (anthropic) {
          headers['x-api-key'] = key;
          headers['anthropic-version'] = '2023-06-01';
          headers['anthropic-dangerous-direct-browser-access'] = 'true';
        } else headers.Authorization = `Bearer ${key}`;
        const response = await fetch(apiEndpoint(config.baseUrl, anthropic ? 'anthropic' : 'custom'), {
          method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store',
          signal: controller.signal, headers, body: JSON.stringify(body),
        });
        if (!response.ok) throw httpError(response.status);
        if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new ApiError('not_stream', '接口没有返回 SSE 流，请使用所选供应商支持的流式地址。');
        let completed = false;
        for await (const data of sseData(response.body, controller.signal)) {
          const { text, finished } = (anthropic ? parseAnthropicDelta : parseDelta)(data);
          if (text) yield text;
          if (finished) { completed = true; break; }
        }
        if (!completed) throw new ApiError('truncated', '连接提前结束，回答可能不完整。请重新生成。');
      } catch (error) {
        if (timedOut) throw new ApiError('timeout', '生成超过两分钟，已停止。请重试或缩短选中文字。');
        throw error;
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener('abort', relay);
      }
    },
  };
}
export const openAICompatible = adapter(false);
export const anthropicMessages = adapter(true);
export const adapterFor = (provider: ModelConfig['provider']) => provider === 'anthropic' ? anthropicMessages : openAICompatible;
