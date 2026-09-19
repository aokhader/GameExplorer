import type { Metadata } from 'next';
import { Launcher } from '@/components/home/Launcher';
import { SiteFooter } from '@/components/home/SiteFooter';

/**
 * The returning launcher. Visitors reach it at `/`: with the `gx_returning`
 * cookie set, `next.config.ts` rewrites `/` here, so the address bar never
 * shows `/home` and the landing page never flashes past (`lib/returning.ts`).
 */
export const metadata: Metadata = {
  // `/` is the page to index; this is the same address for someone who has played.
  robots: { index: false },
};

export default function LauncherPage() {
  return (
    <div className="min-h-svh pt-16">
      <div className="container mx-auto max-w-2xl px-4 pt-6 pb-12">
        <Launcher />
        <SiteFooter />
      </div>
    </div>
  );
}
