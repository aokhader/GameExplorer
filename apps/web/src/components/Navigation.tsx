'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRef, useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@gameexplorer/db';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/', label: 'Home' },
  { href: '/chess', label: 'Chess' },
  { href: '/checkers', label: 'Checkers' },
  { href: '/reversi', label: 'Reversi' },
  { href: '/spectate', label: 'Watch' },
];

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
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

  // Close the mobile menu whenever the route changes.
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const handleSignOut = async () => {
    setDropdownOpen(false);
    await supabase.auth.signOut();
    router.push('/');
  };

  const isActive = (href: string) =>
    href === '/spectate' ? pathname.startsWith('/spectate') : pathname === href;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-surface/70 backdrop-blur-xl backdrop-saturate-150 border-b border-border shadow-[0_1px_0_0_rgba(255,255,255,0.04)]">
      <div className="container mx-auto px-4">
        {/* 3-column grid: equal-width outer columns keep the center nav truly
            viewport-centered regardless of how wide the logo / auth area are
            (a plain justify-between would let the side widths shift it off-center). */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2 group justify-self-start">
            <span className="font-display text-2xl font-bold text-fg transition-colors">
              Game<span className="text-accent group-hover:text-accent-hover transition-colors">Explorer</span>
            </span>
          </Link>

          {/* Navigation Links (desktop) */}
          <div className="hidden md:flex items-center space-x-8 justify-self-center">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.href} href={item.href} active={isActive(item.href)}>
                {item.label}
              </NavLink>
            ))}
          </div>

          {/* Auth area + mobile toggle */}
          <div className="flex items-center gap-3 justify-self-end">
            {!loading && (
              user ? (
                /* Avatar + dropdown */
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setDropdownOpen(o => !o)}
                    className="w-9 h-9 rounded-full bg-accent hover:bg-accent-hover flex items-center justify-center text-on-accent text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-surface"
                    aria-label="Account menu"
                  >
                    {user.email[0].toUpperCase()}
                  </button>

                  {dropdownOpen && (
                    <div className="absolute right-0 mt-2 w-48 rounded-xl bg-surface-alt border border-border shadow-lg py-1 z-50">
                      <div className="px-4 py-2 border-b border-border">
                        <p className="text-xs text-fg-subtle truncate">{user.email}</p>
                      </div>
                      <Link
                        href="/profile"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-fg hover:bg-surface-hover transition-colors"
                      >
                        <svg className="w-4 h-4 text-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Profile
                      </Link>
                      <Link
                        href="/settings"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-fg hover:bg-surface-hover transition-colors"
                      >
                        <svg className="w-4 h-4 text-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Settings
                      </Link>
                      <div className="border-t border-border mt-1 pt-1">
                        <button
                          onClick={handleSignOut}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-danger-hover hover:bg-danger-muted transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                          Log out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <Link
                    href="/auth/signin"
                    className="hidden sm:inline text-sm text-fg-muted hover:text-fg transition-colors"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/chess"
                    className="px-4 py-2 bg-accent hover:bg-accent-hover text-on-accent font-semibold rounded-lg transition-colors text-sm"
                  >
                    Play Now
                  </Link>
                </>
              )
            )}

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileOpen(o => !o)}
              className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileOpen}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                {mobileOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu panel */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-surface/95 backdrop-blur-md animate-fade-in">
          <div className="container mx-auto px-4 py-2 flex flex-col">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'py-3 px-2 text-base font-medium rounded-lg transition-colors',
                  isActive(item.href) ? 'text-accent' : 'text-fg-muted hover:text-fg hover:bg-surface-muted',
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`relative text-sm font-medium transition-colors ${
        active ? 'text-accent' : 'text-fg-muted hover:text-fg'
      }`}
    >
      {children}
      {active && (
        <span className="absolute -bottom-1.5 left-0 right-0 h-0.5 rounded-full bg-accent shadow-[0_0_8px_var(--c-accent)]" />
      )}
    </Link>
  );
}
