/**
 * Presentation logic: everything a Liquidate UI needs to derive from state that
 * is *not* a rule.
 *
 * This is deliberately separate from the components. Deciding what the one big
 * button does, which shortcuts are reachable, and which view has to be on screen
 * is the highest-risk logic in a phone port — a seven-phase game where the
 * acting seat is not always the current seat — and keeping it pure means it can
 * be table-tested against the real engine instead of being verified by tapping
 * through a build.
 *
 * The invariant that makes it safe: **every action returned from here is one the
 * engine would accept right now**, which `presentation.test.ts` asserts against
 * `getLegalActions` rather than against a copy of the phase rules.
 */

import { LiquidateEngine } from './engine';
import { MAX_TRADE_PROPOSALS_PER_TURN } from './economy';
import { formatCredits } from '../../utils/currency';
import { systemMembers } from './board';
import {
  isOwnable,
  type LiquidateAction,
  type LiquidateGameState,
  type LiquidateTile,
} from './types';

// ---------------------------------------------------------------------------
// Tile presentation
// ---------------------------------------------------------------------------

/** Human-readable name for a tile's group, for the inspector and legend. */
export function groupLabel(tile: LiquidateTile): string {
  if (tile.kind === 'planet') {
    return `${tile.system.charAt(0).toUpperCase()}${tile.system.slice(1)} system`;
  }
  if (tile.kind === 'warp-gate') return 'Warp gate';
  if (tile.kind === 'utility') return 'Utility';
  if (tile.kind === 'anomaly') return 'Anomaly deck';
  if (tile.kind === 'federation') return 'Federation deck';
  if (tile.kind === 'tariff') return 'Tariff';
  return 'Station';
}

/** True when the tile takes a colour bar across its head (properties only). */
export function hasColorBar(tile: LiquidateTile): boolean {
  return isOwnable(tile);
}

/**
 * Per-cell metrics for the two board sizes.
 *
 * The 44-tile loop packs 12 tiles a side against the 28-tile loop's 8, so every
 * tile is ~40% narrower at the same board width. Rather than scale one set of
 * numbers, each board gets its own: the dense board drops the bar height and
 * padding first, because those cost the label its second line.
 */
export interface TileMetrics {
  /** Height of the system colour bar, in px. */
  barH: number;
  /** Padding inside the tile face, in px. */
  pad: number;
  glyphF: number;
  nameF: number;
  priceF: number;
  /** Edge of one player token, in px. */
  tokenW: number;
  /** Hide the price line below this cell size — the name has to survive first. */
  showPrice: boolean;
  /**
   * Show the corner/tariff note ("Just visiting", "Pay ₡200").
   *
   * Needs MORE room than the price: those tiles carry the longest names on the
   * board ("Contraband Scan", "Deep-Space Drift"), so the note and a two-line
   * name are competing for the same few pixels — and when both render, they
   * collide. The note goes first; the inspector still has it.
   */
  showSub: boolean;
  showGlyph: boolean;
  /** Hide the owner swatch + pips row; the base stripe still shows ownership. */
  showOwnerRow: boolean;
  /**
   * Lines the name may wrap to. Drops to one on a 44-tile board at phone width,
   * where two lines do not fit the cell and would be clipped mid-word — a
   * truncated single line at least ends cleanly, and the inspector has the rest.
   */
  nameLines: 1 | 2;
}

export function tileMetrics(cellPx: number, perSide: number): TileMetrics {
  const clamp = (min: number, v: number, max: number) => Math.max(min, Math.min(max, v));
  const dense = perSide >= 12;
  return {
    barH: clamp(4, cellPx * (dense ? 0.1 : 0.13), 11),
    pad: clamp(3, cellPx * (dense ? 0.08 : 0.1), 8),
    glyphF: clamp(9, cellPx * (dense ? 0.2 : 0.24), 17),
    // 8.5px is the floor at which a two-line name is still readable. The 44-tile
    // board hits it on any normal viewport — a 12-per-side ring cannot be given
    // bigger cells without breaking `BoardFrame`'s fit-the-viewport contract —
    // so the dense board leans on the centre inspector for anything longer.
    nameF: clamp(8.5, cellPx * (dense ? 0.145 : 0.15), 12),
    priceF: clamp(7, cellPx * (dense ? 0.12 : 0.13), 10.5),
    tokenW: clamp(7, cellPx * (dense ? 0.2 : 0.22), 14),
    showPrice: cellPx >= (dense ? 52 : 46),
    showSub: cellPx >= (dense ? 64 : 72),
    showGlyph: cellPx >= 34,
    showOwnerRow: cellPx >= (dense ? 56 : 50),
    nameLines: cellPx >= 30 ? 2 : 1,
  };
}

/**
 * A short code for a tile, for cells too narrow to carry a name.
 *
 * The dense 44-tile board at phone width gives each tile ~23pt, where even one
 * line of the real name clips mid-word. Two letters end cleanly and stay
 * matchable against the legend and the inspector.
 */
export function tileCode(tile: LiquidateTile): string {
  const words = tile.name.split(/[\s-]+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0]![0]! + words[1]![0]!).toUpperCase();
  }
  return tile.name.slice(0, 2).replace(/^./, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Turn tracker
// ---------------------------------------------------------------------------

type StepState = 'done' | 'active' | 'todo';

export interface TurnStep {
  label: string;
  detail: string;
  state: StepState;
}

/**
 * Where the current turn has got to: Roll → Move → Decide → End.
 *
 * A turn here is several beats long and the middle ones resolve on their own
 * (the roll moves you; the landing may charge rent), so without this the player
 * only ever sees the *next* button and has to infer what just happened. The
 * tracker turns that into something readable: what is done, what is being asked
 * now, and what is still to come.
 */
export function turnSteps(state: LiquidateGameState): TurnStep[] {
  const actingId = LiquidateEngine.actingPlayerId(state);
  const actor = state.players.find((p) => p.id === actingId) ?? null;
  const board = LiquidateEngine.board(state);

  // `awaiting-roll` is the only phase before the roll; every other phase in a
  // turn happens once movement has already resolved.
  const preRoll = state.phase === 'awaiting-roll';
  const deciding =
    state.phase === 'buy-decision' ||
    state.phase === 'auction' ||
    state.phase === 'settling-debt' ||
    state.phase === 'trade-review';
  const ending = state.phase === 'turn-end';

  return [
    {
      label: 'Roll',
      detail: !preRoll && state.dice ? `${state.dice[0]} + ${state.dice[1]}` : '',
      state: preRoll ? 'active' : 'done',
    },
    {
      label: 'Move',
      detail: !preRoll && actor ? `→ ${board[actor.tile]?.name ?? ''}` : '',
      state: preRoll ? 'todo' : 'done',
    },
    {
      label: 'Decide',
      detail: deciding ? decideDetail(state) : preRoll ? '' : 'Nothing to settle',
      state: deciding ? 'active' : preRoll ? 'todo' : 'done',
    },
    {
      label: 'End',
      detail: ending ? 'Ready' : '',
      state: ending ? 'active' : 'todo',
    },
  ];
}

function decideDetail(state: LiquidateGameState): string {
  switch (state.phase) {
    case 'buy-decision':
      return 'Buy or auction';
    case 'auction':
      return 'Bidding open';
    case 'settling-debt':
      return `Owes ${formatCredits(state.pendingDebt?.amount ?? 0)}`;
    default:
      return 'Trade offered';
  }
}

// ---------------------------------------------------------------------------
// The primary call to action
// ---------------------------------------------------------------------------

export interface PrimaryAction {
  action: LiquidateAction;
  /** The button's headline. */
  label: string;
  /** The smaller line under it — why this is the move. */
  sub: string;
  /** Right-aligned figure on the button, when the action costs something. */
  right?: string;
  tone: 'accent' | 'danger';
}

/**
 * The one big button, for whichever seat this device is playing.
 *
 * `null` means there is nothing for the device to press — either a bot is
 * thinking, or the phase's decision is made somewhere other than a single
 * button (an auction's bid stepper, a debt's raise-funds list). Callers render
 * a disabled CTA in that case rather than hiding it, so the dock does not jump.
 */
export function primaryAction(
  state: LiquidateGameState,
  deviceIds: readonly string[],
): PrimaryAction | null {
  if (state.isGameOver) return null;

  const actorId = LiquidateEngine.actingPlayerId(state);
  if (actorId === null || !deviceIds.includes(actorId)) return null;

  const actor = state.players.find((p) => p.id === actorId);
  if (!actor) return null;

  switch (state.phase) {
    case 'awaiting-roll': {
      if (actor.inImpound) {
        return {
          action: { type: 'roll' },
          label: 'Roll for doubles',
          sub: `Held ${actor.impoundTurns} of ${MAX_IMPOUND_DISPLAY} — doubles frees your ship`,
          tone: 'accent',
        };
      }
      if (state.doublesCount > 0) {
        return {
          action: { type: 'roll' },
          label: 'Roll again',
          sub: 'Doubles — you go again',
          tone: 'accent',
        };
      }
      return {
        action: { type: 'roll' },
        label: 'Roll dice',
        sub: 'Move around the loop',
        tone: 'accent',
      };
    }

    case 'buy-decision': {
      const tile = LiquidateEngine.board(state)[state.pendingPurchase!];
      if (!tile || !isOwnable(tile)) return null;

      if (actor.credits >= tile.price) {
        return {
          action: { type: 'buy' },
          label: `Buy ${tile.name}`,
          sub: buySubtitle(state, tile, actor.id),
          right: formatCredits(tile.price),
          tone: 'accent',
        };
      }
      return {
        action: { type: 'decline' },
        label: 'Send to auction',
        sub: `Only ${formatCredits(actor.credits)} on hand`,
        tone: 'accent',
      };
    }

    case 'trade-review': {
      const from = state.players.find((p) => p.id === state.pendingTrade?.fromId);
      return {
        action: { type: 'respond-trade', accept: true },
        label: 'Accept offer',
        sub: from ? `From ${from.name}` : 'Take the deal',
        tone: 'accent',
      };
    }

    case 'settling-debt': {
      // The raise-funds list IS the action while anything can still be sold or
      // pledged. Folding only becomes the headline once nothing else is legal —
      // which is exactly when the engine stops offering anything but bankruptcy.
      const legal = LiquidateEngine.getLegalActions(state);
      const canRaise = legal.some(
        (a) => a.type === 'mortgage' || a.type === 'sell-building',
      );
      if (canRaise) return null;

      const owed = state.pendingDebt?.amount ?? 0;
      return {
        action: { type: 'declare-bankruptcy' },
        label: 'Fold',
        sub: `Nothing left to raise ${formatCredits(owed)}`,
        tone: 'danger',
      };
    }

    case 'turn-end':
      return {
        action: { type: 'end-turn' },
        label: 'End turn',
        sub: 'Pass play to the next seat',
        tone: 'accent',
      };

    // An auction's decision is the bid stepper in its own view, not one button.
    default:
      return null;
  }
}

/** Kept local so the CTA copy does not have to import the impound cap's name. */
const MAX_IMPOUND_DISPLAY = 3;

function buySubtitle(
  state: LiquidateGameState,
  tile: LiquidateTile,
  buyerId: string,
): string {
  if (tile.kind === 'planet') {
    const members = systemMembers(state.config.mode, tile.system);
    const held = members.filter((id) => state.tiles[id].ownerId === buyerId).length;
    if (held === members.length - 1) {
      return `Completes the ${tile.system} system`;
    }
  }
  return groupLabel(tile);
}

// ---------------------------------------------------------------------------
// The action dock
// ---------------------------------------------------------------------------

export type DockSlotId = 'manage' | 'trade' | 'standings' | 'board' | 'auction';

export interface DockSlot {
  id: DockSlotId;
  enabled: boolean;
  /** Why it is unavailable, for the disabled state's hint. */
  reason?: string;
}

/**
 * The four dock shortcuts, in order.
 *
 * The grid is fixed at four so the dock never reflows under the thumb; only the
 * FIRST slot is contextual. It carries Manage normally and the live Auction
 * while one is running — which costs nothing, because management actions are not
 * legal during an auction anyway, so Manage would be a dead button exactly when
 * Auction needs the space. Standings and Board are always reachable: they are
 * read-only, and a player locked out of them mid-auction has no way to check
 * what they are bidding against.
 */
export function dockSlots(
  state: LiquidateGameState,
  deviceIds: readonly string[],
): [DockSlot, DockSlot, DockSlot, DockSlot] {
  const first: DockSlot =
    state.phase === 'auction'
      ? { id: 'auction', enabled: true }
      : manageSlot(state, deviceIds);

  return [first, tradeSlot(state, deviceIds), { id: 'standings', enabled: true }, { id: 'board', enabled: true }];
}

function manageSlot(state: LiquidateGameState, deviceIds: readonly string[]): DockSlot {
  const actorId = LiquidateEngine.actingPlayerId(state);
  if (actorId === null || !deviceIds.includes(actorId)) {
    return { id: 'manage', enabled: false, reason: 'Only on your own turn' };
  }
  const legal = LiquidateEngine.getLegalActions(state);
  const canManage = legal.some(
    (a) =>
      a.type === 'build' ||
      a.type === 'sell-building' ||
      a.type === 'mortgage' ||
      a.type === 'unmortgage',
  );
  return canManage
    ? { id: 'manage', enabled: true }
    : { id: 'manage', enabled: false, reason: 'Nothing to manage yet' };
}

/**
 * Trade is gated by the engine's own rule, not by the legal-action list:
 * `propose-trade` takes a payload the engine cannot enumerate, so it never
 * appears in `getLegalActions`. The conditions below mirror `proposeTrade`'s
 * guards exactly — including that an offer comes from the CURRENT seat, which
 * during an auction or a debt is not the acting one.
 */
function tradeSlot(state: LiquidateGameState, deviceIds: readonly string[]): DockSlot {
  if (state.phase !== 'awaiting-roll' && state.phase !== 'turn-end') {
    return { id: 'trade', enabled: false, reason: 'Only on your own turn' };
  }
  const current = state.players[state.currentPlayerIndex];
  if (!current || !deviceIds.includes(current.id)) {
    return { id: 'trade', enabled: false, reason: 'Only on your own turn' };
  }
  if (state.tradesProposedThisTurn >= MAX_TRADE_PROPOSALS_PER_TURN) {
    return { id: 'trade', enabled: false, reason: 'No more offers this turn' };
  }
  const partners = state.players.filter((p) => p.id !== current.id && !p.bankrupt);
  if (partners.length === 0) {
    return { id: 'trade', enabled: false, reason: 'No one left to trade with' };
  }
  return { id: 'trade', enabled: true };
}

// ---------------------------------------------------------------------------
// Which view the game demands
// ---------------------------------------------------------------------------

export type FocusView = 'auction' | 'trade-review' | 'debt' | null;

/**
 * The view the game *insists* on, overriding whatever the player last opened.
 *
 * Derived on every render rather than pushed on a phase change, so it cannot
 * desync: an auction that settles between frames simply stops being demanded,
 * and the shell falls back to the player's own choice.
 *
 * An auction opens for spectators too — it runs many rounds and is the one
 * phase where watching is the point. The blocking two-party phases do not:
 * a bot settling a debt is a handful of sub-200ms actions, and snapping a
 * read-only view open and shut again reads as a glitch rather than as news.
 */
export function focusView(
  state: LiquidateGameState,
  deviceIds: readonly string[],
): FocusView {
  if (state.isGameOver) return null;
  if (state.phase === 'auction') return 'auction';

  const actorId = LiquidateEngine.actingPlayerId(state);
  if (actorId === null || !deviceIds.includes(actorId)) return null;

  if (state.phase === 'trade-review') return 'trade-review';
  if (state.phase === 'settling-debt') return 'debt';
  return null;
}

// ---------------------------------------------------------------------------
// Auction history
// ---------------------------------------------------------------------------

export interface BidHistoryRow {
  playerId: string | null;
  name: string;
  /** `null` for a pass. */
  amount: number | null;
  passed: boolean;
}

/**
 * The current auction's bids, newest first.
 *
 * `AuctionState` carries only the standing high bid, so the running history has
 * to be read back out of the log. Two traps, both load-bearing:
 *
 *  - the window starts at the LAST "it goes to auction" line, so a previous
 *    auction on the same tile cannot leak into this one;
 *  - the patterns are anchored on `$`, because the opening line itself ends
 *    "…passes on Bluereach — it goes to auction" and an unanchored `/ passes/`
 *    would count it as a bidder passing.
 */
export function bidHistory(state: LiquidateGameState): BidHistoryRow[] {
  if (!state.pendingAuction) return [];

  let start = -1;
  for (let i = state.log.length - 1; i >= 0; i--) {
    if (/ — it goes to auction$/.test(state.log[i]!.message)) {
      start = i;
      break;
    }
  }
  if (start === -1) return [];

  const rows: BidHistoryRow[] = [];
  for (let i = start + 1; i < state.log.length; i++) {
    const entry = state.log[i]!;
    const name = state.players.find((p) => p.id === entry.playerId)?.name ?? '';

    const bid = / bids (\d+)$/.exec(entry.message);
    if (bid) {
      rows.push({ playerId: entry.playerId, name, amount: Number(bid[1]), passed: false });
      continue;
    }
    if (/ passes$/.test(entry.message)) {
      rows.push({ playerId: entry.playerId, name, amount: null, passed: true });
    }
  }

  return rows.reverse();
}
