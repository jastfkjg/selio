import { useEffect, useId, useRef, useState } from 'react';
import { autoUpdate, computePosition, flip, offset, shift, size } from '@floating-ui/dom';
import { Check, ChevronDown } from 'lucide-react';
import { PROVIDERS, PROVIDER_IDS } from '../shared/providers';
import type { Provider } from '../shared/types';

export function ProviderPicker({ value, onChange, label }: { value: Provider; onChange: (provider: Provider) => void; label: string }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(PROVIDER_IDS.indexOf(value));
  const selected = PROVIDERS[value];
  const choose = (provider: Provider) => { onChange(provider); setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open || !trigger.current || !list.current) return;
    const button = trigger.current, popup = list.current;
    const cleanup = autoUpdate(button, popup, () => {
      void computePosition(button, popup, { placement: 'bottom-start', strategy: 'fixed', middleware: [offset(8), flip(), shift({ padding: 12 }), size({ padding: 12, apply({ availableHeight, rects }) { Object.assign(popup.style, { width: `${rects.reference.width}px`, maxHeight: `${Math.max(80, Math.min(392, availableHeight))}px` }); } })] }).then(({ x, y }) => { Object.assign(popup.style, { left: `${x}px`, top: `${y}px` }); });
    });
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => { cleanup(); document.removeEventListener('pointerdown', outside); };
  }, [open]);
  useEffect(() => { if (open) list.current?.children[active]?.scrollIntoView({ block: 'nearest' }); }, [active, open]);
  return <div ref={root} className="provider-picker" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <label id={`${id}-label`} htmlFor="provider">{label}</label>
    <button ref={trigger} id="provider" type="button" className={`provider-trigger ${open ? 'is-open' : ''}`} role="combobox" aria-labelledby={`${id}-label`} aria-controls={`${id}-list`} aria-haspopup="listbox" aria-expanded={open} aria-activedescendant={open ? `${id}-${PROVIDER_IDS[active]}` : undefined} onClick={() => { setActive(PROVIDER_IDS.indexOf(value)); setOpen(!open); }} onKeyDown={e => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
      if (e.key === 'Tab') { setOpen(false); return; }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
        e.preventDefault(); setOpen(true);
        setActive(previous => e.key === 'Home' ? 0 : e.key === 'End' ? PROVIDER_IDS.length - 1 : !open ? PROVIDER_IDS.indexOf(value) : (previous + (e.key === 'ArrowDown' ? 1 : -1) + PROVIDER_IDS.length) % PROVIDER_IDS.length);
      } else if (open && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); choose(PROVIDER_IDS[active] ?? value); }
      else if (/^[a-z]$/i.test(e.key)) { const index = PROVIDER_IDS.findIndex(p => PROVIDERS[p].name.toLowerCase().startsWith(e.key.toLowerCase())); if (index >= 0) { e.preventDefault(); setOpen(true); setActive(index); } }
    }}><span className={`provider-mark provider-${value}`} aria-hidden="true">{selected.mark}</span><span className="provider-copy"><strong>{selected.name}</strong><small>{selected.protocol}</small></span><ChevronDown size={15} className={open ? 'rotate' : ''}/></button>
    {open && <div ref={list} id={`${id}-list`} className="provider-menu" role="listbox" aria-labelledby={`${id}-label`}>{PROVIDER_IDS.map((provider, index) => <div key={provider} id={`${id}-${provider}`} role="option" aria-selected={provider === value} className={`provider-option ${active === index ? 'highlighted' : ''}`} onPointerMove={() => setActive(index)} onPointerDown={e => e.preventDefault()} onClick={() => choose(provider)}><span className={`provider-mark provider-${provider}`} aria-hidden="true">{PROVIDERS[provider].mark}</span><span className="provider-copy"><strong>{PROVIDERS[provider].name}</strong><small>{PROVIDERS[provider].protocol}</small></span>{provider === value && <Check size={16}/>}</div>)}</div>}
  </div>;
}
