import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import { BottomNavSpacer, Navigation } from '@/components/Navigation';
import { ClientConfig } from '@/components/ClientConfig';
import { ToastProvider } from '@/components/ui';
import { PageTransition } from '@/components/visual';
import { SettingsProvider } from '@/components/providers/SettingsProvider';
import { gameNameList, THEME_CHOICES } from '@gameexplorer/shared';
import { SITE_URL } from '@/lib/site';

/**
 * Type. Each theme names a body + display face, so all four are loaded as CSS
 * variables on <html> and globals.css points `--font-body` / `--font-display` at
 * the pair the active theme wants (see the `[data-theme]` blocks there).
 *
 * The files are vendored in `./fonts` and loaded with `next/font/local`, not
 * fetched from Google at build time: Google intermittently answers that fetch
 * with extensionless `/l/font?kit=…&…` URLs, which Turbopack's font loader
 * cannot parse, and the deploy fails with "next/font/google queries have
 * exactly one entry" (vercel/next.js#99114). Provenance is in `./fonts/README.md`.
 *
 * Arcade Glow — DM Sans + Space Grotesk (geometric, arcade). Both are variable.
 */
const dmSans = localFont({
  src: './fonts/dm-sans-latin-400-700.woff2',
  weight: '400 700',
  variable: '--font-dm-sans',
});
const spaceGrotesk = localFont({
  src: './fonts/space-grotesk-latin-400-700.woff2',
  weight: '400 700',
  variable: '--font-space-grotesk',
});

/** Cozy Tabletop — Nunito Sans (variable) + Spectral (static cuts, a book serif). */
const nunitoSans = localFont({
  src: './fonts/nunito-sans-latin-400-900.woff2',
  weight: '400 900',
  variable: '--font-nunito-sans',
});
const spectral = localFont({
  src: [
    { path: './fonts/spectral-latin-400.woff2', weight: '400', style: 'normal' },
    { path: './fonts/spectral-latin-500.woff2', weight: '500', style: 'normal' },
    { path: './fonts/spectral-latin-600.woff2', weight: '600', style: 'normal' },
    { path: './fonts/spectral-latin-700.woff2', weight: '700', style: 'normal' },
    { path: './fonts/spectral-latin-800.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-spectral',
  // A serif: size the fallback against Times, not the default Arial, or the
  // swap from fallback to Spectral shifts the layout.
  adjustFontFallback: 'Times New Roman',
});

/**
 * Applied before first paint so a non-default reload never flashes the dark
 * palette, and a reload with Settings' "Reduce motion" on never starts the
 * ambient drift before React mounts. Mirrors the storage key + shape of
 * SettingsProvider; that provider remains authoritative once React mounts.
 *
 * The theme list is interpolated from `THEME_CHOICES` rather than written out.
 * This script used to test `s.theme==='cozy'` by hand, which is the shape of bug
 * the visual-parity pass found six times over: a hand-maintained list silently
 * drops the newest member, and the symptom here would be a new theme flashing
 * the default palette on every load before React corrected it.
 */
const THEME_BOOTSTRAP = `try{var s=JSON.parse(localStorage.getItem('gx:settings')||'{}'),r=document.documentElement;if(${JSON.stringify(
  THEME_CHOICES.filter((t) => t !== 'dark'),
)}.indexOf(s.theme)>-1)r.dataset.theme=s.theme;if(s.reduceMotion)r.dataset.reducedMotion='';}catch(e){}`;

// SITE_URL is the absolute base for OG/Twitter image URLs. Without it Next
// emits relative `og:image` paths, which every scraper rejects — the card
// silently doesn't render. It now lives in `@/lib/site` because robots.ts and
// sitemap.ts need the identical value.

// Reads from the catalog: this sentence is the site's search description, and
// a hand-typed game list here goes stale the moment a game ships.
const DESCRIPTION = `Play ${gameNameList()} — sharp bots, online matches, pass and play, puzzles and Elo ratings. Free, no ads.`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'GameExplorer - Classic Board Games',
  description: DESCRIPTION,
  keywords: ['chess', 'checkers', 'reversi', 'go', 'board games', 'online games', 'multiplayer'],
  // `opengraph-image.tsx` supplies the image for both cards; declaring the rest
  // here keeps titles/descriptions from falling back to the bare page title.
  openGraph: {
    type: 'website',
    siteName: 'GameExplorer',
    title: 'GameExplorer — Classic Board Games',
    description: DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GameExplorer — Classic Board Games',
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${dmSans.variable} ${spaceGrotesk.variable} ${nunitoSans.variable} ${spectral.variable}`}
      // THEME_BOOTSTRAP stamps `data-theme` on this element before React
      // hydrates, so the server HTML and the live DOM legitimately differ here.
      // Scoped to <html>'s own attributes; children still warn normally.
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <SettingsProvider>
          <ToastProvider>
            <ClientConfig />
            <Navigation />
            <PageTransition>{children}</PageTransition>
            <BottomNavSpacer />
          </ToastProvider>
        </SettingsProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
 