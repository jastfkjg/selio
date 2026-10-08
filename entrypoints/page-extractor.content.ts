import { defineContentScript } from 'wxt/utils/define-content-script';
import { extractPage } from '../src/page/extract';

export default defineContentScript({
  registration: 'runtime',
  main(ctx) {
    const global = globalThis as typeof globalThis & { selioExtractor?: boolean };
    if (global.selioExtractor) return;
    global.selioExtractor = true;
    const listener = (message: { type?: string }, sender: chrome.runtime.MessageSender, respond: (data: unknown) => void) => {
      if (sender.id !== chrome.runtime.id || message.type !== 'selio:extract-page') return;
      try { respond({ page: extractPage(document) }); }
      catch (error) { respond({ error: error instanceof Error ? error.message : '未能提取正文。' }); }
    };
    chrome.runtime.onMessage.addListener(listener);
    ctx.onInvalidated(() => { chrome.runtime.onMessage.removeListener(listener); delete global.selioExtractor; });
  },
});
