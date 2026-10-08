import type { TokenUsage } from '../shared/types';
const count = (value: unknown): number | undefined => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
/** Providers report cumulative usage, never sum repeated stream snapshots. */
export function streamUsage(data: string, anthropic: boolean, previous: TokenUsage = {}): TokenUsage | undefined {
  let event;
  try { event = JSON.parse(data); } catch { return; }
  const usage = anthropic ? event?.message?.usage ?? event?.usage : event?.usage;
  if (!usage || typeof usage !== 'object') return;
  const next = { ...previous };
  if (anthropic) {
    const cached = count(usage.cache_read_input_tokens), written = count(usage.cache_creation_input_tokens), input = count(usage.input_tokens);
    if (cached !== undefined) next.cachedInput = cached;
    if (written !== undefined) next.cacheWrite = written;
    if (input !== undefined) next.input = input + (next.cachedInput ?? 0) + (next.cacheWrite ?? 0);
    const output = count(usage.output_tokens); if (output !== undefined) next.output = output;
  } else {
    const input = count(usage.prompt_tokens), output = count(usage.completion_tokens);
    if (input !== undefined) next.input = input;
    if (output !== undefined) next.output = output;
    const cached = count(usage.prompt_tokens_details?.cached_tokens ?? usage.prompt_cache_hit_tokens);
    if (cached !== undefined) next.cachedInput = cached;
    const total = count(usage.total_tokens); if (total !== undefined) next.total = total;
  }
  if (next.input !== undefined && next.output !== undefined) next.total = Math.max(next.total ?? 0, next.input + next.output);
  return Object.keys(next).length ? next : undefined;
}
