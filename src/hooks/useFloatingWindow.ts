import { useLayoutEffect, useRef, type RefObject, type PointerEvent, type KeyboardEvent } from 'react';
export interface WindowBounds { x: number; y: number; width: number; height: number }
export function clampWindow(rect: WindowBounds, viewport: { width: number; height: number }): WindowBounds {
  const margin = 12;
  const maxWidth = Math.max(100, viewport.width - margin * 2), maxHeight = Math.max(100, viewport.height - margin * 2);
  const width = Math.min(maxWidth, Math.max(Math.min(320, maxWidth), rect.width));
  const height = Math.min(maxHeight, Math.max(Math.min(360, maxHeight), rect.height));
  return { width, height, x: Math.max(margin, Math.min(rect.x, viewport.width - width - margin)), y: Math.max(margin, Math.min(rect.y, viewport.height - height - margin)) };
}
export function useFloatingWindow(ref: RefObject<HTMLDivElement | null>, open: boolean) {
  const manual = useRef(false), saved = useRef<WindowBounds | null>(null);
  const gesture = useRef<{ id: number; x: number; y: number; bounds: WindowBounds; mode: 'move' | 'resize' | 'width' | 'height' } | null>(null);
  const apply = (bounds: WindowBounds) => {
    const next = clampWindow(bounds, { width: innerWidth, height: innerHeight }); saved.current = next;
    if (ref.current) Object.assign(ref.current.style, { left: `${next.x}px`, top: `${next.y}px`, width: `${next.width}px`, height: `${next.height}px` });
  };
  const constrain = () => { if (manual.current && saved.current) apply(saved.current); };
  useLayoutEffect(() => {
    if (open && manual.current && saved.current && ref.current) {
      const next = clampWindow(saved.current, { width: innerWidth, height: innerHeight }); saved.current = next;
      Object.assign(ref.current.style, { left: `${next.x}px`, top: `${next.y}px`, width: `${next.width}px`, height: `${next.height}px` });
    }
  }, [open, ref]);
  const start = (event: PointerEvent<HTMLElement>, mode: 'move' | 'resize' | 'width' | 'height') => {
    if (event.button !== 0 || !ref.current) return;
    event.preventDefault(); event.stopPropagation();
    const rect = ref.current.getBoundingClientRect();
    manual.current = true;
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, mode };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLElement>) => {
    const current = gesture.current; if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.x, dy = event.clientY - current.y;
    const next = { ...current.bounds };
    if (current.mode === 'move') { next.x += dx; next.y += dy; }
    else {
      if (current.mode !== 'height') next.width += dx;
      if (current.mode !== 'width') next.height += dy;
      next.width = Math.min(next.width, innerWidth - next.x - 12);
      next.height = Math.min(next.height, innerHeight - next.y - 12);
    }
    apply(next);
  };
  const end = () => { gesture.current = null; };
  const keyboard = (event: KeyboardEvent<HTMLElement>, resize = false) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || !ref.current) return;
    event.preventDefault(); event.stopPropagation(); manual.current = true;
    const rect = ref.current.getBoundingClientRect(), next = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    const step = event.shiftKey ? 40 : 10;
    if (event.key === 'ArrowLeft') next[resize ? 'width' : 'x'] -= step;
    if (event.key === 'ArrowRight') next[resize ? 'width' : 'x'] += step;
    if (event.key === 'ArrowUp') next[resize ? 'height' : 'y'] -= step;
    if (event.key === 'ArrowDown') next[resize ? 'height' : 'y'] += step;
    apply(next);
  };
  const reset = () => { manual.current = false; saved.current = null; if (ref.current) { ref.current.style.width = ''; ref.current.style.height = ''; } window.dispatchEvent(new Event('resize')); };
  return { manual, constrain, start, move, end, keyboard, reset };
}
