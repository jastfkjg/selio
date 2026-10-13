import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AnswerContent } from '../src/components/AnswerContent';
import type { PageSnapshot } from '../src/shared/types';

afterEach(() => vi.unstubAllGlobals());
it('keeps evidence collapsed and makes only valid prose citations keyboard accessible', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const scroll = vi.fn();
  const original = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = scroll;
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const page: PageSnapshot = { title: 'Article', url: 'https://example.com', capturedAt: 1, method: 'semantic', totalCharacters: 9, truncated: false, chunks: [{ id: 3, heading: 'Evidence', text: 'Source text', start: 0, end: 11 }] };
  try {
    await act(async () => root.render(createElement(AnswerContent, { text: 'Claim [3]. Unknown [99]. Code `[3]`. [Link [3]](https://example.com).', language: 'en', page, context: { mode: 'retrieval', chunkIds: [3], characters: 11 }, saved: true, totalChunks: 7 })));
    expect(host.querySelector('.page-context')?.hasAttribute('open')).toBe(false);
    expect(host.textContent).not.toContain('Source text');
    expect(host.querySelectorAll('.citation-button')).toHaveLength(1);
    expect(host.querySelector('code')?.textContent).toBe('[3]');
    expect(host.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
    await act(async () => (host.querySelector('.citation-button') as HTMLButtonElement).click());
    const passage = host.querySelector<HTMLDetailsElement>('[data-passage-id="3"]')!;
    expect(passage.open).toBe(true);
    expect(document.activeElement).toBe(passage.querySelector('summary'));
    expect(host.textContent).toContain('1/7');
    expect(host.textContent).toContain('offline review');
    expect(scroll).toHaveBeenCalled();
    await act(async () => { passage.open = false; (host.querySelector('.citation-button') as HTMLButtonElement).click(); });
    expect(passage.open).toBe(true);
  } finally {
    await act(async () => root.unmount()); host.remove();
    HTMLElement.prototype.scrollIntoView = original;
  }
});
