import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { autoUpdate, computePosition, flip, offset, shift, size } from '@floating-ui/dom';
import { MoreHorizontal } from 'lucide-react';
import { ActionIcon } from './ActionIcon';
import { actionLabel } from '../shared/actions';
import type { Translator } from '../shared/i18n';
import type { Action, PublicAction } from '../shared/types';

/** Action menu stays inside the extension root so it also works in Shadow DOM. */
export function MoreActions({ actions, value, disabled, t, onSelect }: {
  actions: PublicAction[]; value: Action; disabled: boolean; t: Translator;
  onSelect: (action: Action) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const initialFocus = useRef(0);
  const [open, setOpen] = useState(false);
  const [portal, setPortal] = useState<Element | null>(null);
  useEffect(() => { setPortal(trigger.current?.closest('.selio-root') ?? document.body); }, []);
  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  };
  const show = (index: number) => {
    initialFocus.current = index;
    if (open) menu.current?.querySelectorAll<HTMLButtonElement>('button')[index]?.focus({ preventScroll: true });
    else setOpen(true);
  };
  useEffect(() => {
    if (!open || disabled || !trigger.current || !menu.current) return;
    const button = trigger.current, popup = menu.current;
    let alive = true, positioned = false;
    const cleanup = autoUpdate(button, popup, () => {
      void computePosition(button, popup, { strategy: 'fixed', placement: 'bottom-end', middleware: [offset(8), flip(), shift({ padding: 10 }), size({ padding: 10, apply({ availableHeight, availableWidth }) {
        popup.style.maxHeight = `${Math.max(24, Math.min(392, availableHeight))}px`;
        popup.style.maxWidth = `${Math.max(24, Math.min(320, availableWidth))}px`;
      } })] }).then(({ x, y }) => {
        if (!alive) return;
        Object.assign(popup.style, { left: `${x}px`, top: `${y}px`, visibility: 'visible' });
        if (!positioned) {
          positioned = true;
          popup.querySelectorAll<HTMLButtonElement>('button')[initialFocus.current]?.focus({ preventScroll: true });
        }
      });
    });
    const outside = (event: Event) => {
      const path = event.composedPath();
      if (!path.includes(button) && !path.includes(popup)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside, true);
    return () => {
      alive = false; cleanup();
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside, true);
    };
  }, [open, disabled, portal, actions.length]);
  const expanded = open && !disabled;
  return <>
    <button ref={trigger} id={id} className="more-actions" type="button" disabled={disabled}
      title={t('更多操作')} aria-label={t('更多操作')} aria-haspopup="menu" aria-expanded={expanded} aria-controls={`${id}-menu`}
      data-active={actions.some(action => action.id === value) || undefined}
      onClick={() => { if (open) close(); else show(0); }} onKeyDown={e => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); show(e.key === 'ArrowUp' ? actions.length - 1 : 0); }
        else if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); close(true); }
      }}><MoreHorizontal size={18} aria-hidden="true"/></button>
    {expanded && portal && createPortal(<div ref={menu} id={`${id}-menu`} role="menu" aria-labelledby={id} className="action-menu" style={{ visibility: 'hidden' }}>
      {actions.map((action, index) => <button key={action.id} role="menuitem" type="button" tabIndex={-1} aria-current={action.id === value || undefined}
        onClick={e => { close(true); if (e.isTrusted) onSelect(action.id); }} onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
          else if (e.key === 'Tab') close(true);
          else {
            let next: number;
            if (e.key === 'ArrowDown') next = (index + 1) % actions.length;
            else if (e.key === 'ArrowUp') next = (index - 1 + actions.length) % actions.length;
            else if (e.key === 'Home') next = 0;
            else if (e.key === 'End') next = actions.length - 1;
            else return;
            e.preventDefault();
            const item = menu.current?.querySelectorAll<HTMLButtonElement>('button')[next];
            item?.focus({ preventScroll: true }); item?.scrollIntoView({ block: 'nearest' });
          }
        }}><ActionIcon name={action.icon} size={17}/><span>{actionLabel(action, t)}</span></button>)}
    </div>, portal)}
  </>;
}
