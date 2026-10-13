import { afterEach, describe, expect, it, vi } from 'vitest';
import { NoteDraftController, type DraftTransport } from '../src/shared/note-drafts';
import type { SavedNote } from '../src/shared/types';
const note: SavedNote = { id: 'n', conversationId: 'c', messageId: 'm', selection: 'selection', answer: 'answer', sourceTitle: 'title', sourceUrl: 'https://example.com', note: 'Saved text', tags: [], createdAt: 0, updatedAt: 0 };
function setup(overrides: Partial<DraftTransport> = {}) {
  const transport: DraftTransport = { read: vi.fn(async () => null), write: vi.fn(async () => undefined), save: vi.fn(async (text, tags) => ({ ...note, note: text, tags })), ...overrides };
  return { transport, controller: new NoteDraftController(note, transport) };
}
afterEach(() => vi.useRealTimers());
describe('automatic note drafts', () => {
  it('keeps a pending draft when the editor unmounts and saves without a second click', async () => {
    vi.useFakeTimers(); const { controller, transport } = setup();
    await Promise.resolve(); const unsubscribe = controller.subscribe(() => undefined);
    controller.change('My thought', 'Reading，AI'); unsubscribe();
    await vi.advanceTimersByTimeAsync(700);
    expect(transport.write).toHaveBeenCalledWith(expect.objectContaining({ text: 'My thought', labels: 'Reading，AI' }));
    expect(transport.save).toHaveBeenCalledWith('My thought', ['Reading', 'AI'], expect.any(String));
    expect(controller.getSnapshot().status).toBe('saved'); controller.dispose();
  });
  it('restores a session draft and keeps invalid input for correction', async () => {
    vi.useFakeTimers(); const { controller, transport } = setup({ read: async () => ({ text: 'Recovered', labels: 'x'.repeat(41), version: 'draft' }) });
    await vi.advanceTimersByTimeAsync(700);
    expect(controller.getSnapshot()).toMatchObject({ text: 'Recovered', status: 'error' });
    expect(transport.save).not.toHaveBeenCalled();
    controller.change('Recovered', 'Valid'); await controller.flush();
    expect(controller.getSnapshot().status).toBe('saved'); controller.dispose();
  });
  it('serializes changes during a slow save and finishes with the latest text', async () => {
    let release!: (note: SavedNote) => void;
    const save = vi.fn<DraftTransport['save']>().mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockImplementation(async (text, tags) => ({ ...note, note: text, tags }));
    const { controller } = setup({ save }); await Promise.resolve();
    controller.change('First', ''); const pending = controller.flush();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    controller.change('Latest', 'tag'); release(note); await pending;
    expect(save).toHaveBeenLastCalledWith('Latest', ['tag'], expect.any(String));
    expect(controller.getSnapshot()).toMatchObject({ text: 'Latest', status: 'saved' }); controller.dispose();
  });
  it('keeps failed changes and retries without letting remote refresh overwrite them', async () => {
    const save = vi.fn<DraftTransport['save']>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(note);
    const { controller } = setup({ save }); await Promise.resolve();
    controller.change('Keep me', ''); await controller.flush();
    controller.sync({ ...note, note: 'Remote' });
    expect(controller.getSnapshot()).toMatchObject({ text: 'Keep me', status: 'error', error: 'offline' });
    await controller.flush(); expect(controller.getSnapshot().status).toBe('saved'); controller.dispose();
  });
  it('does not overwrite saved text when reading a draft fails', async () => {
    const { controller, transport } = setup({ read: vi.fn().mockRejectedValue(new Error('offline')) });
    await controller.flush(); expect(transport.save).not.toHaveBeenCalled();
    expect(controller.getSnapshot().status).toBe('error'); controller.dispose();
  });
});
