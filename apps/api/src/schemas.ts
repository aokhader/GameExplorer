// The shape of every client payload the API accepts, in one place.
//
// Nothing a client sends is trusted until it has passed one of these. Before
// this module existed the only structural check in the API was the move
// validator; every other field went straight into a Redis key name, a Prisma
// `where` or a config lookup. That is how a bogus `timeControl` could brick two
// players for 24 hours (GX-06) and how one socket could mint unlimited
// matchmaking queues. See project-docs/security-audit-v2.md, Wave 3.
//
// Rules for adding a schema:
//   - Every enum is derived from, or checked against, the shared protocol type,
//     so the two cannot drift. The compile-time checks below fail the build if a
//     game type or time control is added to the protocol and not here.
//   - Objects use zod's default "strip" mode: unknown keys are dropped, so a
//     handler only ever sees the fields named here — never an extra key, and
//     never an object where a string was expected (Prisma reads an object in a
//     scalar position as a filter operator).
//   - Fields the server deliberately ignores (the client's `username` and
//     `rating`) are left out, so they are stripped rather than validated. The
//     server looks both up itself; see persistenceService.
import { z } from 'zod';
import { EMOTES } from '@gameexplorer/shared';
import type { GameType, TimeControl } from '@gameexplorer/shared';

// ── Enums, checked against the protocol types ─────────────────────────────────

export const ONLINE_GAME_TYPES = ['chess', 'checkers', 'reversi'] as const satisfies readonly GameType[];
export const TIME_CONTROLS = ['bullet', 'blitz', 'rapid', 'classical', 'movetime'] as const satisfies readonly TimeControl[];

// `satisfies` above proves each list is a subset of its type. These prove the
// other direction: a member missing from the list is a type error here.
type Unlisted<T, L extends readonly unknown[]> = Exclude<T, L[number]>;
const gameTypesComplete: [Unlisted<GameType, typeof ONLINE_GAME_TYPES>] extends [never] ? true : never = true;
const timeControlsComplete: [Unlisted<TimeControl, typeof TIME_CONTROLS>] extends [never] ? true : never = true;
void gameTypesComplete; void timeControlsComplete;

// ── Primitives ────────────────────────────────────────────────────────────────

/** Game and user ids are `crypto.randomUUID()` / Supabase auth ids. */
export const Uuid = z.string().uuid();
export const GameTypeSchema = z.enum(ONLINE_GAME_TYPES);
export const TimeControlSchema = z.enum(TIME_CONTROLS);
/** `inviteService.createInvite` issues the first 8 hex digits of a UUID. */
export const InviteId = z.string().regex(/^[0-9a-f]{8}$/);

const Square = z.string().regex(/^[a-h][1-8]$/);

/**
 * A move, by game. The engines still decide legality; this only guarantees
 * they are handed coordinates they can index. `{ type: 'pass' }` is in the
 * protocol type but the server has never accepted it from a client (reversi
 * passes are applied server-side), so it is not listed.
 */
export const MoveSchema = z.discriminatedUnion('type', [
  z.object({
    type:      z.literal('chess'),
    from:      Square,
    to:        Square,
    promotion: z.enum(['queen', 'rook', 'bishop', 'knight']).optional(),
  }),
  z.object({ type: z.literal('checkers'), from: Square, to: Square }),
  z.object({ type: z.literal('reversi'),  position: Square }),
]);

// ── Socket events ─────────────────────────────────────────────────────────────

const GameIdOnly = z.object({ gameId: Uuid });

export const SocketSchemas = {
  join_queue:  z.object({ gameType: GameTypeSchema, timeControl: TimeControlSchema, rated: z.boolean() }),
  leave_queue: z.object({ gameType: GameTypeSchema, timeControl: TimeControlSchema, rated: z.boolean() }),

  join_game:      GameIdOnly,
  resign:         GameIdOnly,
  abort_game:     GameIdOnly,
  offer_draw:     GameIdOnly,
  accept_draw:    GameIdOnly,
  decline_draw:   GameIdOnly,
  spectate:       GameIdOnly,
  leave_spectate: GameIdOnly,

  make_move: z.object({ gameId: Uuid, move: MoveSchema }),
  // Clients cap chat at 200 characters and the handler still truncates to 200,
  // so the bound here is only a ceiling on what gets parsed, not the product
  // limit — a message one emoji over is trimmed, as before, not dropped.
  send_chat:  z.object({ gameId: Uuid, text: z.string().min(1).max(1000) }),
  send_emote: z.object({ gameId: Uuid, emote: z.enum(EMOTES) }),

  create_invite_link: z.object({ gameType: GameTypeSchema, timeControl: TimeControlSchema }),
  accept_invite:      z.object({ inviteId: InviteId }),
};

export type SocketEvent = keyof typeof SocketSchemas;
export type SocketPayload<E extends SocketEvent> = z.infer<(typeof SocketSchemas)[E]>;

// ── REST ──────────────────────────────────────────────────────────────────────

export const REPORT_REASONS = ['harassment', 'cheating', 'spam', 'offensive_language', 'other'] as const;

// Both clients send `null` for an absent optional field as well as leaving it
// out, so optional body fields accept either.
export const RestSchemas = {
  friendRequestBody: z.object({ targetUserId: Uuid }),
  friendIdParams:    z.object({ id: z.coerce.number().int().positive().max(2_147_483_647) }),
  friendRespondBody: z.object({ action: z.enum(['accept', 'reject']) }),

  blockBody: z.object({
    targetUserId:   Uuid,
    // Display-only; the opponent's name as the client showed it.
    targetUsername: z.string().max(64).nullish(),
  }),
  targetUserParams: z.object({ targetUserId: Uuid }),

  reportBody: z.object({
    targetUserId: Uuid,
    reason:       z.enum(REPORT_REASONS),
    // Both clients cap the box at 1000 and the controller truncates to 1000.
    // As with chat, the schema bounds parsing rather than rejecting a report.
    context:      z.string().max(4000).nullish(),
    gameId:       Uuid.nullish(),
  }),

  gameIdParams: z.object({ gameId: Uuid }),
};
