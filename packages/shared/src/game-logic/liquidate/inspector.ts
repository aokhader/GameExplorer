import {
  LIQUIDATE_UTILITY_MULTIPLIER_BOTH,
  LIQUIDATE_UTILITY_MULTIPLIER_ONE,
  LIQUIDATE_WARP_GATE_RENTS,
} from './economy';
import { LiquidateEngine } from './engine';
import { systemMembers } from './board';
import { MAX_COLONY_LEVEL, isOwnable, type LiquidateGameState } from './types';
import { formatCredits } from '../../utils/currency';

export interface RentRow {
  label: string;
  value: string;
  /** The rung currently in force — the rent this tile would charge right now. */
  active: boolean;
}

export interface InspectorData {
  tileId: number;
  /** Small uppercase line above the name: why this tile is on screen. */
  kicker: string;
  name: string;
  groupLabel: string;
  /** Ownership / availability in a few words. */
  status: string;
  /** `null` for tiles that are not for sale. */
  price: number | null;
  /**
   * System completion for the followed seat, or `null` when not applicable.
   *
   * `held`/`total` are the same numbers `label` and `pct` are built from, kept
   * raw so a caller can render the fraction as its own thing — mobile's sheet
   * shows a `2/3` chip where web shows a bar, and reparsing the sentence to get
   * there would be absurd.
   */
  progress: { label: string; pct: number; held: number; total: number } | null;
  /** One sentence of "why this matters", or `null`. */
  highlight: string | null;
  rent: RentRow[];
}

/**
 * Everything the centre inspector shows about one tile, derived from engine
 * state.
 *
 * Pure and separate from the component so the rent ladder can be reasoned about
 * on its own: the ladder has to agree with `LiquidateEngine.rentFor` exactly, and
 * the one rung that is easy to get wrong is the full-system double — it applies
 * only at colony level 0, so it is a rung of its own rather than a modifier on
 * the rest.
 */
export function buildInspector(
  state: LiquidateGameState,
  tileId: number,
  viewerId: string | null,
  kicker: string,
): InspectorData {
  const tile = LiquidateEngine.board(state)[tileId];
  const owned = state.tiles[tileId];
  const owner = state.players.find((p) => p.id === owned.ownerId) ?? null;

  const base: InspectorData = {
    tileId,
    kicker,
    name: tile.name,
    groupLabel: '',
    status: '',
    price: null,
    progress: null,
    highlight: null,
    rent: [],
  };

  // No group label for the corners and decks: theirs would only ever restate the
  // tile's own name ("Home Station" / "Home station"), so the status line carries
  // the whole explanation on its own.
  if (!isOwnable(tile)) {
    return { ...base, groupLabel: '', status: nonOwnableStatus(state, tileId) };
  }

  // One word for the unclaimed case, not "Unowned · buyable": this reads beside
  // the tile's name as the answer to "who holds this", and the fact that it is
  // unowned is said at more length in the line under it.
  const status = owner
    ? owned.mortgaged
      ? `Held by ${owner.name} · mortgaged`
      : `Held by ${owner.name}`
    : 'Buyable';

  if (tile.kind === 'planet') {
    const members = systemMembers(state.config.mode, tile.system);
    const held = viewerId
      ? members.filter((id) => state.tiles[id].ownerId === viewerId).length
      : 0;
    const full = owner ? LiquidateEngine.ownsFullSystem(state, owner.id, tile.system) : false;

    // Level 0 with the full system is a distinct rung; above level 0 the double
    // does not apply, which is why it is not folded into the colony rows.
    const rent: RentRow[] = [
      { label: 'Base rent', value: formatCredits(tile.rents[0]), active: owned.level === 0 && !full },
      {
        label: 'Full system · no colonies',
        value: formatCredits(tile.rents[0] * 2),
        active: owned.level === 0 && full,
      },
      ...([1, 2, 3, 4] as const).map((lvl) => ({
        label: `${lvl} colon${lvl === 1 ? 'y' : 'ies'}`,
        value: formatCredits(tile.rents[lvl]),
        active: owned.level === lvl,
      })),
      {
        label: 'Megastructure ★',
        value: formatCredits(tile.rents[MAX_COLONY_LEVEL]),
        active: owned.level === MAX_COLONY_LEVEL,
      },
    ];

    return {
      ...base,
      groupLabel: `${cap(tile.system)} system`,
      status,
      price: tile.price,
      progress: {
        label: `You hold ${held} of ${members.length} ${cap(tile.system)}`,
        pct: members.length ? Math.round((held / members.length) * 100) : 0,
        held,
        total: members.length,
      },
      highlight: planetHighlight(state, tileId, viewerId, held, members.length),
      rent,
    };
  }

  if (tile.kind === 'warp-gate') {
    const heldBy = owner
      ? LiquidateEngine.board(state).filter(
          (t) => t.kind === 'warp-gate' && state.tiles[t.id].ownerId === owner.id,
        ).length
      : 0;
    return {
      ...base,
      groupLabel: 'Warp gate',
      status,
      price: tile.price,
      progress: null,
      highlight: 'Rent scales with how many gates the owner holds.',
      rent: LIQUIDATE_WARP_GATE_RENTS.map((value, i) => ({
        label: `${i + 1} gate${i > 0 ? 's' : ''} held`,
        value: formatCredits(value),
        active: heldBy === i + 1,
      })),
    };
  }

  const utilitiesHeld = owner
    ? LiquidateEngine.board(state).filter(
        (t) => t.kind === 'utility' && state.tiles[t.id].ownerId === owner.id,
      ).length
    : 0;
  return {
    ...base,
    groupLabel: 'Utility',
    status,
    price: tile.price,
    progress: null,
    highlight: 'Rent is a multiple of the roll that landed here, not a fixed sum.',
    rent: [
      {
        label: 'One utility held',
        value: `dice × ${LIQUIDATE_UTILITY_MULTIPLIER_ONE}`,
        active: utilitiesHeld === 1,
      },
      {
        label: 'Both utilities held',
        value: `dice × ${LIQUIDATE_UTILITY_MULTIPLIER_BOTH}`,
        active: utilitiesHeld > 1,
      },
    ],
  };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function nonOwnableStatus(state: LiquidateGameState, tileId: number): string {
  const tile = LiquidateEngine.board(state)[tileId];
  switch (tile.kind) {
    case 'home-station':
      return `Stipend ${formatCredits(state.config.stipend)} on passing`;
    case 'impound':
      return 'Held ships wait here';
    case 'contraband-scan':
      return 'Landing here sends you to Impound';
    case 'drift':
      return 'Open space — nothing happens';
    case 'tariff':
      return `Docking charge ${formatCredits(tile.amount)}`;
    default:
      return `Draw from the ${tile.name} deck`;
  }
}

/** The one line worth saying about a planet, given who is looking at it. */
function planetHighlight(
  state: LiquidateGameState,
  tileId: number,
  viewerId: string | null,
  held: number,
  total: number,
): string | null {
  const tile = LiquidateEngine.board(state)[tileId];
  if (tile.kind !== 'planet') return null;
  const owned = state.tiles[tileId];

  if (!owned.ownerId && viewerId && held === total - 1) {
    return 'Claiming this completes the system — bare rent doubles on every tile in it.';
  }
  if (viewerId && owned.ownerId === viewerId && LiquidateEngine.ownsFullSystem(state, viewerId, tile.system)) {
    return owned.level === 0
      ? 'System complete: bare rent is already doubled here. Colonies raise it much further.'
      : `Colony cost ${formatCredits(tile.colonyCost)} per level on this system.`;
  }
  if (owned.ownerId && owned.ownerId !== viewerId) {
    return `Landing here costs ${formatCredits(LiquidateEngine.rentFor(state, tileId, 7))}.`;
  }
  return null;
}
