import { useEffect, useState } from 'react';
import type { Theme } from '../shared/types';
export function useTheme(theme: Theme): 'light' | 'dark' {
  const [dark, setDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => setDark(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return theme === 'system' ? dark ? 'dark' : 'light' : theme;
}
