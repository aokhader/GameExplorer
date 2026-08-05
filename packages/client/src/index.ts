// Shared client layer — Zustand stores + socket/session orchestration consumed
// by apps/web today and apps/mobile (React Native) later. No DOM, no next/*.

export { getApiUrl, setApiUrl } from './config';
export { apiFetch } from './apiFetch';
export { signInWithIdentifier, looksLikeEmail } from './auth';

export { useAuthStore } from './stores/authStore';
export { useGameStore } from './stores/gameStore';
export type { AnyGameState } from './stores/gameStore';
export { useSocketStore } from './stores/socketStore';

export { useAuth } from './hooks/useAuth';
export { useSocket } from './hooks/useSocket';
export { useInvite } from './hooks/useInvite';
export { useGameSession } from './hooks/useGameSession';
export { usePuzzle } from './hooks/usePuzzle';
export type { UsePuzzleOptions, UsePuzzleResult } from './hooks/usePuzzle';
