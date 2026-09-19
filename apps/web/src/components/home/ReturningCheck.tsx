'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { hasLocalHistory, hasReturningCookie, markReturning } from '@/lib/returning';

/**
 * Sends a returning player on the landing page to the launcher.
 *
 * The cookie that makes `/` serve the launcher is set by the first game, setup
 * or solve on this browser — but players from before the cookie existed have
 * history and no cookie, a signed-in player on a new browser has neither, and a
 * landing page cached by the router before the cookie was set is still a
 * landing page. Each of those lands here once; the cookie is set and the route
 * re-fetched, which the rewrite now answers with the launcher.
 *
 * Once per mount, so a server that still answered with the landing page could
 * not send this into a loop.
 */
export function ReturningCheck() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || loading) return;
    if (!user && !hasLocalHistory() && !hasReturningCookie()) return;
    done.current = true;
    markReturning();
    router.refresh();
  }, [loading, user, router]);

  return null;
}
