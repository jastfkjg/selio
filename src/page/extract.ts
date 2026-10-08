import { Readability } from '@mozilla/readability';
import type { PageSnapshot } from '../shared/types';
import { chunkPage } from './context';

/** Work on an inert clone. Never read input values, shadow roots or child frames. */
export function extractPage(doc: Document): PageSnapshot {
  if (!/^https?:/.test(doc.location?.href ?? '') || doc.contentType === 'application/pdf') throw new Error('此页面无法提取正文，请在普通文章或文档网页使用。');
  const originals = Array.from(doc.querySelectorAll('*'));
  if (originals.length > 40000) throw new Error('页面结构过于复杂，请打开文章的独立页面后重试。');
  const clone = doc.cloneNode(true) as Document;
  const copies = Array.from(clone.querySelectorAll('*'));
  const excluded = 'script,style,noscript,template,nav,footer,aside,form,input,textarea,select,button,iframe,canvas,svg,selio-assistant,[contenteditable]:not([contenteditable="false"]),[hidden],[aria-hidden="true"],[role="navigation"],[role="banner"],[role="dialog"],[role="complementary"],[role="contentinfo"],dialog';
  originals.forEach((node, index) => {
    const copy = copies[index];
    if (!copy?.parentNode) return;
    const style = doc.defaultView?.getComputedStyle(node);
    const noise = /(?:^|[\s_-])(advertisement|advert|ad|ads|cookie|consent|share|sharing|social|related|recommendations|sidebar|comments?)(?:$|[\s_-])/i.test(`${node.id} ${node.getAttribute('class') ?? ''}`);
    if (node.matches(excluded) || noise || style?.display === 'none' || (style?.visibility === 'hidden' || style?.visibility === 'collapse') || style?.opacity === '0') copy.remove();
  });
  let root: Element | null = null;
  let method: PageSnapshot['method'] = 'readability';
  // Preserve documentation structure (code and tables), which article heuristics can discard.
  const semantic = Array.from(clone.querySelectorAll('article,main,[role="main"]')).sort((a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0))[0];
  const readable = new Readability(clone.cloneNode(true) as Document, { charThreshold: 120, maxElemsToParse: 40000, serializer: node => node as Element }).parse();
  if (semantic && semantic.querySelector('pre,table') && (semantic.textContent?.trim().length ?? 0) >= 120) {
    root = semantic; method = 'semantic';
  } else if (readable?.content) {
    root = readable.content;
  } else if (semantic) { root = semantic; method = 'semantic'; }
  if (!root) throw new Error('未找到可靠的正文。请等待内容加载，或打开文章的独立页面后重试。');
  const blocks: string[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === 3) { blocks.push((node.textContent ?? '').replace(/\s+/g, ' ')); return; }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    if (element.tagName === 'PRE') { blocks.push(`\n\n\`\`\`\n${element.textContent?.trim() ?? ''}\n\`\`\`\n\n`); return; }
    const block = /^(H[1-6]|P|DIV|SECTION|ARTICLE|LI|UL|OL|BLOCKQUOTE|TABLE|TR|BR)$/.test(element.tagName);
    if (block) blocks.push('\n');
    if (/^H[1-6]$/.test(element.tagName)) blocks.push(`${'#'.repeat(Number(element.tagName[1]))} `);
    if (element.tagName === 'LI') blocks.push('- ');
    for (const child of element.childNodes) walk(child);
    if (/^(TD|TH)$/.test(element.tagName)) blocks.push(' | ');
    if (block) blocks.push('\n');
  };
  walk(root);
  const fullText = blocks.join('').replace(/\n{3,}/g, '\n\n').trim();
  if (fullText.length < 80) throw new Error('正文内容太少，无法可靠回答。请等待加载或换一个文章页面。');
  const text = fullText.slice(0, 180000);
  return {
    title: (readable?.title || doc.title).slice(0, 300), url: doc.location.href, capturedAt: Date.now(), method,
    totalCharacters: fullText.length, truncated: fullText.length > text.length, chunks: chunkPage(text),
  };
}
