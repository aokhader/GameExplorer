import type { useGameSession } from '@finesse/client';

/**
 * The online session view-model, exactly as `packages/client` hands it over.
 *
 * Nothing in this folder redefines the shape: the whole point of Phase 4 is that
 * the multiplayer loop — matchmaking, invites, the server-authoritative clock,
 * chat and the game actions — is the same code web already runs, and mobile only
 * supplies markup. Deriving the type instead of restating it means a change to
 * the hook is a compile error here rather than a silent drift.
 */
export type GameSession = ReturnType<typeof useGameSession>;
