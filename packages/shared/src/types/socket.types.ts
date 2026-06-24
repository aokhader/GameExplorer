// Socket.io event protocol — shared between API server and web client

export type GameType = 'chess' | 'checkers' | 'reversi';
export type PlayerColor = 'white' | 'black';
export type TimeControl = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'movetime';
export type MultiplayerStatus = 'idle' | 'queued' | 'active' | 'ended';
export type GameResult = 'white_wins' | 'black_wins' | 'draw';

export type EndReason =
  | 'checkmate' | 'stalemate' | 'flag' | 'resign'
  | 'draw_agreement' | 'fifty_move' | 'repetition'
  | 'disconnect' | 'board_full' | 'no_moves';

export type ErrorCode =
  | 'ILLEGAL_MOVE' | 'NOT_YOUR_TURN' | 'GAME_NOT_FOUND'
  | 'ALREADY_IN_GAME' | 'QUEUE_FULL' | 'INVITE_EXPIRED'
  | 'RATE_LIMITED' | 'AUTH_REQUIRED' | 'ABORT_NOT_ALLOWED';

// A game may be aborted (no rating change) only while fewer than this many
// moves have been played. Shared so client and server agree on the threshold.
export const ABORT_MOVE_LIMIT = 5;

// In-game emotes/reactions. The allowed set is shared so the server can reject
// anything outside it (clients never send arbitrary text through this channel).
export const EMOTES = ['👍', '👏', '😂', '😮', '😢', '🤝', '🎉', '🤯'] as const;
export type Emote = (typeof EMOTES)[number];

export interface UserSummary {
  userId:    string;
  username:  string;
  rating:    number;
  avatarUrl?: string;
}

export interface ClockSnapshot {
  white_ms:     number;
  black_ms:     number;
  active_color: PlayerColor;
}

export interface TimeControlConfig {
  id:           TimeControl;
  label:        string;
  description:  string;
  initialMs:    number;
  incrementMs:  number;
  isMoveTimer:  boolean;
  moveTimerMs?: number;
}

export type MovePayload =
  | { type: 'chess';    from: string; to: string; promotion?: string }
  | { type: 'checkers'; from: string; to: string }
  | { type: 'reversi';  position: string }
  | { type: 'pass' };

export interface RatingInfo {
  ratingBefore: number;
  ratingAfter:  number;
  ratingDelta:  number;
}

// ── Client → Server ───────────────────────────────────────────────────────────

export interface ClientToServerEvents {
  join_queue:         (data: { gameType: GameType; timeControl: TimeControl; rated: boolean; username: string; rating: number }) => void;
  leave_queue:        (data: { gameType: GameType; timeControl: TimeControl; rated: boolean }) => void;
  join_game:          (data: { gameId: string }) => void;
  make_move:          (data: { gameId: string; move: MovePayload }) => void;
  offer_draw:         (data: { gameId: string }) => void;
  accept_draw:        (data: { gameId: string }) => void;
  decline_draw:       (data: { gameId: string }) => void;
  resign:             (data: { gameId: string }) => void;
  abort_game:         (data: { gameId: string }) => void;
  send_chat:          (data: { gameId: string; text: string }) => void;
  send_emote:         (data: { gameId: string; emote: Emote }) => void;
  invite_friend:      (data: { friendId: string; gameType: GameType; timeControl: TimeControl }) => void;
  create_invite_link: (data: { gameType: GameType; timeControl: TimeControl; username: string; rating: number }) => void;
  accept_invite:      (data: { inviteId: string; username: string; rating: number }) => void;
  decline_invite:     (data: { inviteId: string }) => void;
  spectate:           (data: { gameId: string }) => void;
  leave_spectate:     (data: { gameId: string }) => void;
}

// ── Server → Client ───────────────────────────────────────────────────────────

export interface ServerToClientEvents {
  queue_joined:          (data: { estimatedWait: number }) => void;
  match_found:           (data: { gameId: string; opponent: UserSummary; color: PlayerColor; timeControlConfig: TimeControlConfig }) => void;
  game_started:          (data: { gameId: string; gameType: GameType; initialState: unknown; myColor: PlayerColor; opponent: UserSummary; clocks: ClockSnapshot; timeControlConfig: TimeControlConfig }) => void;
  move_made:             (data: { gameId: string; move: MovePayload; newState: unknown; clocks: ClockSnapshot }) => void;
  draw_offered:          (data: { gameId: string }) => void;
  draw_declined:         (data: { gameId: string }) => void;
  game_ended:            (data: { gameId: string; result: GameResult; reason: EndReason; white: RatingInfo; black: RatingInfo }) => void;
  game_aborted:          (data: { gameId: string }) => void;
  clock_sync:            (data: { gameId: string; clocks: ClockSnapshot }) => void;
  chat_message:          (data: { gameId: string; userId: string; username: string; text: string; createdAt: string }) => void;
  emote_received:        (data: { gameId: string; userId: string; username: string; emote: Emote }) => void;
  opponent_disconnected: (data: { gameId: string; graceMs: number }) => void;
  opponent_reconnected:  (data: { gameId: string }) => void;
  game_invite:           (data: { inviteId: string; from: UserSummary; gameType: GameType; timeControl: TimeControl }) => void;
  invite_link_created:   (data: { inviteId: string; url: string }) => void;
  error:                 (data: { code: ErrorCode; message: string }) => void;
}
