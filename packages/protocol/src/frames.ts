// The realtime wire format: what a frame looks like, how big it may be, and
// what each close code means. Shared by the Worker, the rooms and both
// clients, so none of them can disagree about it.
//
// Plain constants and types only. This module is reachable from the package
// root, which must stay free of zod and the game engines (see index.ts).

/**
 * The subprotocol every client offers first, and the only one the server ever
 * echoes. Browsers and Node fail the handshake when the echo is missing;
 * Android's client does not check it, so test the echo from a browser or Node.
 */
export const PROTOCOL_VERSION = 'gx.v1';

/**
 * The second subprotocol carries the access token: `gx.bearer.<jwt>`. The
 * token travels in the handshake so it never appears in a URL.
 */
export const BEARER_PROTOCOL_PREFIX = 'gx.bearer.';

/** A frame larger than this closes the socket with `CLOSE_CODES.TOO_BIG`. */
export const MAX_FRAME_BYTES = 16 * 1024;

/** Client → server: an event name and its payload. */
export interface ClientFrame<E extends string = string, D = unknown> {
  e: E;
  d: D;
}

/**
 * Server → client: an event, its payload and the room's sequence number. A
 * client reconnects with the last `s` it saw; one that has fallen behind gets
 * a single snapshot instead of a replay.
 */
export interface ServerFrame<E extends string = string, D = unknown> {
  e: E;
  d: D;
  s: number;
}

/**
 * Close codes. 1000–1015 are the WebSocket standard's; 4000–4999 are ours, and
 * replace socket.io's `active` flag for telling a client whether to reconnect.
 */
export const CLOSE_CODES = {
  /** A normal close, by either side. */
  NORMAL: 1000,
  /**
   * The connection dropped without a close frame. A deploy that resets a busy
   * room and a lost network both arrive as this, never as 1001 or 1012, so it
   * means "reconnect now".
   */
  ABNORMAL: 1006,
  /** A frame over `MAX_FRAME_BYTES`. */
  TOO_BIG: 1009,
  /** The account was deleted while connected. Never reconnect. */
  REVOKED: 4003,
  /** Not this protocol: the subprotocol was missing, or a frame was not a frame. */
  BAD_REQUEST: 4400,
  /**
   * The token was missing, bad or expired. The upgrade is accepted and then
   * closed with this, never refused with HTTP 401, because browsers and Node
   * show a refused handshake only as 1006. Refresh the token once and retry;
   * a second 4401 is final.
   */
  UNAUTHORIZED: 4401,
  /** A daily platform quota is close to its limit. New games reopen tomorrow. */
  CAPACITY: 4503,
} as const;

export type CloseCode = (typeof CLOSE_CODES)[keyof typeof CLOSE_CODES];
