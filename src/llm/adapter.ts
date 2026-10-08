import type { ApiMessage, ModelConfig } from '../shared/types';
import { apiEndpoint } from '../shared/validation';
import { ApiError, httpError } from './errors';
import { parseDelta, sseData } from './sse';

export interface ProviderAdapter {
  stream(config: ModelConfig, key: string, messages: ApiMessage[], signal: AbortSignal): AsyncIterable<string>;
}
export const openAICompatible: ProviderAdapter = {
  async *stream(config, key, messages, signal) {
    const controller = new AbortController();
    const relay = () => controller.abort();
    signal.addEventListener('abort', relay, { once: true });
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 120000);
    try {
      signal.throwIfAborted();
      const response = await fetch(apiEndpoint(config.baseUrl), {
        method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: config.model, messages, stream: true, max_tokens: config.maxTokens, ...(config.temperature === undefined ? {} : { temperature: config.temperature }) }),
      });
      if (!response.ok) throw httpError(response.status);
      if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new ApiError('not_stream', '接口没有返回 SSE 流，请使用兼容 Chat Completions 的地址。');
      let completed = false;
      for await (const data of sseData(response.body, controller.signal)) {
        const { text, finished } = parseDelta(data);
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
