import type { SavedNote, UILanguage } from './types';
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
export function filterNotes(notes: SavedNote[], query: string, host: string): SavedNote[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return notes.filter(note => {
    const text = [note.selection, note.sourceTitle, note.sourceUrl, note.answer, note.note, ...note.tags].join('\n').toLocaleLowerCase();
    return (!host || sourceHost(note.sourceUrl) === host) && terms.every(term => text.includes(term));
  });
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
      `### ${t('选中文字')}\n\n${quote(note.selection) || '—'}`,
      `### ${t('AI 回答')}\n\n${note.answer}`,
      `### ${t('用户备注')}\n\n${quote(note.note) || '—'}`,
    ].join('\n\n');
  }).join('\n\n---\n\n') + '\n';
}
