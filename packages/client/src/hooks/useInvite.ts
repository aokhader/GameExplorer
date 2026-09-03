import { useCallback, useEffect, useState } from 'react';
import { useSocketStore } from '../stores/socketStore';
import type { GameType, TimeControl } from '@finesse/shared';

/**
 * Encapsulates the "challenge a friend" invite-link flow over the socket:
 *  - createInvite() asks the server for a shareable link and exposes it.
 *  - acceptInvite() redeems a link's inviteId; on success the server emits
 *    `game_started`, which the global useSocket handler turns into an active game.
 *  - inviteError surfaces expired/invalid links (server `error` event).
 *
 * Identity (username/rating) is passed through because the server stores it on
 * the invite and uses it for the created game / ELO.
 */
export function useInvite() {
  const socket = useSocketStore(s => s.socket);
  const [inviteUrl,   setInviteUrl]   = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [creating,    setCreating]    = useState(false);

  useEffect(() => {
    if (!socket) return;
    const onCreated = (d: { inviteId: string; url: string }) => {
      setInviteUrl(d.url);
      setCreating(false);
    };
    const onError = (d: { code: string; message: string }) => {
      if (d.code === 'INVITE_EXPIRED') { setInviteError(d.message); setCreating(false); }
    };
    socket.on('invite_link_created', onCreated);
    socket.on('error', onError);
    return () => {
      socket.off('invite_link_created', onCreated);
      socket.off('error', onError);
    };
  }, [socket]);

  const createInvite = useCallback(
    (gameType: GameType, timeControl: TimeControl, username: string, rating: number) => {
      if (!socket) return;
      setInviteError(null);
      setCreating(true);
      socket.emit('create_invite_link', { gameType, timeControl, username, rating });
    },
    [socket],
  );

  const acceptInvite = useCallback(
    (inviteId: string, username: string, rating: number) => {
      if (!socket) return;
      setInviteError(null);
      socket.emit('accept_invite', { inviteId, username, rating });
    },
    [socket],
  );

  const reset = useCallback(() => { setInviteUrl(null); setInviteError(null); setCreating(false); }, []);

  return { inviteUrl, inviteError, creating, createInvite, acceptInvite, reset };
}
