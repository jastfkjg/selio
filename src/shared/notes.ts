import { ACTIONS, type BuiltinAction, type SavedNote, type UILanguage } from './types';
import { translator } from './i18n';

export const NOTE_LIMITS = { note: 4000, tags: 20, tag: 40 };
export function sourceUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}
export function sourceHost(url: string): string {
  try { return new URL(url).host; } catch { return ''; }
}
export function parseTags(value: string): string[] {
  return [...new Set(value.split(/[,，\n]/).map(tag => tag.trim()).filter(Boolean))];
}
export function validateNoteDetails(note: unknown, tags: unknown): { note: string; tags: string[] } {
  if (typeof note !== 'string' || note.length > NOTE_LIMITS.note) throw new Error('备注最多 4000 个字符。');
  if (!Array.isArray(tags) || tags.length > NOTE_LIMITS.tags || tags.some(tag => typeof tag !== 'string' || tag.trim().length > NOTE_LIMITS.tag || /[\r\n]/.test(tag))) throw new Error('最多 20 个标签，每个最多 40 个字符。');
  return { note: note.trim(), tags: [...new Set((tags as string[]).map(tag => tag.trim()).filter(Boolean))] };
}
export const searchTerms = (query: string) => [...new Set(query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean))];
export function filterNotes(notes: SavedNote[], query: string, host: string, tag = ''): SavedNote[] {
  const terms = searchTerms(query);
  return notes.filter(note => {
    const text = [note.selection, note.question, note.sourceTitle, note.sourceUrl, note.answer, note.note, ...note.tags].join('\n').toLocaleLowerCase();
    return (!host || sourceHost(note.sourceUrl) === host) && (!tag || note.tags.includes(tag)) && terms.every(term => text.includes(term));
  });
}
export function noteActionLabel(note: SavedNote, language: UILanguage): string {
  const t = translator(language);
  if (note.mode === 'page') return t('网页问答');
  if (note.mode === 'general') return t('对话');
  return note.action && note.action in ACTIONS ? t(ACTIONS[note.action as BuiltinAction]) : note.actionName || t('收藏笔记');
}
export function noteTitle(note: SavedNote): string {
  const text = note.question || note.selection || note.sourceTitle || note.answer;
  const line = text.trim().split(/\n/)[0] ?? '';
  return line.length > 100 ? `${line.slice(0, 100)}…` : line;
}
export function noteMatches(note: SavedNote, query: string): { field: string; text: string }[] {
  const terms = searchTerms(query);
  if (!terms.length) return [];
  const fields = [['原文', note.selection], ['问题', note.question ?? ''], ['回答', note.answer], ['备注', note.note], ['标签', note.tags.join(', ')], ['来源', `${note.sourceTitle} ${note.sourceUrl}`]];
  const remaining = new Set(terms);
  const matches: { field: string; text: string }[] = [];
  for (const [field, value] of fields) {
    const text = value ?? '';
    const lower = text.toLocaleLowerCase();
    for (const term of [...remaining]) {
      if (!remaining.has(term)) continue;
      const index = lower.indexOf(term);
      if (index < 0) continue;
      const start = Math.max(0, index - 35), end = Math.min(text.length, start + Math.max(130, term.length + 35));
      const snippet = text.slice(start, end).replace(/\s+/g, ' ');
      matches.push({ field: field!, text: `${start ? '…' : ''}${snippet}${end < text.length ? '…' : ''}` });
      for (const match of remaining) if (snippet.toLocaleLowerCase().includes(match)) remaining.delete(match);
    }
  }
  return matches;
}
const escapeText = (text: string) => text.replace(/[\\`*_{}[\]<>#|!]/g, '\\$&');
const quote = (text: string) => escapeText(text).split('\n').map(line => `> ${line}`).join('\n');
export function notesMarkdown(notes: SavedNote[], language: UILanguage): string {
  const t = translator(language);
  return `# ${t('收藏与 AI 笔记')}\n\n` + notes.map(note => {
    const url = sourceUrl(note.sourceUrl).replace(/[<>\s]/g, char => encodeURIComponent(char));
    return [
      `## ${escapeText(note.sourceTitle || t('未命名来源')).replace(/\r?\n/g, ' ')}`,
      `${t('原文来源')}：${url ? `<${url}>` : t('来源不可用')}`,
      `${t('收藏时间')}：${new Date(note.createdAt).toISOString()}`,
      `${t('标签')}：${note.tags.map(escapeText).join(', ') || '—'}`,
      ...(note.action ? [`${t('操作')}：${escapeText(noteActionLabel(note, language))}`] : []),
      ...(note.incomplete ? [`${t('回答未完成')}`] : []),
      ...(note.question ? [`### ${t('问题')}\n\n${quote(note.question)}`] : []),
      `### ${t('选中文字')}\n\n${quote(note.selection) || '—'}`,
      `### ${t('AI 回答')}\n\n${note.answer}`,
      ...(note.generation ? [`${t('生成模型')}：${escapeText(note.generation.model || note.generation.modelName)}`] : []),
      ...(note.evidence ? [
        `### ${t('回答来源')}`,
        `${t('正文抓取时间')}：${new Date(note.evidence.page.capturedAt).toISOString()}`,
        t(note.evidence.context.mode === 'full' ? '已提供全部提取正文。' : note.evidence.context.mode === 'retrieval' ? '仅提供与问题相关的片段及部分上下文，未阅读全文。' : '从正文各处抽样，仅能给出片段概览，未阅读全文。'),
        ...(note.evidence.page.truncated ? [t('正文超出本地上限，仅保留前 180,000 字符，后续内容未处理。')] : []),
        ...(note.evidence.page.coverage ? [t(note.evidence.page.coverage === 'discussion' ? '仅包含已加载的帖子和评论，不代表完整讨论。' : '提取到的正文很少，可能只有标题或简介。')] : []),
        ...note.evidence.page.chunks.map(chunk => `#### [${chunk.id}] ${escapeText(chunk.heading || t('正文片段')).replace(/\r?\n/g, ' ')}\n\n${quote(chunk.text)}`),
      ] : []),
      `### ${t('用户备注')}\n\n${quote(note.note) || '—'}`,
    ].join('\n\n');
  }).join('\n\n---\n\n') + '\n';
}
