import { describe, expect, it } from 'vitest';
import { isEditable, paragraphFromRange, snapshotSelection } from '../src/shared/selection';
import { cleanText, sanitizeSnapshot, siteDisabled } from '../src/shared/validation';

describe('selection snapshot', () => {
  it('normalizes line endings, strips nulls, trims and caps text', () => {
    expect(cleanText('  a\r\nb\u0000  ', 20)).toBe('a\nb');
    expect(cleanText('abcdef', 3)).toBe('abc');
  });
  it('ignores inputs, textareas and editable descendants', () => {
    document.body.innerHTML = '<input/><textarea></textarea><div contenteditable="true"><b>edit</b></div><p>read</p>';
    for (const selector of ['input', 'textarea', 'b']) expect(isEditable(document.querySelector(selector))).toBe(true);
    expect(isEditable(document.querySelector('p'))).toBe(false);
  });
  it('takes an independent range and last-line rectangle; paragraph is opt-in', () => {
    document.body.innerHTML = '<p>First sentence. Selected words. Last sentence.</p>';
    const paragraph = document.querySelector('p')!;
    const range = document.createRange(); range.setStart(paragraph.firstChild!, 16); range.setEnd(paragraph.firstChild!, 30);
    // JSDOM has no layout engine. The real Range geometry is covered by browser smoke tests.
    Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [{ x: 10, y: 20, width: 50, height: 15 }, { x: 10, y: 35, width: 30, height: 15 }] });
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    const result = snapshotSelection(selection, 'Title')!;
    expect(result.range).not.toBe(range);
    expect(result.snapshot.paragraph).toBeUndefined();
    expect(result.snapshot.rect.y).toBe(35);
    selection.removeAllRanges();
    expect(result.snapshot.text).toBe('Selected words');
    expect(paragraphFromRange(result.range)).toBe(paragraph.textContent);
  });
  it('never uses an entire page as fallback paragraph', () => {
    document.body.innerHTML = '<div>before <span>selected</span> after</div><div>SECRET UNRELATED TEXT</div>';
    const range = document.createRange(); range.selectNodeContents(document.querySelector('span')!);
    expect(paragraphFromRange(range)).toBe('selected');
  });
  it('sanitizes external snapshots and rejects empty selections', () => {
    expect(() => sanitizeSnapshot({ text: ' ' } as never)).toThrow();
    const snapshot = sanitizeSnapshot({ text: 'a'.repeat(20000), rect: { x: NaN, y: 1, width: 2, height: 3 }, pageTitle: 't' });
    expect(snapshot.text).toHaveLength(12000); expect(snapshot.rect.x).toBe(20);
  });
  it('matches a disabled host and subdomains without matching lookalikes', () => {
    expect(siteDisabled('docs.example.com', ['example.com'])).toBe(true);
    expect(siteDisabled('notexample.com', ['example.com'])).toBe(false);
  });
});
