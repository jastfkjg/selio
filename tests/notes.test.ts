import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { filterNotes, noteActionLabel, noteMatches, notesMarkdown, noteTitle, parseTags, sourceUrl, validateNoteDetails } from '../src/shared/notes';
import { sanitizeSnapshot } from '../src/shared/validation';
import type { Conversation, SavedNote } from '../src/shared/types';

function area() {
  const data: Record<string, unknown> = {};
  return { data, get: vi.fn(async (key: string) => structuredClone({ [key]: data[key] })), set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(data, structuredClone(values)); }), remove: vi.fn(async (key: string) => { delete data[key]; }), setAccessLevel: vi.fn(async () => undefined) };
}
let local: ReturnType<typeof area>;
beforeEach(() => { vi.resetModules(); local = area(); vi.stubGlobal('chrome', { storage: { local, session: area() } }); });
afterEach(() => vi.unstubAllGlobals());
const conversation = (): Conversation => ({
  id: 'conversation', tabId: 1, selection: { text: 'Original selection', paragraph: 'Larger paragraph', pageTitle: 'Original title', pageUrl: 'https://example.com/original?q=1#part', rect: { x: 0, y: 0, width: 10, height: 10 } },
  scope: 'paragraph', action: 'explain', language: 'en', modelId: 'model', modelName: 'Model', messages: [{ id: 'answer', role: 'assistant', content: '**Answer**\n\n```ts\nconst x = 1;\n```' }], draft: '', status: 'idle', updatedAt: 0,
});

describe('saved answers', () => {
  it('preserves per-answer evidence and model after navigation, model changes and restart', async () => {
    const repo = await import('../src/background/notes');
    const chat = conversation();
    chat.page = { title: 'Page title', url: 'https://example.com/page', capturedAt: 123, method: 'readability', totalCharacters: 30, truncated: false, chunks: [
      { id: 1, heading: 'Unused', text: 'Excluded source', start: 0, end: 15 },
      { id: 2, heading: 'Evidence', text: 'Original evidence', start: 15, end: 32 },
    ] };
    chat.messages[0]!.pageContext = { mode: 'retrieval', chunkIds: [2], characters: 17 };
    chat.messages[0]!.generation = { modelId: 'original', modelName: 'Original model', model: 'original-v1', provider: 'custom' };
    chat.messages[0]!.content = 'Claim [2]';
    chat.pageContext = { mode: 'full', chunkIds: [1, 2], characters: 32 };
    chat.modelId = 'different'; chat.modelName = 'Different model';
    const saving = repo.saveAnswer(chat, 'answer');
    chat.page.chunks[1]!.text = 'Changed after save';
    chat.messages[0]!.generation.model = 'changed';
    const note = await saving;
    expect(note.evidence?.page.chunks).toEqual([{ id: 2, heading: 'Evidence', text: 'Original evidence', start: 15, end: 32 }]);
    expect(note.evidence?.context.chunkIds).toEqual([2]);
    expect(note.evidence?.totalChunks).toBe(2);
    expect(note.generation?.model).toBe('original-v1');
    const markdown = notesMarkdown([note], 'en');
    expect(markdown).toContain('#### [2] Evidence');
    expect(markdown).toContain('> Original evidence');
    expect(markdown).toContain('original-v1');
    expect(markdown).not.toContain('Excluded source');
    vi.resetModules();
    expect((await (await import('../src/background/notes')).readNotes())[0]?.evidence).toEqual(note.evidence);
  });
  it('does not guess evidence or a generation model for legacy answers', async () => {
    const repo = await import('../src/background/notes');
    const note = await repo.saveAnswer(conversation(), 'answer');
    expect(note.evidence).toBeUndefined(); expect(note.generation).toBeUndefined();
    expect(notesMarkdown([note], 'en')).not.toContain('Generated with');
  });
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

it('one-click saving never erases annotations and records question, action and incomplete state', async () => {
  const repo = await import('../src/background/notes');
  const chat = conversation();
  chat.messages.unshift({ id: 'q', role: 'user', content: 'Why does this matter?' });
  chat.messages[1]!.stopped = true;
  const first = await repo.saveAnswer(chat, 'answer', 'My insight', ['Research']);
  const again = await repo.saveAnswer(chat, 'answer');
  expect(again).toMatchObject({ id: first.id, note: 'My insight', tags: ['Research'], question: 'Why does this matter?', action: 'explain', incomplete: true });
  expect(notesMarkdown([again], 'en')).toContain('Incomplete answer');
  expect(notesMarkdown([again], 'en')).toContain('Why does this matter?');
  expect(noteActionLabel(again, 'en')).toBe('Explain');
  expect(noteTitle(again)).toBe('Why does this matter?');
});
it('shows matching snippets even when the keyword is far into an answer and combines tag filters', async () => {
  const repo = await import('../src/background/notes');
  const saved = await repo.saveAnswer(conversation(), 'answer', 'A useful insight', ['Reading']);
  saved.answer = 'Unrelated '.repeat(80) + 'Deep keyword';
  expect(noteMatches(saved, 'keyword insight')).toEqual(expect.arrayContaining([
    expect.objectContaining({ field: '回答', text: expect.stringContaining('Deep keyword') }),
    expect.objectContaining({ field: '备注', text: expect.stringContaining('insight') }),
  ]));
  expect(filterNotes([saved], 'keyword', 'example.com', 'Reading')).toEqual([saved]);
  expect(filterNotes([saved], 'keyword', '', 'Other')).toEqual([]);
  expect(noteTitle(saved)).toBe('Original selection');
  expect(noteMatches(saved, 'useful insight')).toHaveLength(1);
});
it('keeps a newer draft when an older autosave finishes', async () => {
  const repo = await import('../src/background/notes');
  await repo.writeNoteDraft('n', { text: 'Latest', labels: '', version: 'new' });
  await repo.clearNoteDraft('n', 'old');
  expect(await repo.readNoteDraft('n')).toMatchObject({ text: 'Latest', version: 'new' });
  await repo.clearNoteDraft('n', 'new'); expect(await repo.readNoteDraft('n')).toBeNull();
  await repo.writeNoteDraft('n', { text: 'Old', labels: '', version: 'old' });
  await Promise.all([repo.clearNoteDraft('n', 'old'), repo.writeNoteDraft('n', { text: 'New', labels: '', version: 'new' })]);
  expect(await repo.readNoteDraft('n')).toMatchObject({ text: 'New' });
});
