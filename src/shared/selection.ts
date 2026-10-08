import { LIMITS, type SelectionSnapshot } from './types';
import { cleanText } from './validation';

export function isEditable(node: Node | null): boolean {
  const element = node instanceof Element ? node : node?.parentElement;
  return Boolean(element?.closest('input, textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'));
}
export function paragraphFromRange(range: Range): string {
  const node = range.commonAncestorContainer;
  const element = node instanceof Element ? node : node.parentElement;
  const paragraph = element?.closest('p, li, pre, blockquote, td, h1, h2, h3, h4');
  // No broad div/body fallback: it might silently become the whole page.
  return cleanText(paragraph?.textContent ?? range.toString(), LIMITS.paragraph);
}
export function snapshotSelection(selection: Selection | null, title: string, includeParagraph = false): { snapshot: SelectionSnapshot; range: Range } | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0 || isEditable(selection.anchorNode) || isEditable(selection.focusNode)) return null;
  const range = selection.getRangeAt(0).cloneRange();
  const text = cleanText(selection.toString(), LIMITS.selection);
  if (!text) return null;
  const rects = Array.from(range.getClientRects());
  const rect = rects.at(-1) ?? range.getBoundingClientRect();
  return { range, snapshot: { text, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, pageTitle: title.slice(0, 200), ...(includeParagraph ? { paragraph: paragraphFromRange(range) } : {}) } };
}
