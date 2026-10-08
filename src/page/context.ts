import type { PageChunk, PageContext, PageSnapshot } from '../shared/types';

export const PAGE_CONTEXT_BUDGET = 16000;
export function chunkPage(text: string): PageChunk[] {
  const chunks: PageChunk[] = [];
  let offset = 0;
  let heading = '';
  while (offset < text.length) {
    let end = Math.min(offset + 1600, text.length);
    if (end < text.length) {
      const split = text.lastIndexOf('\n', end - 1);
      if (split > offset + 800) end = split + 1;
    }
    const body = text.slice(offset, end);
    const headings = [...body.matchAll(/^#{1,6} (.+)$/gm)];
    if (headings.length) heading = headings[0]![1]!;
    chunks.push({ id: chunks.length + 1, heading: heading.slice(0, 160), text: body, start: offset, end });
    if (headings.length) heading = headings.at(-1)![1]!;
    offset = end;
  }
  return chunks;
}
function terms(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9_]{2,}|[\u3400-\u9fff]+/g) ?? [];
  const stop = new Set(['this', 'that', 'what', 'which', 'with', 'from', 'have', 'does', 'about', 'page', 'article', 'the', 'and', 'are', 'for', 'how', '有什么', '是什么', '这篇', '文章', '作者', '文中', '是否', '有没有', '说明']);
  return [...new Set(words.flatMap(word => /[\u3400-\u9fff]/.test(word) ? Array.from({ length: Math.max(1, word.length - 1) }, (_, i) => word.slice(i, i + 2)) : [word]).filter(word => !stop.has(word)))];
}
/** Local retrieval; no embedding calls or hidden model requests. */
export function selectPageContext(page: PageSnapshot, question: string, previousQuestion = ''): PageContext {
  const total = page.chunks.reduce((n, c) => n + c.text.length, 0);
  if (total <= PAGE_CONTEXT_BUDGET) return { mode: 'full', chunkIds: page.chunks.map(c => c.id), characters: total };
  const broad = /总结|概括|主要讲|主要内容|主旨|关键论点|核心观点|summari[sz]e|summary|overview|mainly about|main (points|arguments|idea)|key (points|arguments)/i.test(question);
  const intent = /实现|算法|implementation|algorithm/i.test(question) ? ' implementation algorithm code 实现 算法 代码' : '';
  const query = terms(question + intent + (/那|它|这个|这些|继续|展开|\b(that|it|those|these|more)\b/i.test(question) ? ` ${previousQuestion}` : ''));
  const corpus = page.chunks.map(c => `${c.heading}\n${c.text}`.toLowerCase());
  const weights = query.map(term => Math.log(1 + corpus.length / (1 + corpus.filter(text => text.includes(term)).length)));
  const ranked = page.chunks.map((chunk, index) => ({ chunk, score: query.reduce((score, term, i) => score + (corpus[index]!.includes(term) ? weights[i]! * (chunk.heading.toLowerCase().includes(term) ? 2 : 1) : 0), 0) })).sort((a, b) => b.score - a.score || a.chunk.id - b.chunk.id);
  const selected = new Set<number>();
  let budget = PAGE_CONTEXT_BUDGET;
  const add = (chunk: PageChunk) => {
    if (!selected.has(chunk.id) && chunk.text.length <= budget) { selected.add(chunk.id); budget -= chunk.text.length; }
  };
  const mode = broad || !ranked[0]?.score ? 'overview' : 'retrieval';
  if (mode === 'retrieval') {
    // Reserve room for neighboring context, useful for pronouns and code explanations.
    ranked.slice(0, 6).filter(item => item.score > 0).forEach(item => add(item.chunk));
    for (const item of ranked.slice(0, 3)) {
      for (const index of [item.chunk.id - 2, item.chunk.id]) if (page.chunks[index]) add(page.chunks[index]);
    }
  }
  const slots = 10;
  for (let i = 0; i < slots; i++) add(page.chunks[Math.round(i * (page.chunks.length - 1) / (slots - 1))]!);
  for (const item of ranked) add(item.chunk);
  return { mode, chunkIds: [...selected].sort((a, b) => a - b), characters: PAGE_CONTEXT_BUDGET - budget };
}
