import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { NoteDraftController } from '../shared/note-drafts';
import { rpc } from '../shared/rpc';
import type { NoteDraft, SavedNote } from '../shared/types';

const drafts = new Map<string, NoteDraftController>();
export function discardNoteDraft(id: string) { drafts.get(id)?.dispose(); drafts.delete(id); }
export function useNoteDraft(note: SavedNote) {
  const controller = useMemo(() => {
    let draft = drafts.get(note.id);
    if (!draft) {
      const reference = { id: note.id, conversationId: note.conversationId, messageId: note.messageId };
      draft = new NoteDraftController(note, {
        read: () => rpc<NoteDraft | null>('notes:draft:get', reference),
        write: draft => rpc('notes:draft:set', { ...reference, draft }),
        save: (text, tags, draftVersion) => rpc<SavedNote>('notes:update', { ...reference, note: text, tags, draftVersion }),
      });
      drafts.set(note.id, draft);
    }
    return draft;
    // The saved identity and RPC reference never change for this note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);
  useEffect(() => controller.sync(note), [controller, note]);
  useEffect(() => {
    const flush = () => { void controller.flush(); };
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, [controller]);
  return { ...useSyncExternalStore(controller.subscribe, controller.getSnapshot), change: (text: string, labels: string) => controller.change(text, labels), flush: controller.flush };
}
