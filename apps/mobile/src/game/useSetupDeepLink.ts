import { useLocalSearchParams } from 'expo-router';

export interface SetupDeepLink {
  /** Nearest available tier to the requested strength, or null if none asked. */
  elo: number | null;
  autoStart: boolean;
  /** Open straight into online play (an invite link, or the tour's online step). */
  online: boolean;
  /** Invite id to redeem once the socket connects. */
  inviteId: string | null;
}

/**
 * Reads the deep link a game screen was opened with, mirroring web's bot and
 * play pages: `?elo=&start=1` from the welcome tour, and `?online=1&invite=<id>`
 * from an invite link (see `app/+native-intent.tsx`, which rewrites the web
 * URL shape into this one).
 *
 * Mobile's tour used to collect a difficulty and then route with only the game
 * name, so every first game started the default bot regardless of the card the
 * player picked. Both platforms now carry the choice through.
 *
 * The result is meant for **lazy initial state**, not an effect: the params are
 * available on the first render, so seeding `useState` with them skips the
 * setup-screen flash that web needs a layout effect to avoid. Reading it later
 * would also fight the user, re-applying the link every time they touch a
 * picker. The one exception is `inviteId`, which is handed to the session hook
 * to redeem once the socket is up — see `useInviteAccept`.
 */
export function useSetupDeepLink(tiers: readonly number[]): SetupDeepLink {
  const params = useLocalSearchParams<{
    elo?: string;
    start?: string;
    online?: string;
    invite?: string;
  }>();
  const requested = Number(params.elo);
  const elo =
    Number.isFinite(requested) && requested > 0
      ? tiers.reduce((a, b) => (Math.abs(b - requested) < Math.abs(a - requested) ? b : a))
      : null;
  const inviteId = params.invite?.trim() ? params.invite.trim() : null;
  return {
    elo,
    autoStart: params.start === '1',
    // An invite link implies online even without the flag: there is nothing
    // else an invite could mean.
    online: params.online === '1' || inviteId != null,
    inviteId,
  };
}
