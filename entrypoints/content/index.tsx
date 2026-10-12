import { defineContentScript } from 'wxt/utils/define-content-script';
import { createRoot } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import { computePosition, flip, offset, shift } from '@floating-ui/dom';
import style from '../../src/styles.css?inline';
import { Chat } from '../../src/components/Chat';
import { Mark } from '../../src/components/Brand';
import { useChat } from '../../src/hooks/useChat';
import { useFloatingWindow } from '../../src/hooks/useFloatingWindow';
import { useTheme } from '../../src/hooks/useTheme';
import { paragraphFromRange, snapshotSelection } from '../../src/shared/selection';
import { matchesSitePattern, siteDisabled } from '../../src/shared/validation';
import { rpc } from '../../src/shared/rpc';
import { translator } from '../../src/shared/i18n';
import type { SelectionSnapshot } from '../../src/shared/types';

function App({ host }: { host: HTMLElement }) {
  const session = useChat();
  const hasEnabledActions = session.actions.some(action => action.showInQuickActions);
  const t = translator(session.preferences.uiLanguage);
  const theme = useTheme(session.preferences.theme);
  const [selection, setSelection] = useState<SelectionSnapshot | null>(null);
  const [placement, setPlacement] = useState<'bottom-end' | 'right-start'>('bottom-end');
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hoverOpened = useRef(false);
  const cancelHover = () => clearTimeout(hoverTimer.current);
  useEffect(() => () => clearTimeout(hoverTimer.current), [selection]);
  const [open, setOpen] = useState(false);
  useEffect(() => { if (session.conversation?.page || session.conversation?.mode === 'general') setOpen(false); }, [session.conversation?.page, session.conversation?.mode]);
  const [access, setAccess] = useState(true);
  const accessRevoked = useRef(false);
  const previousAllSites = useRef(false);
  const [anchor, setAnchor] = useState<SelectionSnapshot | null>(null);
  const range = useRef<Range | null>(null);
  const chatRange = useRef<Range | null>(null);
  const icon = useRef<HTMLButtonElement>(null);
  const floating = useRef<HTMLDivElement>(null);
  const windowControls = useFloatingWindow(floating, open);
  const controls = useRef(windowControls); controls.current = windowControls;
  const state = useRef({ open, chat: session.conversation, preferences: session.preferences });
  state.current = { open, chat: session.conversation, preferences: session.preferences };
  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout>;
    let pointerDown = false;
    const detect = () => {
      if (pointerDown || document.activeElement === host) return;
      const preferences = state.current.preferences;
      if (accessRevoked.current || !preferences.autoSelection || siteDisabled(location.hostname, preferences.disabledSites)) { setSelection(null); return; }
      const current = window.getSelection();
      if (current?.anchorNode && host.contains(current.anchorNode)) return;
      const saved = snapshotSelection(current, document.title);
      if (saved) saved.snapshot.pageUrl = location.href;
      if (saved && !(state.current.open && saved.snapshot.text === state.current.chat?.selection.text && saved.snapshot.pageUrl === state.current.chat?.selection.pageUrl)) { range.current = saved.range; setSelection(saved.snapshot); }
      else setSelection(null);
    };
    const changed = () => { cancelHover(); clearTimeout(debounce); debounce = setTimeout(detect, 160); };
    const down = (event: PointerEvent) => {
      if (event.composedPath().includes(host)) return;
      pointerDown = true;
      const { open, chat } = state.current;
      const input = host.shadowRoot?.querySelector('textarea');
      if (open && chat?.status !== 'generating' && !chat?.draft && !input?.value && host.shadowRoot?.activeElement !== input) setOpen(false);
    };
    const up = () => { pointerDown = false; changed(); };
    const key = (event: KeyboardEvent) => {
      if (event.composedPath().includes(host)) return;
      if (event.key === 'Escape' && state.current.chat?.status !== 'generating' && !state.current.chat?.draft) { setOpen(false); setSelection(null); }
    };
    const message = (message: { type: string; text?: string; origins?: string[] }, _sender: chrome.runtime.MessageSender, respond: (data: unknown) => void) => {
      if (message.type === 'selio:selection-ready') respond(true);
      if (message.type === 'selio:revoked' && message.origins?.some(pattern => matchesSitePattern(pattern, location.href))) { accessRevoked.current = true; setAccess(false); setSelection(null); }
      if (message.type === 'selio:enabled') { accessRevoked.current = false; setAccess(true); }
      if (message.type === 'selio:paragraph') {
        const saved = chatRange.current;
        const current = state.current.chat;
        if (saved && saved.startContainer.isConnected && current?.selection.text === message.text) respond({ paragraph: paragraphFromRange(saved) });
        else respond(null);
      }
    };
    document.addEventListener('selectionchange', changed);
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('keydown', key, true);
    chrome.runtime.onMessage.addListener(message);
    return () => { clearTimeout(debounce); document.removeEventListener('selectionchange', changed); document.removeEventListener('pointerdown', down, true); document.removeEventListener('pointerup', up, true); document.removeEventListener('keydown', key, true); chrome.runtime.onMessage.removeListener(message); };
  }, [host]);
  useEffect(() => {
    if (previousAllSites.current && !session.preferences.allSites && !session.preferences.grantedSites.some(pattern => matchesSitePattern(pattern, location.href))) { accessRevoked.current = true; setAccess(false); setSelection(null); }
    if (session.preferences.allSites) { accessRevoked.current = false; setAccess(true); }
    previousAllSites.current = session.preferences.allSites;
    if (!session.preferences.autoSelection || siteDisabled(location.hostname, session.preferences.disabledSites)) { cancelHover(); setSelection(null); setOpen(false); }
  }, [session.preferences]);
  useEffect(() => {
    if (!open || hoverOpened.current) return;
    const frame = requestAnimationFrame(() => floating.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [open]);
  useEffect(() => {
    const position = () => {
      const rect = (saved: SelectionSnapshot, currentRange: Range | null) => {
        if (currentRange?.startContainer.isConnected) {
          const rects = currentRange.getClientRects();
          return rects[rects.length - 1] ?? currentRange.getBoundingClientRect();
        }
        return new DOMRect(saved.rect.x, saved.rect.y, saved.rect.width, saved.rect.height);
      };
      if (selection && icon.current) {
        const button = icon.current;
        void computePosition({ getBoundingClientRect: () => rect(selection, range.current) }, button, { strategy: 'fixed', placement: 'bottom-end', middleware: [offset(7), flip(), shift({ padding: 8 })] }).then(({ x, y }) => { button.style.left = `${x}px`; button.style.top = `${y}px`; });
      }
      if (controls.current.manual.current) controls.current.constrain();
      else if (open && anchor && floating.current) {
        const element = floating.current;
        void computePosition({ getBoundingClientRect: () => placement === 'right-start' && chatRange.current?.startContainer.isConnected ? chatRange.current.getBoundingClientRect() : rect(anchor, chatRange.current) }, element, { strategy: 'fixed', placement, middleware: [offset(10), flip({ crossAxis: placement !== 'right-start' }), shift({ padding: 12, crossAxis: true })] }).then(({ x, y }) => { if (!controls.current.manual.current) { element.style.left = `${x}px`; element.style.top = `${y}px`; } });
      }
    };
    position();
    const observer = new ResizeObserver(position);
    if (floating.current) observer.observe(floating.current);
    window.addEventListener('scroll', position, true); window.addEventListener('resize', position);
    return () => { observer.disconnect(); window.removeEventListener('scroll', position, true); window.removeEventListener('resize', position); };
  }, [selection, open, anchor, placement, hasEnabledActions, session.connected, access]);
  const start = (snapshot: SelectionSnapshot, selectedRange: Range | null) => {
    chatRange.current = selectedRange;
    const source = { ...snapshot };
    if (session.preferences.scope === 'paragraph' && selectedRange) source.paragraph = paragraphFromRange(selectedRange);
    setAnchor(source); setOpen(true); setSelection(null);
    session.send({ type: 'start', selection: source });
  };
  const launch = (hover = false) => {
    cancelHover();
    if (!selection || !session.connected || !hasEnabledActions || accessRevoked.current || !session.preferences.autoSelection || siteDisabled(location.hostname, session.preferences.disabledSites)) return;
    hoverOpened.current = hover;
    setPlacement(hover ? 'right-start' : 'bottom-end');
    if (hover) controls.current.manual.current = false;
    if (session.conversation?.selection.text === selection.text && session.conversation.selection.pageUrl === selection.pageUrl) {
      setOpen(true); setAnchor(selection); setSelection(null);
    } else start(selection, range.current);
  };

  return <div className="selio-root overlay" data-theme={theme}>
    {access && selection && session.connected && hasEnabledActions && <button ref={icon} className="selection-launcher" aria-label={t("用 Selio 阅读选中文字")} title={`Selio · ${selection.text.slice(0, 60)}`} onPointerEnter={e => { if (e.isTrusted && e.pointerType !== 'touch') { cancelHover(); hoverTimer.current = setTimeout(() => launch(true), 800); } }} onPointerLeave={cancelHover} onPointerCancel={cancelHover} onPointerDown={e => { cancelHover(); e.preventDefault(); }} onClick={e => { if (e.isTrusted) launch(); }}><Mark size={24}/></button>}
    {open && <div ref={floating} tabIndex={-1} className="floating-container" onPointerMove={windowControls.move} onPointerUp={windowControls.end} onPointerCancel={windowControls.end} onLostPointerCapture={windowControls.end} role="dialog" aria-modal="false" aria-label={t("Selio 对话")} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }}><Chat windowControls={windowControls} session={session} onClose={() => setOpen(false)} onPin={() => void rpc('chat:pin').then(() => setOpen(false), e => session.setError(e.message))}/><button className="resize-corner" aria-label={t('调整浮窗大小')} title={t('拖动调整大小，或使用方向键')} onPointerDown={e => windowControls.start(e, 'resize')} onKeyDown={e => windowControls.keyboard(e, true)}><span/></button><div className="resize-edge resize-right" onPointerDown={e => windowControls.start(e, 'width')}/><div className="resize-edge resize-bottom" onPointerDown={e => windowControls.start(e, 'height')}/></div>}
  </div>;
}
export default defineContentScript({
  // Runtime registration follows all-site, per-site and automatic selection preferences.
  registration: 'runtime', cssInjectionMode: 'manual',
  main(ctx) {
    const instance = globalThis as typeof globalThis & { __selioMounted?: boolean };
    if (instance.__selioMounted) return;
    instance.__selioMounted = true;
    // An extension update can leave an old, disconnected host in the existing document.
    document.querySelector('selio-assistant')?.remove();
    const host = document.createElement('selio-assistant');
    host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;';
    const shadow = host.attachShadow({ mode: 'open' });
    const css = document.createElement('style'); css.textContent = style;
    const container = document.createElement('div'); shadow.append(css, container);
    document.documentElement.append(host);
    const root = createRoot(container); root.render(<App host={host}/>);
    ctx.onInvalidated(() => { root.unmount(); host.remove(); instance.__selioMounted = false; });
  },
});
