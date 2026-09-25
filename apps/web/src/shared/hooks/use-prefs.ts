import { useSyncExternalStore } from 'react';
import { type Prefs } from '@/shared/lib/prefs/prefs';
import { getPrefs, subscribePrefs } from '@/shared/lib/prefs/prefs-store';

/** As preferências deste aparelho de quem está usando o app (mudam na hora, em toda tela). */
export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribePrefs, getPrefs);
}
