'use client';

import { useCallback, useState } from 'react';
import { TIP_COPY, tipStorageKey, type TipId } from '@gameexplorer/shared';

/** Whether this browser has shown the tip already. Marking it is part of showing it. */
export function claimTip(id: TipId): boolean {
  try {
    const key = tipStorageKey('web', id);
    if (window.localStorage.getItem(key)) return false;
    window.localStorage.setItem(key, '1');
    return true;
  } catch {
    // Blocked storage: better never to teach than to teach on every move.
    return false;
  }
}

/**
 * One-time tips, shown where the thing they explain happens
 * (`project-docs/ux-fix-ideas.md` §4.4) — the first check, the first move the
 * board refuses. Each shows once per browser: offering one that has been shown
 * does nothing.
 */
export function useOnceTip() {
  const [tip, setTip] = useState<{ id: TipId; message: string } | null>(null);
  const offer = useCallback((id: TipId, message: string = TIP_COPY[id]) => {
    if (claimTip(id)) setTip({ id, message });
  }, []);
  const dismiss = useCallback(() => setTip(null), []);
  return { tip, offer, dismiss };
}
