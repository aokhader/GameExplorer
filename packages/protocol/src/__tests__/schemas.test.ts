// The schema half of the API's Wave 3 socket suite
// (apps/api/src/__tests__/security/wave3-socket-validation.test.ts), run on
// the schemas directly. Over a socket each refusal also had to touch no state
// and keep the socket open; that half moves to the game room's tests.
import { describe, expect, it } from 'vitest';
import { SocketSchemas, type SocketEvent } from '../schemas';

const UNKNOWN_GAME = '00000000-0000-4000-8000-000000000000';

describe('WS5-21 · every socket event goes through its schema', () => {
  const gameIdNearMisses = [
    { gameId: 'junk' }, { gameId: 'A'.repeat(10_000) }, { gameId: { $ne: null } },
    { gameId: ['a'] }, { gameId: UNKNOWN_GAME.toUpperCase().replace(/-/g, '') },
  ];

  // Shapes that are close to right, per event — the ones a naive check misses.
  const nearMisses: Record<SocketEvent, unknown[]> = {
    join_queue: [
      { gameType: 'go', timeControl: 'blitz', rated: true },            // not an online game
      { gameType: 'chess', timeControl: 'x', rated: true },             // the GX-06 value
      { gameType: 'chess', timeControl: 'blitz', rated: 'yes' },
      { gameType: 'chess:x', timeControl: 'blitz', rated: true },       // a key separator
    ],
    leave_queue: [{ gameType: 'chess', timeControl: 'hyperbullet', rated: false }],
    join_game: gameIdNearMisses, resign: gameIdNearMisses, abort_game: gameIdNearMisses,
    offer_draw: gameIdNearMisses, accept_draw: gameIdNearMisses, decline_draw: gameIdNearMisses,
    spectate: gameIdNearMisses, leave_spectate: gameIdNearMisses,
    claim_flag: gameIdNearMisses,
    make_move: [
      { gameId: UNKNOWN_GAME, move: { type: 'chess', from: 'z9', to: 'e4' } },
      { gameId: UNKNOWN_GAME, move: { type: 'chess', from: 'e2', to: 'e4', promotion: 'king' } },
      { gameId: UNKNOWN_GAME, move: { type: 'pass' } },
      { gameId: UNKNOWN_GAME, move: 'e2e4' },
      { gameId: 'junk', move: { type: 'reversi', position: 'd3' } },
    ],
    send_chat: [{ gameId: UNKNOWN_GAME, text: 12345 }, { gameId: UNKNOWN_GAME, text: '' }, { gameId: UNKNOWN_GAME, text: 'x'.repeat(1001) }],
    send_emote: [{ gameId: UNKNOWN_GAME, emote: '<script>' }, { gameId: UNKNOWN_GAME, emote: '👍👍' }],
    create_invite_link: [
      { gameType: 'chess', timeControl: 'x' },
      { gameType: 'chess/../../evil', timeControl: 'blitz' },           // lands in a URL path
    ],
    accept_invite: [
      { inviteId: 'abcdef12' },                                         // the old 32-bit format
      { inviteId: UNKNOWN_GAME.replace(/-/g, '') },                     // a UUID without its dashes
      { inviteId: { $ne: null } },
    ],
    // Wave 6 (GX-16).
    reauth: [{ token: '' }, { token: 12345 }, { token: 'x'.repeat(8193) }, { token: { $ne: null } }],
  };

  // One payload per event that must pass, so the refusals above are not
  // refusals of everything.
  const valid: Record<SocketEvent, unknown> = {
    join_queue: { gameType: 'chess', timeControl: 'blitz', rated: true },
    leave_queue: { gameType: 'reversi', timeControl: 'movetime', rated: false },
    join_game: { gameId: UNKNOWN_GAME }, resign: { gameId: UNKNOWN_GAME }, abort_game: { gameId: UNKNOWN_GAME },
    offer_draw: { gameId: UNKNOWN_GAME }, accept_draw: { gameId: UNKNOWN_GAME }, decline_draw: { gameId: UNKNOWN_GAME },
    spectate: { gameId: UNKNOWN_GAME }, leave_spectate: { gameId: UNKNOWN_GAME },
    claim_flag: { gameId: UNKNOWN_GAME },
    make_move: { gameId: UNKNOWN_GAME, move: { type: 'chess', from: 'e7', to: 'e8', promotion: 'knight' } },
    send_chat: { gameId: UNKNOWN_GAME, text: 'x'.repeat(1000) },
    send_emote: { gameId: UNKNOWN_GAME, emote: '🤝' },
    create_invite_link: { gameType: 'checkers', timeControl: 'classical' },
    accept_invite: { inviteId: '3f2c9a4e-8b1d-4c7a-9e02-5d6f7a8b9c0d' },
    reauth: { token: 'x'.repeat(8192) },
  };

  const events = Object.keys(SocketSchemas) as SocketEvent[];

  it('covers all seventeen events: the API’s sixteen and claim_flag', () => {
    expect(events).toHaveLength(17);
    expect(events).toContain('claim_flag');
  });

  it('an invite id must be a whole UUID; the old 32-bit form is refused (WS5-30)', () => {
    const accept = SocketSchemas.accept_invite;
    expect(accept.safeParse({ inviteId: '3f2c9a4e-8b1d-4c7a-9e02-5d6f7a8b9c0d' }).success).toBe(true);
    for (const inviteId of ['3f2c9a4e', '3f2c9a4e8b1d4c7a9e025d6f7a8b9c0d', '3f2c9a4e-8b1d-4c7a-9e02']) {
      expect(accept.safeParse({ inviteId }).success, inviteId).toBe(false);
    }
  });

  it.each(events)('%s refuses every malformed payload and accepts a good one', (event) => {
    const schema = SocketSchemas[event];
    const payloads = [undefined, null, 'x', 7, [], {}, ...nearMisses[event]];
    for (const p of payloads) {
      expect(schema.safeParse(p).success, `${event} accepted ${JSON.stringify(p)?.slice(0, 80)}`).toBe(false);
    }
    expect(schema.safeParse(valid[event]).success).toBe(true);
  });

  it('a move is parsed without keys the client added', () => {
    const parsed = SocketSchemas.make_move.parse({
      gameId: UNKNOWN_GAME,
      move: { type: 'chess', from: 'e2', to: 'e4', padding: 'p'.repeat(5000) },
    });
    expect(parsed.move).toEqual({ type: 'chess', from: 'e2', to: 'e4' });
  });

  it('a queue join is parsed without the username and rating a client may still send (WS5-22)', () => {
    const parsed = SocketSchemas.join_queue.parse({ gameType: 'checkers', timeControl: 'rapid', rated: false, username: 'Admin', rating: 3000 });
    expect(parsed).toEqual({ gameType: 'checkers', timeControl: 'rapid', rated: false });
  });

  it('a chat line up to the 1000-character ceiling parses; trimming to 200 is the room’s job', () => {
    expect(SocketSchemas.send_chat.parse({ gameId: UNKNOWN_GAME, text: 'y'.repeat(300) }).text).toHaveLength(300);
  });
});
