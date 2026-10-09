import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { filterNotes, notesMarkdown, parseTags, sourceUrl, validateNoteDetails } from '../src/shared/notes';
import { sanitizeSnapshot } from '../src/shared/validation';
import type { Conversation, SavedNote } from '../src/shared/types';

function area() {
  const data: Record<string, unknown> = {};
  return { data, get: vi.fn(async (key: string) => structuredClone({ [key]: data[key] })), set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(data, structuredClone(values)); }), setAccessLevel: vi.fn(async () => undefined) };
}
let local: ReturnType<typeof area>;
beforeEach(() => { vi.resetModules(); local = area(); vi.stubGlobal('chrome', { storage: { local, session: area() } }); });
afterEach(() => vi.unstubAllGlobals());
const conversation = (): Conversation => ({
  id: 'conversation', tabId: 1, selection: { text: 'Original selection', paragraph: 'Larger paragraph', pageTitle: 'Original title', pageUrl: 'https://example.com/original?q=1#part', rect: { x: 0, y: 0, width: 10, height: 10 } },
  scope: 'paragraph', action: 'explain', language: 'en', modelId: 'model', modelName: 'Model', messages: [{ id: 'answer', role: 'assistant', content: '**Answer**\n\n```ts\nconst x = 1;\n```' }], draft: '', status: 'idle', updatedAt: 0,
});

describe('saved answers', () => {
  it('snapshots the original selection and source before queued writes, survives restart, and does not duplicate repeated saves', async () => {
    let repo = await import('../src/background/notes');
    const chat = conversation();
    const first = repo.saveAnswer(chat, 'answer', 'First note', ['Reading', 'Reading']);
    chat.selection.text = 'Changed selection'; chat.selection.pageUrl = 'https://elsewhere.test'; chat.messages[0]!.content = 'Changed answer';
    const saved = await first;
    expect(saved).toMatchObject({ selection: 'Original selection', sourceTitle: 'Original title', sourceUrl: 'https://example.com/original?q=1#part', note: 'First note', tags: ['Reading'] });
    expect(saved.answer).toContain('**Answer**');
    expect(saved.selection).not.toContain('Larger paragraph');
    await repo.saveAnswer(chat, 'answer', 'Updated note', ['Updated']);
    vi.resetModules(); repo = await import('../src/background/notes');
    const notes = await repo.readNotes();
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ id: saved.id, createdAt: saved.createdAt, selection: saved.selection, sourceUrl: saved.sourceUrl, answer: saved.answer, note: 'Updated note', tags: ['Updated'] });
    expect(local.setAccessLevel).toHaveBeenCalledWith({ accessLevel: 'TRUSTED_CONTEXTS' });
  });
  it('serializes concurrent saves, edits and deletion without losing other records', async () => {
    const repo = await import('../src/background/notes');
    const one = conversation(), two = { ...conversation(), id: 'second' };
    const [first, second] = await Promise.all([repo.saveAnswer(one, 'answer', '', []), repo.saveAnswer(two, 'answer', '', []), repo.saveAnswer(one, 'answer', '', [])]);
    expect(await repo.readNotes()).toHaveLength(2);
    await Promise.all([repo.updateNote(first!.id, 'Edited', ['tag']), repo.deleteNote(second!.id)]);
    expect(await repo.readNotes()).toMatchObject([{ id: first!.id, note: 'Edited' }]);
    await expect(repo.updateNote('missing', '', [])).rejects.toThrow('收藏不存在');
    await repo.clearNotes(); expect(await repo.readNotes()).toEqual([]);
  });
  it('rejects streaming, missing and user messages; accepts stopped partial answers', async () => {
    const repo = await import('../src/background/notes');
    const chat = conversation(); chat.status = 'generating';
    expect(() => repo.saveAnswer(chat, 'answer', '', [])).toThrow('请等待');
    expect(() => repo.saveAnswer(chat, 'missing', '', [])).toThrow('回答已变化');
    chat.status = 'stopped'; await repo.saveAnswer(chat, 'answer', '', []);
    chat.messages[0]!.role = 'user'; expect(() => repo.saveAnswer(chat, 'answer', '', [])).toThrow('回答已变化');
    expect(await repo.readNotes()).toHaveLength(1);
  });
  it('reports storage failure, preserves previous notes, and allows retry', async () => {
    const repo = await import('../src/background/notes');
    local.set.mockRejectedValueOnce(new Error('QUOTA_BYTES'));
    await expect(repo.saveAnswer(conversation(), 'answer', '', [])).rejects.toThrow('存储已满');
    expect(await repo.readNotes()).toEqual([]);
    await repo.saveAnswer(conversation(), 'answer', '', []);
    expect(await repo.readNotes()).toHaveLength(1);
  });
});
it('normalizes tags and validates limits without silently truncating user notes', () => {
  expect(parseTags(' Reading, AI，Reading\n思考 ')).toEqual(['Reading', 'AI', '思考']);
  expect(validateNoteDetails(' note ', [' tag ', 'tag', ''])).toEqual({ note: 'note', tags: ['tag'] });
  expect(() => validateNoteDetails('a'.repeat(4001), [])).toThrow();
  expect(() => validateNoteDetails('', ['a'.repeat(41)])).toThrow();
  expect(() => validateNoteDetails('', Array(21).fill('tag'))).toThrow();
  expect(sourceUrl('javascript:alert(1)')).toBe('');
  expect(sourceUrl('https://user:password@example.com')).toBe('');
  expect(sanitizeSnapshot(conversation().selection).pageUrl).toBe(conversation().selection.pageUrl);
});
it('searches every saved field, combines keyword and source filters, and exports all five fields', async () => {
  const repo = await import('../src/background/notes');
  const note = await repo.saveAnswer(conversation(), 'answer', 'Personal insight\n# literal heading', ['知识']);
  const other: SavedNote = { ...note, id: 'other', sourceUrl: 'https://other.test', sourceTitle: 'Other title' };
  for (const term of ['original', 'ANSWER', 'Personal insight', '知识', 'q=1']) expect(filterNotes([note], term, '')).toEqual([note]);
  expect(filterNotes([note, other], 'answer 知识', 'example.com')).toEqual([note]);
  expect(filterNotes([note], 'not present', '')).toEqual([]);
  const markdown = notesMarkdown([note], 'en');
  for (const text of [note.sourceTitle, `<${note.sourceUrl}>`, note.selection, note.answer, 'Personal insight', '知识', '> \\# literal heading']) expect(markdown).toContain(text);
  expect(markdown).toContain('### Your note');
  expect(notesMarkdown([note], 'zh-CN')).toContain('### 用户备注');
});
