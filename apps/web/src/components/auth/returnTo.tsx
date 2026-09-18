'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { parentPath, safeReturnPath } from '@/lib/returnPath';

/**
 * A sign-in page carries two different places in its URL:
 *
 * - `next` — where to land once signed in.
 * - `back` — where Back goes if you leave without signing in. It is set only
 *   when `next` is a page a guest cannot open (training, online play, watching
 *   a game, the profile). Sending Back there would bounce straight to sign-in
 *   again, which is the loop this separation fixes.
 *
 * Both are read through `safeReturnPath`, so neither can point off the site or
 * back into the auth pages.
 */

/** Where to land after signing in: `?next=` when it is safe, else `fallback`. */
export function useReturnTo(fallback = '/'): string {
  return safeReturnPath(useSearchParams().get('next')) ?? fallback;
}

/** Appends the current location to an auth link, so that page can return here. */
export function authHref(base: string, from: string | null | undefined): string {
  const path = safeReturnPath(from);
  if (!path || path === '/') return base;
  return `${base}?next=${encodeURIComponent(path)}`;
}

/**
 * Where a page that needs an account sends a guest. After signing in they land
 * on `path`; Back instead goes to the page above it (the game's hub, the Watch
 * list), which a guest can open.
 */
export function signInRequiredHref(path: string): string {
  return `/auth/signin?next=${encodeURIComponent(path)}&back=${encodeURIComponent(parentPath(path))}`;
}

/**
 * The other auth page, keeping this one's `next` and `back`, so switching
 * between Sign in and Sign up does not lose the round trip.
 */
export function useAuthSwitchHref(base: '/auth/signin' | '/auth/signup'): string {
  const params = useSearchParams();
  const carried = new URLSearchParams();
  const next = safeReturnPath(params.get('next'));
  const back = safeReturnPath(params.get('back'));
  if (next) carried.set('next', next);
  if (back) carried.set('back', back);
  const query = carried.toString();
  return query ? `${base}?${query}` : base;
}

// The Navigation API: the one way a page can read which entries of its own
// tab's history are on this site. Typed here because not every TypeScript DOM
// lib has it yet.
interface HistoryEntryLike {
  url: string | null;
}
interface NavigationLike {
  currentEntry: { index: number } | null;
  entries(): HistoryEntryLike[];
}

/**
 * Step back through the tab's own history to the last page before the sign-in
 * flow, the way the browser's Back button would. Skips the auth pages (Sign in
 * and Sign up can follow each other) and `avoid`, a page that would only send
 * a guest back here.
 *
 * False when no such page can be seen: the browser lacks the Navigation API,
 * or the tab opened on this page. `entries()` holds only same-site entries, so
 * this never steps off the site.
 */
function stepBackOutOfAuth(avoid: string | null): boolean {
  const nav = (window as unknown as { navigation?: NavigationLike }).navigation;
  const current = nav?.currentEntry;
  if (!nav || !current) return false;
  const entries = nav.entries();
  for (let i = current.index - 1; i >= 0; i--) {
    const url = entries[i]?.url;
    if (!url) continue;
    const path = new URL(url).pathname;
    if (path === avoid || !safeReturnPath(path)) continue;
    window.history.go(i - current.index);
    return true;
  }
  return false;
}

/**
 * The way out of a sign-in or sign-up page: back to the page you were on.
 *
 * That is the previous page in the tab's history when it can be seen, so
 * leaving from Sign up after switching over from Sign in still returns to where
 * you started. When it cannot (the link was opened in a new tab), the link goes
 * to `back`, then `next`, then home, and replaces the auth page so the
 * browser's own Back does not return to it.
 *
 * Must be rendered inside a `<Suspense>` boundary: `useSearchParams` requires
 * one in the App Router.
 */
export function ReturnLink({ className }: { className?: string }) {
  const params = useSearchParams();
  const next = safeReturnPath(params.get('next'));
  const back = safeReturnPath(params.get('back'));
  const href = back ?? next ?? '/';
  // With `back` set, `next` is a page that needs an account.
  const avoid = back && next ? next.split(/[?#]/)[0] : null;
  return (
    <Link
      href={href}
      replace
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        if (stepBackOutOfAuth(avoid)) e.preventDefault();
      }}
      className={
        className ??
        'inline-flex h-11 items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-fg'
      }
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      Back
    </Link>
  );
}
