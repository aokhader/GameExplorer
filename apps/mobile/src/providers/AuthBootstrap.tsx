import type { ReactNode } from 'react';
import { useAuth } from '@gameexplorer/client';

/**
 * Mounts the shared `useAuth` hook once at the app root so the auth store is
 * populated (and kept in sync via Supabase's `onAuthStateChange`) for every
 * screen. Screens themselves call `useAuth()` to *read* `user`/`loading`; this
 * component exists only to guarantee a single subscription lives for the whole
 * app session rather than churning as screens mount/unmount.
 */
export function AuthBootstrap({ children }: { children: ReactNode }) {
  useAuth();
  return <>{children}</>;
}
