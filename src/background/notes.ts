import type { Conversation, SavedNote } from '../shared/types';
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
export function saveAnswer(chat: Conversation, messageId: string, note: unknown, tags: unknown): Promise<SavedNote> {
  const details = validateNoteDetails(note, tags);
  const message = chat.messages.find(message => message.id === messageId && message.role === 'assistant');
  if (!message?.content.trim()) throw new Error('回答已变化，请在当前回答重试。');
  if (chat.status === 'generating' && chat.messages.at(-1)?.id === messageId) throw new Error('请等待回答完成或停止生成后再收藏。');
  // Snapshot before queued storage work: later navigation/generation must not change the saved source.
  const snapshot: SavedNote = {
    id: crypto.randomUUID(), conversationId: chat.id, messageId,
    selection: chat.selection.text, sourceTitle: chat.page?.title ?? chat.selection.pageTitle,
    sourceUrl: sourceUrl(chat.page?.url ?? chat.selection.pageUrl), answer: message.content,
    ...details, createdAt: Date.now(), updatedAt: Date.now(),
  };
  return mutateNotes(notes => {
    const existing = notes.find(item => item.conversationId === chat.id && item.messageId === messageId);
    if (existing) { Object.assign(existing, details, { updatedAt: Date.now() }); return existing; }
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
