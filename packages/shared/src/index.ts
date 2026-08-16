// Main entry point for shared package

// Chess
export * from './game-logic/chess';

// Rating utilities
export * from './utils/rating';
// Clock / result helpers (shared by web + mobile play views)
export * from './utils/clock';
// Seeded RNG for chance-driven games (dice, deck shuffles)
export * from './utils/rng';
// Currency formatting for the property game
export * from './utils/currency';
// Checkers
export * from './game-logic/checkers';
export * from './game-logic/reversi';
// Liquidate — cosmic property-trading game (2–6 players)
export * from './game-logic/liquidate';

// Board animation — what changed between two positions, for both renderers
export * from './board';

// Game review — grading, eval normalisation, and the two engine-neutral adapters
export * from './analysis';

// Socket event protocol
export * from './types/socket.types';

// "How to play" tutorial content (web + mobile)
export * from './constants/tutorials';
// Puzzles — model, engine bindings, solve loop, source and progress helpers
export * from './puzzles';
// Puzzle content (web + mobile) — pure data, see the module's contract note
export * from './constants/puzzles';
// Game catalog (id, players, modes) — see the scope note in the module
export * from './constants/games';

// SFX recipes — one source of truth for web's live synth and the native samples
export * from './audio/recipes';
// First-run tour — the vibe→ELO ladder both platforms' welcome screens use
export * from './constants/onboarding';
// How a game ended, in words — shared by both platforms' history lists
export * from './constants/endReasons';

// Free-tier cost-control limits
export * from './limits';