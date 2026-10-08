import { useEffect } from 'react';
import { rpc } from '../shared/rpc';
import type { Settings, UILanguage } from '../shared/types';

export function usePageLanguage(language: UILanguage = 'en', title = 'Reading companion') {
  useEffect(() => { document.documentElement.lang = language; document.title = `Selio · ${title}`; }, [language, title]);
}
/** Trusted extension pages stay in sync when preferences change in another window. */
export function useSettingsUpdates(onSettings: (settings: Settings) => void) {
  useEffect(() => {
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.settings) void rpc<Settings>('settings:get').then(onSettings).catch(() => undefined);
    };
    chrome.storage.onChanged.addListener(changed);
    return () => chrome.storage.onChanged.removeListener(changed);
  }, [onSettings]);
}
