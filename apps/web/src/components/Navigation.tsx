'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useRef, useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@gameexplorer/db';

export function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
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

  const handleSignOut = async () => {
    setDropdownOpen(false);
    await supabase.auth.signOut();
    router.push('/');
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2 group">
            <span className="text-2xl font-bold text-white group-hover:text-blue-400 transition-colors">
              GameExplorer
            </span>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-8">
            <NavLink href="/" active={pathname === '/'}>Home</NavLink>
            <NavLink href="/chess" active={pathname === '/chess'}>Chess</NavLink>
            <NavLink href="/checkers" active={pathname === '/checkers'}>Checkers</NavLink>
            <NavLink href="/reversi" active={pathname === '/reversi'}>
              Reversi
              <span className="ml-1 text-xs text-slate-400">(Soon)</span>
            </NavLink>
          </div>

          {/* Auth area */}
          <div className="flex items-center gap-3">
            {!loading && (
              user ? (
                /* Avatar + dropdown */
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setDropdownOpen(o => !o)}
                    className="w-9 h-9 rounded-full bg-blue-600 hover:bg-blue-500 flex items-center justify-center text-white text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-900"
                    aria-label="Account menu"
                  >
                    {user.email[0].toUpperCase()}
                  </button>

                  {dropdownOpen && (
                    <div className="absolute right-0 mt-2 w-48 rounded-xl bg-white dark:bg-slate-800 shadow-lg ring-1 ring-black/5 dark:ring-white/10 py-1 z-50">
                      <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700">
                        <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{user.email}</p>
                      </div>
                      <Link
                        href="/profile"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors"
                      >
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Profile
                      </Link>
                      <Link
                        href="/settings"
                        onClick={() => setDropdownOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-colors"
                      >
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Settings
                      </Link>
                      <div className="border-t border-slate-100 dark:border-slate-700 mt-1 pt-1">
                        <button
                          onClick={handleSignOut}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
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
                    className="text-sm text-slate-300 hover:text-white transition-colors"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/chess"
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors text-sm"
                  >
                    Play Now
                  </Link>
                </>
              )
            )}
          </div>
        </div>
      </div>
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
      className={`text-sm font-medium transition-colors ${
        active ? 'text-blue-400' : 'text-slate-300 hover:text-white'
      }`}
    >
      {children}
    </Link>
  );
}
