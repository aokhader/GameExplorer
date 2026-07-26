/**
 * Liquidate board layouts — **original tile sets authored for this project.**
 *
 * Deliberately *not* the classic 40-space arrangement: the full board is a
 * **44-tile** loop (a 12×12 perimeter) and the quick board is a **28-tile** loop
 * (an 8×8 perimeter), each with its own system order and corner set. Tile
 * definitions are frozen static data — ownership lives in game state.
 */

import {
  LIQUIDATE_UTILITY_PRICE,
  LIQUIDATE_WARP_GATE_PRICE,
  colonyCostFor,
  rentTableFor,
} from './economy';
import type { LiquidateTile, PlanetTile, StarSystem } from './types';

/** Build a planet tile, deriving colony cost and the rent table from the economy. */
function planet(id: number, name: string, system: StarSystem, price: number): PlanetTile {
  return {
    kind: 'planet',
    id,
    name,
    system,
    price,
    colonyCost: colonyCostFor(system),
    rents: rentTableFor(price),
  };
}

function gate(id: number, name: string): LiquidateTile {
  return { kind: 'warp-gate', id, name, price: LIQUIDATE_WARP_GATE_PRICE };
}

function utility(id: number, name: string): LiquidateTile {
  return { kind: 'utility', id, name, price: LIQUIDATE_UTILITY_PRICE };
}

// ---------------------------------------------------------------------------
// Full board — 44 tiles, corners at 0 / 11 / 22 / 33
// ---------------------------------------------------------------------------

const FULL_BOARD: readonly LiquidateTile[] = [
  { kind: 'home-station', id: 0, name: 'Home Station' },
  // — side one —
  planet(1, 'Cinder', 'ember', 70),
  { kind: 'anomaly', id: 2, name: 'Anomaly' },
  planet(3, 'Ashfall', 'ember', 70),
  planet(4, 'Emberlight', 'ember', 90),
  gate(5, 'Helix Gate'),
  planet(6, 'Oxide', 'rust', 110),
  { kind: 'federation', id: 7, name: 'Federation' },
  planet(8, 'Redmoor', 'rust', 110),
  planet(9, 'Rustveil', 'rust', 130),
  { kind: 'tariff', id: 10, name: 'Docking Fee', amount: 200 },

  { kind: 'impound', id: 11, name: 'Impound' },
  // — side two —
  planet(12, 'Sunmote', 'amber', 150),
  { kind: 'federation', id: 13, name: 'Federation' },
  planet(14, 'Amberdrift', 'amber', 150),
  planet(15, 'Goldhaven', 'amber', 170),
  gate(16, 'Meridian Gate'),
  planet(17, 'Fernwake', 'verdant', 190),
  utility(18, 'Power Grid'),
  planet(19, 'Verdance', 'verdant', 190),
  planet(20, 'Mosshollow', 'verdant', 210),
  { kind: 'anomaly', id: 21, name: 'Anomaly' },

  { kind: 'drift', id: 22, name: 'Deep-Space Drift' },
  // — side three —
  planet(23, 'Tidal', 'azure', 230),
  { kind: 'anomaly', id: 24, name: 'Anomaly' },
  planet(25, 'Azurine', 'azure', 230),
  planet(26, 'Bluereach', 'azure', 250),
  gate(27, 'Vector Gate'),
  planet(28, 'Duskmere', 'violet', 270),
  { kind: 'federation', id: 29, name: 'Federation' },
  planet(30, 'Violetta', 'violet', 270),
  planet(31, 'Nightbloom', 'violet', 290),
  utility(32, 'Fuel Refinery'),

  { kind: 'contraband-scan', id: 33, name: 'Contraband Scan' },
  // — side four —
  planet(34, 'Roseglass', 'crimson', 310),
  { kind: 'federation', id: 35, name: 'Federation' },
  planet(36, 'Crimsonfall', 'crimson', 310),
  planet(37, 'Vermil', 'crimson', 330),
  gate(38, 'Zenith Gate'),
  planet(39, 'Gilded Reach', 'aurum', 370),
  { kind: 'anomaly', id: 40, name: 'Anomaly' },
  { kind: 'tariff', id: 41, name: 'Customs Tariff', amount: 100 },
  planet(42, 'Aurelia', 'aurum', 370),
  planet(43, 'Solthrone', 'aurum', 420),
];

// ---------------------------------------------------------------------------
// Quick board — 28 tiles, corners at 0 / 7 / 14 / 21, four systems
// ---------------------------------------------------------------------------

const QUICK_BOARD: readonly LiquidateTile[] = [
  { kind: 'home-station', id: 0, name: 'Home Station' },
  planet(1, 'Cinder', 'ember', 70),
  planet(2, 'Ashfall', 'ember', 70),
  { kind: 'anomaly', id: 3, name: 'Anomaly' },
  planet(4, 'Emberlight', 'ember', 90),
  gate(5, 'Helix Gate'),
  { kind: 'federation', id: 6, name: 'Federation' },

  { kind: 'impound', id: 7, name: 'Impound' },
  planet(8, 'Sunmote', 'amber', 150),
  utility(9, 'Power Grid'),
  planet(10, 'Amberdrift', 'amber', 150),
  planet(11, 'Goldhaven', 'amber', 170),
  gate(12, 'Meridian Gate'),
  { kind: 'tariff', id: 13, name: 'Docking Fee', amount: 200 },

  { kind: 'drift', id: 14, name: 'Deep-Space Drift' },
  planet(15, 'Tidal', 'azure', 230),
  { kind: 'anomaly', id: 16, name: 'Anomaly' },
  planet(17, 'Azurine', 'azure', 230),
  planet(18, 'Bluereach', 'azure', 250),
  gate(19, 'Vector Gate'),
  { kind: 'federation', id: 20, name: 'Federation' },

  { kind: 'contraband-scan', id: 21, name: 'Contraband Scan' },
  planet(22, 'Gilded Reach', 'aurum', 370),
  utility(23, 'Fuel Refinery'),
  planet(24, 'Aurelia', 'aurum', 370),
  planet(25, 'Solthrone', 'aurum', 420),
  gate(26, 'Zenith Gate'),
  { kind: 'tariff', id: 27, name: 'Customs Tariff', amount: 100 },
];

/** The board for a given mode. */
export function getBoard(mode: 'full' | 'quick'): readonly LiquidateTile[] {
  return mode === 'quick' ? QUICK_BOARD : FULL_BOARD;
}

/** Tile index of the impound corner for a mode (target of Contraband Scan). */
export function impoundTileIndex(mode: 'full' | 'quick'): number {
  const board = getBoard(mode);
  const index = board.findIndex((t) => t.kind === 'impound');
  /* istanbul ignore next -- both layouts define an impound corner */
  if (index < 0) throw new Error('board has no impound tile');
  return index;
}

/** Every planet index belonging to a star system, for full-set checks. */
export function systemMembers(mode: 'full' | 'quick', system: StarSystem): number[] {
  return getBoard(mode)
    .filter((t): t is PlanetTile => t.kind === 'planet' && t.system === system)
    .map((t) => t.id);
}
