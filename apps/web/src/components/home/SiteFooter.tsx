import Link from 'next/link';
import type { ReactNode } from 'react';
import { SUPPORT_EMAIL } from '@/lib/support';

/**
 * The legal and support links, under both Homes — the landing page and the
 * launcher.
 *
 * Google Play requires the account-deletion page to be reachable without signing
 * in, and this footer is the one place a reviewer looks for it. The links are
 * 44px rows rather than 20px lines of text: the audit measured them under every
 * touch-target floor (`ux-fix-ideas.md` §8.3).
 */
export function SiteFooter() {
  return (
    <footer className="mt-12 text-center text-sm text-fg-muted">
      <nav aria-label="Legal and support" className="flex flex-wrap items-center justify-center gap-x-2">
        <FooterLink href="/terms">Terms</FooterLink>
        <FooterLink href="/privacy">Privacy</FooterLink>
        <FooterLink href="/delete-account">Delete account</FooterLink>
        <FooterLink href="/licenses">Licenses</FooterLink>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex min-h-11 items-center px-2 transition-colors hover:text-fg">
          Contact
        </a>
      </nav>
      <p className="mt-2">© 2026 GameExplorer</p>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center px-2 transition-colors hover:text-fg">
      {children}
    </Link>
  );
}
