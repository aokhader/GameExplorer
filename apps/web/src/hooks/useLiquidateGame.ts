'use client';

import { useLiquidateGame as useLiquidateGameCore } from '@gameexplorer/client/liquidate/useLiquidateGame';
import type { LiquidateBotLevel } from '@gameexplorer/shared';
import { useSettings } from '@/components/providers/SettingsProvider';
import { webLiquidateStore } from '@/lib/liquidateStore';

/**
 * Web's Liquidate game hook: the shared loop plus localStorage.
 *
 * The state machine, bot loop and walk clock live in `@gameexplorer/client`,
 * identical to native's. What is genuinely web is below — a synchronous store
 * behind the shared async interface (`lib/liquidateStore.ts`).
 */

export interface UseLiquidateGameOptions {
  /** Distinguishes the saved slot for each mode. */
  storageKey: 'bot' | 'local';
  botLevel?: LiquidateBotLevel;
}

export function useLiquidateGame({ storageKey, botLevel }: UseLiquidateGameOptions) {
  const { reducedMotion } = useSettings();
  return useLiquidateGameCore({ storageKey, botLevel, store: webLiquidateStore, reducedMotion });
}

export type { SavedLiquidateGame } from '@gameexplorer/client/liquidate/saveStore';
