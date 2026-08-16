import { useEffect } from 'react';
import type { GameSession } from './session';

/**
 * Redeems an invite id once the socket is up.
 *
 * Web reads the id straight off `window.location.search` in the play page; on a
 * phone it arrives through the router, having been rewritten from the web link
 * shape by `app/+native-intent.tsx` and parsed by `useSetupDeepLink`. Either
 * way the redemption has to wait for `connected`, because `acceptInvite` emits
 * on a socket that does not exist yet during the auth handshake — and nothing
 * would retry it.
 *
 * The double-accept guard lives inside `useGameSession.acceptInvite`, so this
 * hook can fire whenever the connection flaps without creating a second game.
 */
export function useInviteAccept(session: GameSession, inviteId: string | null): void {
  const { connected, acceptInvite } = session;

  useEffect(() => {
    if (!connected || !inviteId) return;
    acceptInvite(inviteId);
  }, [connected, inviteId, acceptInvite]);
}
