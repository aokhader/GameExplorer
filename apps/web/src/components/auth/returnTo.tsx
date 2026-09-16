'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

/**
 * Where an auth page came from, carried in `?next=`.
 *
 * Only a same-site path is ever returned. `next` arrives from the URL, so a
 * hand-made link could otherwise put `https://…` in there and have us redirect
 * a signed-in user straight off the site — including through `router.replace`,
 * which follows an absolute URL happily. A leading `//` is the same hole
 * spelled differently (`//evil.example` is protocol-relative), so both are
 * rejected in favour of the fallback.
 */
export function useReturnTo(fallback = '/'): string {
  const next = useSearchParams().get('next');
  if (!next || !next.startsWith('/') || next.startsWith('//')) return fallback;
  return next;
}

/** Appends the current location to an auth link, so that page can return here. */
export function authHref(base: string, from: string | null | undefined): string {
  if (!from || from === '/' || !from.startsWith('/')) return base;
  return `${base}?next=${encodeURIComponent(from)}`;
}

/**
 * The way out of a sign-in or sign-up page.
 *
 * Both pages render the global navbar, so home was always one click away — but
 * neither had a way back to the page that sent you there, which is the one a
 * person mid-task actually wants. Falls back to home when nothing sent us.
 *
 * Must be rendered inside a `<Suspense>` boundary: `useSearchParams` requires
 * one in the App Router.
 */
export function ReturnLink({ className }: { className?: string }) {
  const href = useReturnTo();
  return (
    <Link
      href={href}
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
