import { Children, isValidElement, useEffect, useId, useRef, useState, type ReactNode, type SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { autoUpdate, computePosition, flip, offset, shift, size } from '@floating-ui/dom';
import { Check, ChevronDown } from 'lucide-react';

type Option = { value: string; label: string; content?: ReactNode; disabled?: boolean };
type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value' | 'size'> & {
  value: string; options?: Option[]; variant?: 'provider';
  onChange?: (event: { target: { value: string }; nativeEvent: { isTrusted: boolean } }) => void;
};
/** Shared select surface, portalled inside the extension root (including Shadow DOM). */
export function Select({ value, options: supplied, children, onChange, variant, ...props }: Props) {
  const generated = useId(), id = props.id ?? generated;
  const options: Option[] = supplied ?? Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ value?: string; children?: ReactNode; disabled?: boolean }>(child)) return [];
    const label = Children.toArray(child.props.children).join('');
    return [{ value: child.props.value ?? label, label, disabled: child.props.disabled }];
  });
  const selected = options.findIndex(option => option.value === value);
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [active, setActive] = useState(Math.max(0, selected));
  const [portal, setPortal] = useState<Element | null>(null);
  useEffect(() => { setPortal(trigger.current?.closest('.selio-root') ?? document.body); }, []);
  const choose = (index: number, trusted: boolean) => {
    const option = options[index]; if (!option || option.disabled) return;
    if (option.value !== value) onChange?.({ target: { value: option.value }, nativeEvent: { isTrusted: trusted } });
    setOpen(false); trigger.current?.focus({ preventScroll: true });
  };
  useEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const button = trigger.current, popup = menu.current;
    let alive = true;
    const cleanup = autoUpdate(button, popup, () => {
      void computePosition(button, popup, { strategy: 'fixed', placement: 'bottom-end', middleware: [offset(6), flip(), shift({ padding: 10 }), size({ padding: 10, apply({ availableHeight, availableWidth, rects }) {
        popup.style.maxHeight = `${Math.max(40, Math.min(392, availableHeight))}px`;
        popup.style.maxWidth = `${Math.max(80, availableWidth)}px`;
        popup.style.minWidth = `${Math.min(rects.reference.width, availableWidth)}px`;
      } })] }).then(({ x, y }) => { if (alive) Object.assign(popup.style, { left: `${x}px`, top: `${y}px`, visibility: 'visible' }); });
    });
    const outside = (event: PointerEvent) => { const path = event.composedPath(); if (!path.includes(button) && !path.includes(popup)) setOpen(false); };
    document.addEventListener('pointerdown', outside, true);
    return () => { alive = false; cleanup(); document.removeEventListener('pointerdown', outside, true); };
  }, [open]);
  useEffect(() => {
    const item = menu.current?.children[active] as HTMLElement | undefined;
    if (open && menu.current && item) {
      const list = menu.current;
      if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
      else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
    }
  }, [open, active]);
  const current = options[selected];
  return <>
    <button ref={trigger} id={id} type="button" role="combobox" className={`select-trigger ${variant === 'provider' ? 'provider-trigger' : ''} ${props.className ?? ''}`} disabled={props.disabled}
      aria-label={props['aria-label']} aria-labelledby={props['aria-labelledby']} aria-expanded={open} aria-haspopup="listbox" aria-controls={`${id}-list`} aria-activedescendant={open ? `${id}-option-${active}` : undefined}
      onClick={() => { setActive(Math.max(0, selected)); setOpen(!open); }} onBlur={() => setOpen(false)} onKeyDown={e => {
        if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); return; }
        if (e.key === 'Tab') { setOpen(false); return; }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
          e.preventDefault(); setOpen(true);
          const direction = e.key === 'ArrowUp' || e.key === 'End' ? -1 : 1;
          let index = e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : !open ? Math.max(0, selected) : (active + direction + options.length) % options.length;
          for (let n = 0; n < options.length && options[index]?.disabled; n++) index = (index + direction + options.length) % options.length;
          setActive(index);
        } else if (open && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); choose(active, e.isTrusted); }
        else if (e.key.length === 1 && e.key !== ' ') { const index = options.findIndex(o => !o.disabled && o.label.toLocaleLowerCase().startsWith(e.key.toLocaleLowerCase())); if (index >= 0) { e.preventDefault(); setOpen(true); setActive(index); } }
      }}>{current?.content ?? <span>{current?.label ?? value}</span>}<ChevronDown size={14} className={open ? 'rotate' : ''}/></button>
    {open && portal && createPortal(<div ref={menu} id={`${id}-list`} role="listbox" aria-label={props['aria-label']} aria-labelledby={props['aria-label'] ? undefined : id} className={`select-menu ${variant === 'provider' ? 'provider-menu' : ''}`} style={{ visibility: 'hidden' }}>
      {options.map((option, index) => <div key={option.value} id={`${id}-option-${index}`} role="option" aria-label={option.label} aria-selected={option.value === value} aria-disabled={option.disabled || undefined} className={`select-option ${variant === 'provider' ? 'provider-option' : ''} ${active === index ? 'highlighted' : ''}`} onPointerMove={() => { if (!option.disabled) setActive(index); }} onPointerDown={e => e.preventDefault()} onClick={e => choose(index, e.isTrusted)}>{option.content ?? <span>{option.label}</span>}<Check size={14} className={option.value === value ? '' : 'select-check-hidden'}/></div>)}
    </div>, portal)}
  </>;
}
