'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useRef, useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePlayHref } from '@/hooks/usePlayHref';
import { authHref, useAuthSwitchHref } from '@/components/auth/returnTo';
import { isAuthPath } from '@/lib/returnPath';
import { isImmersiveGameRoute } from '@/lib/routes';
import { markReturning } from '@/lib/returning';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from '@gameexplorer/ui';

/**
 * The web app's navigation: **Home · Play · You**, the model native has always
 * had (`project-docs/ux-fix-ideas.md` §3.1), with Learn and Watch beside it.
 *
 * It used to list the five games plus Home and Watch, so every journey crossed
 * a game's hub and a phone had to open a menu to go anywhere. Now:
 * - **Home** is the launcher for anyone who has played, the landing page for a
 *   stranger (`/`, see `lib/returning.ts`).
 * - **Play** goes to a board: the game left unfinished, else the last game's
 *   setup, filled in with what was chosen last time (`usePlayHref`).
 * - **You** is the player's numbers, games and settings — for guests too.
 *
 * Below `md` the three sit in a bar at the bottom of the screen, where a thumb
 * reaches them, as on native; the top bar keeps the wordmark, Learn and Watch.
 * The games themselves are on Home.
 */

const isActive = (pathname: string, key: string) => {
  switch (key) {
    case 'home':
      return pathname === '/' || pathname === '/home';
    case 'you':
      return pathname.startsWith('/profile') || pathname.startsWith('/settings');
    case 'learn':
      return pathname === '/learn' || /^\/[a-z]+\/learn$/.test(pathname);
    case 'watch':
      return pathname.startsWith('/spectate');
    default:
      return false;
  }
};

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const playHref = usePlayHref();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // A signed-in player has history somewhere, so `/` is their launcher.
  useEffect(() => {
    if (user) markReturning();
  }, [user]);

  const handleSignOut = async () => {
    setDropdownOpen(false);
    // Loaded on demand — keeps @supabase/* out of the nav's (i.e. every
    // page's) initial bundle; by sign-out time it's warm from useAuth anyway.
    const { supabase } = await import('@gameexplorer/db');
    await supabase.auth.signOut();
    router.push('/');
  };

  // In-game screens run without the global bars: they cost height off a square
  // board, and each of those screens carries its own header with a way home.
  // Bailing out AFTER the hooks above keeps the hook order stable across a
  // client-side navigation into and out of a game.
  if (isImmersiveGameRoute(pathname)) return null;

  const primary: { key: string; href: string; label: string; icon: IconName; activeIcon: IconName }[] = [
    { key: 'home', href: '/', label: 'Home', icon: 'house', activeIcon: 'house-fill' },
    { key: 'play', href: playHref, label: 'Play', icon: 'play-fill', activeIcon: 'play-fill' },
    { key: 'you', href: '/profile', label: 'You', icon: 'user', activeIcon: 'user-fill' },
  ];
  const secondary = [
    { key: 'learn', href: '/learn', label: 'Learn' },
    { key: 'watch', href: '/spectate', label: 'Watch' },
  ];

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-surface"
      >
        <div className="container mx-auto px-4">
          {/* Equal outer columns keep the centre links truly centred, whatever
              the width of the wordmark or the account area. */}
          <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center">
            <Link href="/" className="touch-target flex items-center justify-self-start">
              <span className="font-display text-xl font-bold text-fg sm:text-2xl">
                Game<span className="text-accent">Explorer</span>
              </span>
            </Link>

            <div className="hidden items-center gap-8 justify-self-center md:flex">
              {primary.map((item) => (
                <NavLink key={item.key} href={item.href} active={isActive(pathname, item.key)}>
                  {item.label}
                </NavLink>
              ))}
              <span className="h-5 w-px bg-border" aria-hidden="true" />
              {secondary.map((item) => (
                <NavLink key={item.key} href={item.href} active={isActive(pathname, item.key)} quiet>
                  {item.label}
                </NavLink>
              ))}
            </div>

            {/* Pinned to the last column: below md the centre links are not
                drawn, and without this the grid slid these left against the
                wordmark. */}
            <div className="col-start-3 flex items-center gap-4 justify-self-end">
              {/* Below md the three primary places are in the bottom bar. */}
              <div className="flex items-center gap-4 md:hidden">
                {secondary.map((item) => (
                  <NavLink key={item.key} href={item.href} active={isActive(pathname, item.key)} quiet>
                    {item.label}
                  </NavLink>
                ))}
              </div>
              {!loading &&
                (user ? (
                  <div className="relative hidden md:block" ref={dropdownRef}>
                    <button
                      onClick={() => setDropdownOpen((o) => !o)}
                      className="touch-target flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-muted text-sm font-bold text-fg transition-colors hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                      aria-label="Account menu"
                      aria-expanded={dropdownOpen}
                    >
                      {user.email[0].toUpperCase()}
                    </button>

                    {dropdownOpen && (
                      <div className="absolute right-0 z-50 mt-2 w-48 rounded-xl border border-border bg-surface-alt py-1 shadow-lg">
                        <div className="border-b border-border px-4 py-2">
                          <p className="truncate text-xs text-fg-subtle">{user.email}</p>
                        </div>
                        <MenuLink href="/profile" icon="user" onClick={() => setDropdownOpen(false)}>
                          Profile
                        </MenuLink>
                        <MenuLink href="/settings" icon="gear" onClick={() => setDropdownOpen(false)}>
                          Settings
                        </MenuLink>
                        <div className="mt-1 border-t border-border pt-1">
                          <button
                            onClick={handleSignOut}
                            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-danger-hover transition-colors hover:bg-danger-muted"
                          >
                            <Icon name="arrow-right" className="text-base" />
                            Log out
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <SignInNavLink className="touch-target hidden text-sm font-medium text-fg-muted transition-colors hover:text-fg md:inline" />
                ))}
            </div>
          </div>
        </div>
      </nav>

      {/* The phone bar: the same three places, where a thumb reaches them. */}
      <nav
        aria-label="Main (bottom)"
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="grid h-16 grid-cols-3">
          {primary.map((item) => {
            const active = isActive(pathname, item.key);
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 text-caption font-semibold motion-control motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus',
                  active ? 'text-fg' : 'text-fg-subtle hover:text-fg',
                )}
              >
                <Icon
                  name={active ? item.activeIcon : item.icon}
                  // Play is an action, not a place: the accent says so without
                  // a gold button competing with the page's own.
                  className={cn('text-2xl', item.key === 'play' && 'text-accent')}
                />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

/**
 * Room under the page for the phone bar, which is fixed over the bottom of the
 * screen. Rendered after the page in the root layout; nothing on the routes
 * that draw no bar.
 */
export function BottomNavSpacer() {
  const pathname = usePathname();
  if (isImmersiveGameRoute(pathname)) return null;
  return <div aria-hidden="true" className="h-[calc(4rem+env(safe-area-inset-bottom))] md:hidden" />;
}

function MenuLink({
  href,
  icon,
  onClick,
  children,
}: {
  href: string;
  icon: IconName;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-fg transition-colors hover:bg-surface-hover"
    >
      <Icon name={icon} className="text-base text-fg-muted" />
      {children}
    </Link>
  );
}

/**
 * The navbar's Sign in link. Signing in should put you back where you were,
 * not on a profile page you did not ask for, so it carries the current page
 * (`authHref` drops it for home, where there is nothing to return to).
 *
 * On the auth pages there is no "here" worth returning to: carrying the sign-up
 * page as `next` landed a newly signed-in user back on the sign-up form. The
 * link keeps the round trip that page already has instead, and replaces it so
 * the auth pages stay one step in the browser's history.
 */
function SignInNavLink({ className }: { className: string }) {
  const pathname = usePathname();
  if (!isAuthPath(pathname)) {
    return (
      <Link href={authHref('/auth/signin', pathname)} className={className}>
        Sign in
      </Link>
    );
  }
  // `useSearchParams` needs a Suspense boundary in the App Router.
  return (
    <Suspense
      fallback={
        <Link href="/auth/signin" replace className={className}>
          Sign in
        </Link>
      }
    >
      <CarriedSignInLink className={className} />
    </Suspense>
  );
}

function CarriedSignInLink({ className }: { className: string }) {
  const href = useAuthSwitchHref('/auth/signin');
  return (
    <Link href={href} replace className={className}>
      Sign in
    </Link>
  );
}

function NavLink({
  href,
  active,
  quiet = false,
  children,
}: {
  href: string;
  active: boolean;
  /** Learn and Watch: a step down from the three primary places. */
  quiet?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'touch-target inline-block py-1 font-medium transition-colors',
        quiet ? 'text-sm' : 'text-base',
        active ? 'text-fg' : quiet ? 'text-fg-subtle hover:text-fg' : 'text-fg-muted hover:text-fg',
      )}
    >
      {children}
      {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-accent" />}
    </Link>
  );
}
