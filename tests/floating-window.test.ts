import { expect, it } from 'vitest';
import { clampWindow } from '../src/hooks/useFloatingWindow';
it('keeps a dragged or resized window accessible after the viewport shrinks', () => {
  expect(clampWindow({ x: 1100, y: 700, width: 900, height: 1000 }, { width: 390, height: 700 })).toEqual({ x: 12, y: 12, width: 366, height: 676 });
  expect(clampWindow({ x: -100, y: -100, width: 50, height: 20 }, { width: 1440, height: 900 })).toEqual({ x: 12, y: 12, width: 320, height: 360 });
});
