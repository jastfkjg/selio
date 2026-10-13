import type { ChatCommand, Conversation, ServerEvent } from './types';

export function progressEvent(state: Conversation): Extract<ServerEvent, { type: 'progress' }> {
  return { type: 'progress', conversationId: state.id, requestId: state.requestId!, message: structuredClone(state.messages.at(-1)!), modelId: state.modelId, modelName: state.modelName, updatedAt: state.updatedAt };
}

/** Preserve unchanged message/page identities, and reject late updates after a switch or retry. */
export function applyProgress(state: Conversation | null, event: Extract<ServerEvent, { type: 'progress' }>): Conversation | null {
  if (!state || state.id !== event.conversationId || state.requestId !== event.requestId || state.status !== 'generating' || state.messages.at(-1)?.id !== event.message.id) return state;
  const message = { ...event.message, pageContext: state.messages.at(-1)?.pageContext };
  return { ...state, modelId: event.modelId, modelName: event.modelName, updatedAt: event.updatedAt, messages: [...state.messages.slice(0, -1), message] };
}

/** Bound typing traffic; a following action and every exit flush the final value first. */
export class DraftQueue {
  private pending?: ChatCommand;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private post: (command: ChatCommand) => void) {}
  send(command: ChatCommand) {
    if (command.type !== 'draft' && command.type !== 'prompt-draft') { this.flush(); this.post(command); return; }
    const previous = this.pending;
    if (previous && (previous.conversationId !== command.conversationId || previous.action !== command.action || previous.scope !== command.scope || previous.type !== command.type)) this.flush();
    this.pending = command;
    // A bounded interval also checkpoints continuous typing without waiting for a pause.
    this.timer ??= setTimeout(this.flush, 200);
  }
  flush = () => {
    clearTimeout(this.timer); this.timer = undefined;
    const command = this.pending; this.pending = undefined;
    if (command) this.post(command);
  };
}
