import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractPage } from '../src/page/extract';
import { chunkPage, PAGE_CONTEXT_BUDGET, selectPageContext } from '../src/page/context';
import { ConversationEngine } from '../src/background/conversations';
import { buildMessages } from '../src/llm/prompts';
import { DEFAULT_PREFERENCES, type ApiMessage, type PageSnapshot } from '../src/shared/types';

const paragraph = 'A careful reading assistant extracts the article, preserves its evidence, and answers questions using only the supplied source. ';
function page(text: string): PageSnapshot {
  return { title: 'Article', url: 'https://example.com/article', capturedAt: 1, method: 'readability', chunks: chunkPage(text), totalCharacters: text.length, truncated: false };
}
beforeEach(() => { document.head.innerHTML = '<title>Test article</title>'; document.body.innerHTML = ''; });
describe('page extraction', () => {
  it('extracts article text without navigation, comments, hidden text, forms or editable drafts; leaves the live page untouched', () => {
    document.body.innerHTML = `<nav>Navigation secret</nav><article><h1>Reading tools</h1><p>${paragraph.repeat(5)}</p><input value="password secret"><form>Form secret</form><div contenteditable>Draft secret</div><p hidden>Hidden secret</p><div style="display:none">Invisible secret</div><section class="comments">Comment secret</section><aside>Aside secret</aside><footer>Footer secret</footer></article>`;
    const before = document.body.innerHTML;
    const result = extractPage(document);
    const text = result.chunks.map(c => c.text).join('');
    expect(text).toContain('careful reading');
    expect(text).not.toContain('secret');
    expect(document.body.innerHTML).toBe(before);
  });
  it('preserves code indentation, table rows and section labels in documentation', () => {
    document.body.innerHTML = `<main><h1>Implementation</h1><p>${paragraph.repeat(3)}</p><pre>function query() {\n  return 42;\n}</pre><h2>Parameters</h2><table><tr><th>name</th><th>value</th></tr><tr><td>limit</td><td>42</td></tr></table></main>`;
    const result = extractPage(document);
    expect(result.method).toBe('semantic');
    expect(result.chunks.map(c => c.text).join('')).toContain('  return 42;');
    expect(result.chunks[0]?.text).toContain('limit | 42');
    expect(result.chunks[0]?.text).toContain('## Parameters');
  });
  it('does not extract an empty or canvas-only page', () => {
    document.body.innerHTML = '<canvas></canvas><nav>Home</nav><input value="private">';
    expect(() => extractPage(document)).toThrow();
  });
  it('caps a very long page and reports that content is missing', () => {
    document.body.innerHTML = `<article><p>${paragraph.repeat(1700)}</p></article>`;
    const result = extractPage(document);
    expect(result.truncated).toBe(true);
    expect(result.totalCharacters).toBeGreaterThan(180000);
    expect(result.chunks.reduce((n, c) => n + c.text.length, 0)).toBe(180000);
  });
});
describe('bounded local retrieval', () => {
  it('chunks without losing content or exceeding the per-chunk limit', () => {
    const text = ('# Heading\n' + paragraph.repeat(40) + '\n').repeat(6);
    const chunks = chunkPage(text);
    expect(chunks.map(c => c.text).join('')).toBe(text);
    expect(chunks.every(c => c.text.length <= 1600)).toBe(true);
    expect(chunks.at(-1)?.end).toBe(text.length);
  });
  it('keeps a newline at the chunk boundary within the limit', () => {
    const text = 'x'.repeat(1600) + '\n' + 'y'.repeat(2000);
    expect(chunkPage(text).every(chunk => chunk.text.length <= 1600)).toBe(true);
    expect(chunkPage(text).map(chunk => chunk.text).join('')).toBe(text);
  });
  it('retrieves implementation details across Chinese and English without inheriting an earlier overview intent', () => {
    const snapshot = page(paragraph.repeat(300) + '\n## Implementation\nWe build a token index.\n' + paragraph.repeat(100));
    const context = selectPageContext(snapshot, '文中有没有说明实现细节？', '这篇文章主要讲了什么？');
    expect(context.mode).toBe('retrieval');
    expect(snapshot.chunks.filter(c => context.chunkIds.includes(c.id)).map(c => c.text).join('')).toContain('token index');
  });
  it('sends all extracted text for a short page', () => {
    const snapshot = page(paragraph.repeat(10));
    expect(selectPageContext(snapshot, 'implementation')).toEqual({ mode: 'full', chunkIds: [1], characters: snapshot.totalCharacters });
  });
  it.each(['请说明倒排索引实现细节', 'How does the inverted index work?'])('retrieves details near the end of a long page: %s', question => {
    const snapshot = page(paragraph.repeat(650) + '\n## Inverted index 倒排索引\n倒排索引使用词条定位片段。 The inverted index maps terms to passages.\n');
    const context = selectPageContext(snapshot, question);
    expect(context.mode).toBe('retrieval');
    expect(context.chunkIds).toContain(snapshot.chunks.at(-1)?.id);
    expect(context.characters).toBeLessThanOrEqual(PAGE_CONTEXT_BUDGET);
    expect(context.chunkIds.length).toBeLessThan(snapshot.chunks.length);
  });
  it('samples across the whole extracted page for overviews and unmatched queries', () => {
    const snapshot = page(paragraph.repeat(650));
    for (const question of ['What are the main arguments?', '这篇文章主要讲了什么？', 'zyxwvu']) {
      const context = selectPageContext(snapshot, question);
      expect(context.mode).toBe('overview');
      expect(context.chunkIds).toContain(1);
      expect(context.chunkIds).toContain(snapshot.chunks.length);
      expect(context.characters).toBeLessThanOrEqual(PAGE_CONTEXT_BUDGET);
    }
  });
});
describe('page chat lifecycle', () => {
  it('does not call a model until asked and records exactly the selected passages on each answer', async () => {
    const requests: ApiMessage[][] = [];
    const generate = vi.fn(async () => ({ modelId: 'model', modelName: 'Model', stream: async function* (messages: ApiMessage[]) { requests.push(messages); yield 'Answer [1]'; } }));
    const engine = new ConversationEngine({ generate, publish: vi.fn() });
    const snapshot = page(paragraph.repeat(650) + '\n## Tokenization\nHow tokenization works.');
    const state = engine.startPage(1, snapshot, DEFAULT_PREFERENCES, 'model');
    expect(generate).not.toHaveBeenCalled();
    engine.ask(1, state.id, 'How does tokenization work?');
    await vi.waitFor(() => expect(state.status).toBe('idle'));
    const context = state.messages.at(-1)?.pageContext;
    const source = JSON.parse(requests[0]![1]!.content);
    expect(source.passages.map((p: { id: number }) => p.id)).toEqual(context?.chunkIds);
    expect(source.coverage.partial).toBe(true);
    expect(requests[0]![0]!.content).toContain('UNTRUSTED');
    expect(requests[0]!.at(-1)?.content).toBe('How does tokenization work?');
    const firstContext = structuredClone(context);
    engine.ask(1, state.id, 'Give me an overview');
    await vi.waitFor(() => expect(state.status).toBe('idle'));
    expect(state.messages[1]?.pageContext).toEqual(firstContext);
    expect(state.messages.at(-1)?.pageContext?.mode).toBe('overview');
    expect(buildMessages(state)[0]?.content).toContain('do not conclude that the entire page omits');
  });
  it('blocks stale page questions and retry; refresh creates a new snapshot only when the conversation still matches', () => {
    const engine = new ConversationEngine({ generate: vi.fn(), publish: vi.fn() });
    const state = engine.startPage(1, page(paragraph), DEFAULT_PREFERENCES, null);
    engine.stalePage(1);
    expect(() => engine.ask(1, state.id, 'Details?')).toThrow('网页已变化');
    expect(() => engine.retry(1, state.id)).toThrow('网页已变化');
    expect(() => engine.startPage(1, page(paragraph), DEFAULT_PREFERENCES, null, 'old-id')).toThrow();
    expect(engine.get(1)?.id).toBe(state.id);
    const refreshed = engine.startPage(1, page(paragraph), DEFAULT_PREFERENCES, null, state.id);
    expect(refreshed.page?.stale).toBeUndefined();
    expect(refreshed.messages).toEqual([]);
  });
});
