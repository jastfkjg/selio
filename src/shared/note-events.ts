const listeners = new Set<() => void>();
export function notesChanged() { for (const listener of listeners) listener(); }
export function subscribeNotes(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
