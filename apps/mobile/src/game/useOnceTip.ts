import { useCallback, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TIP_COPY, tipStorageKey, type TipId } from '@gameexplorer/shared';

/** Whether this device has shown the tip already. Marking it is part of showing it. */
export async function claimTip(id: TipId): Promise<boolean> {
  const key = tipStorageKey('native', id);
  try {
    if (await AsyncStorage.getItem(key)) return false;
    await AsyncStorage.setItem(key, '1');
    return true;
  } catch {
    // Unreadable storage: better never to teach than to teach on every move.
    return false;
  }
}

/**
 * One-time tips, shown where the thing they explain happens
 * (`project-docs/ux-fix-ideas.md` §4.4) — web's `useOnceTip`, over AsyncStorage.
 */
export function useOnceTip() {
  const [tip, setTip] = useState<{ id: TipId; message: string } | null>(null);
  const offer = useCallback((id: TipId, message: string = TIP_COPY[id]) => {
    void claimTip(id).then((fresh) => {
      if (fresh) setTip({ id, message });
    });
  }, []);
  const dismiss = useCallback(() => setTip(null), []);
  return { tip, offer, dismiss };
}
