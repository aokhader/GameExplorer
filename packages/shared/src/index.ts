// Main entry point for shared package

// Chess
export * from './game-logic/chess';

// Rating utilities
export * from './utils/rating';
// Clock / result helpers (shared by web + mobile play views)
export * from './utils/clock';
// Checkers
export * from './game-logic/checkers';
export * from './game-logic/reversi';

// Socket event protocol
export * from './types/socket.types';