import type { Conversation, NoteDraft, SavedNote } from '../shared/types';
import { sourceUrl, validateNoteDetails } from '../shared/notes';
import { protectStorage } from './repository';

let writes = Promise.resolve();
export async function readNotes(): Promise<SavedNote[]> {
  await protectStorage();
  const { notes } = await chrome.storage.local.get('notes');
  return (Array.isArray(notes) ? notes as SavedNote[] : []).sort((a, b) => b.createdAt - a.createdAt);
}
function mutateNotes<T>(fn: (notes: SavedNote[]) => T): Promise<T> {
  const operation = writes.then(async () => {
    const notes = await readNotes();
    const result = fn(notes);
    try { await chrome.storage.local.set({ notes }); }
    catch { throw new Error('收藏保存失败，可能是本机存储已满。请导出并删除部分收藏后重试。'); }
    return result;
  });
  writes = operation.then(() => undefined, () => undefined);
  return operation;
}
export function saveAnswer(chat: Conversation, messageId: string, note?: unknown, tags?: unknown): Promise<SavedNote> {
  const details = note === undefined && tags === undefined ? null : validateNoteDetails(note, tags);
  const message = chat.messages.find(message => message.id === messageId && message.role === 'assistant');
  if (!message?.content.trim()) throw new Error('回答已变化，请在当前回答重试。');
  if (chat.status === 'generating' && chat.messages.at(-1)?.id === messageId) throw new Error('请等待回答完成或停止生成后再收藏。');
  // Snapshot before queued storage work: later navigation/generation must not change the saved source.
  const snapshot: SavedNote = {
    id: crypto.randomUUID(), conversationId: chat.id, messageId,
    selection: chat.selection.text, sourceTitle: chat.page?.title ?? chat.selection.pageTitle,
    sourceUrl: sourceUrl(chat.page?.url ?? chat.selection.pageUrl), answer: message.content,
    question: chat.messages.slice(0, chat.messages.indexOf(message)).findLast(item => item.role === 'user')?.content,
    action: chat.action, actionName: chat.template?.name, mode: chat.mode === 'general' ? 'general' : chat.page ? 'page' : 'selection',
    incomplete: Boolean(message.stopped || (['error', 'interrupted', 'stopped'].includes(chat.status) && chat.messages.at(-1)?.id === messageId)),
    ...(message.generation ? { generation: structuredClone(message.generation) } : {}),
    ...(chat.page && message.pageContext ? { evidence: {
      page: structuredClone({ capturedAt: chat.page.capturedAt, method: chat.page.method, coverage: chat.page.coverage, truncated: chat.page.truncated, totalCharacters: chat.page.totalCharacters, chunks: chat.page.chunks.filter(chunk => message.pageContext!.chunkIds.includes(chunk.id)) }),
      context: structuredClone(message.pageContext), totalChunks: chat.page.chunks.length,
    } } : {}),
    ...(details ?? { note: '', tags: [] }), createdAt: Date.now(), updatedAt: Date.now(),
  };
  return mutateNotes(notes => {
    const existing = notes.find(item => item.conversationId === chat.id && item.messageId === messageId);
    if (existing) { if (details) Object.assign(existing, details, { updatedAt: Date.now() }); return existing; }
    notes.unshift(snapshot); return snapshot;
  });
}
export function updateNote(id: unknown, note: unknown, tags: unknown): Promise<SavedNote> {
  const details = validateNoteDetails(note, tags);
  return mutateNotes(notes => {
    const existing = notes.find(item => item.id === id);
    if (!existing) throw new Error('收藏不存在，请刷新列表。');
    Object.assign(existing, details, { updatedAt: Date.now() }); return existing;
  });
}
export function deleteNote(id: unknown): Promise<void> {
  return mutateNotes(notes => { const index = notes.findIndex(item => item.id === id); if (index >= 0) notes.splice(index, 1); });
}
export function clearNotes(): Promise<void> { return mutateNotes(notes => { notes.length = 0; }); }

const draftKey = (id: string) => `note-draft:${id}`;
let draftWrites = Promise.resolve();
function mutateDraft(operation: () => Promise<void>): Promise<void> {
  const next = draftWrites.then(operation);
  draftWrites = next.catch(() => undefined);
  return next;
}
export async function readNoteDraft(id: string): Promise<NoteDraft | null> {
  await protectStorage();
  return (await chrome.storage.session.get(draftKey(id)))[draftKey(id)] as NoteDraft | undefined ?? null;
}
export async function writeNoteDraft(id: string, draft: NoteDraft): Promise<void> {
  if (!draft || typeof draft.text !== 'string' || draft.text.length > 4000 || typeof draft.labels !== 'string' || draft.labels.length > 1000 || typeof draft.version !== 'string' || draft.version.length > 100) throw new Error('笔记草稿无效。');
  return mutateDraft(async () => {
    await protectStorage();
    await chrome.storage.session.set({ [draftKey(id)]: draft });
  });
}
export async function clearNoteDraft(id: string, version?: string): Promise<void> {
  return mutateDraft(async () => {
    if (!version || (await readNoteDraft(id))?.version === version) await chrome.storage.session.remove(draftKey(id));
  });
}
