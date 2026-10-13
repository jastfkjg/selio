import type { NoteDraft, SavedNote } from './types';
import { parseTags, validateNoteDetails } from './notes';

export interface DraftState extends NoteDraft { status: 'loading' | 'saved' | 'pending' | 'saving' | 'error'; error: string }
export interface DraftTransport {
  read: () => Promise<NoteDraft | null>;
  write: (draft: NoteDraft) => Promise<void>;
  save: (note: string, tags: string[], version: string) => Promise<SavedNote>;
}
/** Own the draft outside the editor so closing a floating window never cancels a pending save. */
export class NoteDraftController {
  private state: DraftState;
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private persistence = Promise.resolve();
  private running?: Promise<void>;
  private disposed = false;
  private ready: Promise<void>;
  constructor(note: SavedNote, private transport: DraftTransport) {
    this.state = { text: note.note, labels: note.tags.join(', '), version: '', status: 'loading', error: '' };
    this.ready = transport.read().then(draft => {
      if (this.disposed) return;
      this.set(draft ? { ...draft, status: 'pending', error: '' } : { ...this.state, status: 'saved' });
      if (draft) this.schedule();
    }).catch(() => this.set({ ...this.state, status: 'error', error: '草稿读取失败，请重试。' }));
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private set(state: DraftState) { if (this.disposed) return; this.state = state; for (const listener of this.listeners) listener(); }
  private schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => { void this.flush(); }, 650); }
  change(text: string, labels: string) {
    const draft = { text, labels, version: crypto.randomUUID() };
    this.set({ ...draft, status: 'pending', error: '' });
    // Session storage also preserves failed/invalid drafts when the sidebar is closed or reloaded.
    this.persistence = this.persistence.catch(() => undefined).then(() => this.transport.write(draft));
    void this.persistence.catch(() => undefined);
    this.schedule();
  }
  sync(note: SavedNote) {
    if (this.state.status === 'saved' && !this.running && (this.state.text !== note.note || this.state.labels !== note.tags.join(', '))) this.set({ ...this.state, text: note.note, labels: note.tags.join(', ') });
  }
  flush = async (): Promise<void> => {
    clearTimeout(this.timer);
    await this.ready;
    if (this.disposed || this.state.status === 'saved') return;
    if (this.running) return this.running;
    if (!this.state.version) {
      // Never overwrite saved notes if the initial draft read failed.
      this.ready = this.transport.read().then(draft => {
        this.set({ ...(draft ?? this.state), status: draft ? 'pending' : 'saved', error: '' });
      }).catch(() => this.set({ ...this.state, status: 'error', error: '草稿读取失败，请重试。' }));
      await this.ready;
      if (!this.state.version) return;
    }
    const draft = this.state;
    this.running = (async () => {
      try {
        const details = validateNoteDetails(draft.text, parseTags(draft.labels));
        this.set({ ...this.state, status: 'saving', error: '' });
        await this.persistence.catch(() => undefined);
        await this.transport.save(details.note, details.tags, draft.version);
        if (this.state.version === draft.version) this.set({ ...this.state, status: 'saved', error: '' });
      } catch (error) {
        if (this.state.version === draft.version) this.set({ ...this.state, status: 'error', error: error instanceof Error ? error.message : '收藏操作失败，请重试。' });
      }
    })();
    await this.running; this.running = undefined;
    if (!this.disposed && this.state.version !== draft.version) await this.flush();
  };
  dispose() { this.disposed = true; clearTimeout(this.timer); this.listeners.clear(); }
}
