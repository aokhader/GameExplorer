'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Navigation() {
  const pathname = usePathname();

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
            <NavLink href="/" active={pathname === '/'}>
              Home
            </NavLink>
            <NavLink href="/chess" active={pathname === '/chess'}>
              Chess
            </NavLink>
            <NavLink href="/checkers" active={pathname === '/checkers'}>
              Checkers
              <span className="ml-1 text-xs text-slate-400">(Soon)</span>
            </NavLink>
            <NavLink href="/reversi" active={pathname === '/reversi'}>
              Reversi
              <span className="ml-1 text-xs text-slate-400">(Soon)</span>
            </NavLink>
          </div>

          {/* CTA Button */}
          <Link
            href="/chess"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            Play Now
          </Link>
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
      className={`
        text-sm font-medium transition-colors
        ${active 
          ? 'text-blue-400' 
          : 'text-slate-300 hover:text-white'}
      `}
    >
      {children}
    </Link>
  );
}