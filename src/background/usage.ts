import { adapterFor } from '../llm/adapter';
import type { Action, ApiMessage, ModelConfig, UsageRecord } from '../shared/types';

export const USAGE_LIMIT = 1000;
let queue = Promise.resolve();
let epoch = 0;
function update(transform: (records: UsageRecord[]) => UsageRecord[]) {
  const work = queue.then(async () => {
    const { usageRecords } = await chrome.storage.local.get('usageRecords');
    const records = Array.isArray(usageRecords) ? usageRecords as UsageRecord[] : [];
    await chrome.storage.local.set({ usageRecords: transform(records).slice(-USAGE_LIMIT) });
  });
  queue = work.catch(() => undefined);
  return work;
}
export async function readUsage(): Promise<UsageRecord[]> {
  await queue;
  const { usageRecords } = await chrome.storage.local.get('usageRecords');
  return Array.isArray(usageRecords) ? usageRecords as UsageRecord[] : [];
}
export const recoverUsage = () => update(records => records.map(record => record.status === 'running' ? { ...record, status: 'interrupted', finishedAt: Date.now() } : record));
export async function clearUsage() { epoch++; await update(() => []); }
/** Stores counters and model metadata only: no keys, source text, prompts or URLs. */
export async function* trackedStream(config: ModelConfig, key: string, messages: ApiMessage[], signal: AbortSignal, action: Action | 'test') {
  const generation = epoch;
  const record: UsageRecord = { id: crypto.randomUUID(), startedAt: Date.now(), modelId: config.id, modelName: config.name, provider: config.provider, model: config.model, action, status: 'running' };
  signal.throwIfAborted();
  await update(records => generation === epoch ? [...records, { ...record }] : records);
  let finished = false;
  try {
    for await (const text of adapterFor(config.provider).stream(config, key, messages, signal, usage => { record.usage = usage; })) yield text;
    finished = true; record.status = 'completed';
  } catch (error) {
    record.status = signal.aborted ? 'cancelled' : 'error';
    throw error;
  } finally {
    if (!finished && record.status === 'running') record.status = 'cancelled';
    record.finishedAt = Date.now();
    await update(records => generation === epoch ? records.map(item => item.id === record.id ? { ...record } : item) : records);
  }
}
