// The shape of every client payload the server accepts, in one place.
//
// A port of the Render server's `apps/api/src/schemas.ts`, plus `claim_flag`.
// Until Render is retired the two must agree: `schemas.drift.test.ts` fails if
// they part. Reached through the `./schemas` subpath only, never the package
// root, because it carries zod.
//
// Nothing a client sends is trusted until it has passed one of these. Before
// the API had this module the only structural check was the move validator;
// every other field went straight into a Redis key name, a Prisma `where` or a
// config lookup. That is how a bogus `timeControl` could brick two players for
// 24 hours (GX-06) and how one socket could mint unlimited matchmaking queues.
// See project-docs/security-audit-v2.md, Wave 3.
//
// Rules for adding a schema:
//   - Every enum is derived from, or checked against, the shared protocol type,
//     so the two cannot drift. The compile-time checks below fail the build if a
//     game type or time control is added to the protocol and not here.
//   - Objects use zod's default "strip" mode: unknown keys are dropped, so a
//     handler only ever sees the fields named here — never an extra key, and
//     never an object where a string was expected.
//   - Fields the server deliberately ignores (the client's `username` and
//     `rating`) are left out, so they are stripped rather than validated. The
//     server looks both up itself.
import { z } from 'zod';
import { EMOTES } from './sharedTypes';
import type { GameType, TimeControl } from './sharedTypes';

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

/**
 * Game and user ids are `crypto.randomUUID()` / Supabase auth ids. `guid()`,
 * not zod 4's `uuid()`: that one also checks the version and variant digits,
 * which zod 3's never did, so it would reject ids the API has always accepted.
 */
export const Uuid = z.guid();
export const GameTypeSchema = z.enum(ONLINE_GAME_TYPES);
export const TimeControlSchema = z.enum(TIME_CONTROLS);
/** Invites are whole UUIDs (they were 8 hex digits until WS5-30). */
export const InviteId = Uuid;

const Square = z.string().regex(/^[a-h][1-8]$/);

/**
 * A move, by game. The engines still decide legality; these only guarantee
 * they are handed coordinates they can index. Each game's adapter uses its own
 * member as its `actionSchema`.
 */
export const ChessMoveSchema = z.object({
  type:      z.literal('chess'),
  from:      Square,
  to:        Square,
  promotion: z.enum(['queen', 'rook', 'bishop', 'knight']).optional(),
});
export const CheckersMoveSchema = z.object({ type: z.literal('checkers'), from: Square, to: Square });
export const ReversiMoveSchema  = z.object({ type: z.literal('reversi'),  position: Square });

export type ChessMove    = z.infer<typeof ChessMoveSchema>;
export type CheckersMove = z.infer<typeof CheckersMoveSchema>;
export type ReversiMove  = z.infer<typeof ReversiMoveSchema>;

/**
 * Any game's move. `{ type: 'pass' }` is in the protocol type but the server
 * has never accepted it from a client (reversi passes are applied
 * server-side), so it is not listed.
 */
export const MoveSchema = z.discriminatedUnion('type', [ChessMoveSchema, CheckersMoveSchema, ReversiMoveSchema]);

/** New-game options for a game that takes none, which is all three classic games. */
export const NoOptionsSchema = z.object({});
export type NoOptions = z.infer<typeof NoOptionsSchema>;

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
  // New: a client whose opponent's clock has run out says so, and the room
  // checks the claim against its own clock. It replaces the server's 3 s
  // clock-sync loop; a watchdog alarm catches flags when both players are gone.
  claim_flag:     GameIdOnly,

  make_move: z.object({ gameId: Uuid, move: MoveSchema }),
  // Clients cap chat at 200 characters and the handler still truncates to 200,
  // so the bound here is only a ceiling on what gets parsed, not the product
  // limit — a message one emoji over is trimmed, as before, not dropped.
  send_chat:  z.object({ gameId: Uuid, text: z.string().min(1).max(1000) }),
  send_emote: z.object({ gameId: Uuid, emote: z.enum(EMOTES) }),

  create_invite_link: z.object({ gameType: GameTypeSchema, timeControl: TimeControlSchema }),
  accept_invite:      z.object({ inviteId: InviteId }),

  // A Supabase access token is 1–3 KB; the ceiling only bounds parsing.
  reauth: z.object({ token: z.string().min(1).max(8192) }),
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
