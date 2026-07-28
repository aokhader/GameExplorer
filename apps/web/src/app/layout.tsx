import type { Metadata } from 'next';
import { DM_Sans, Space_Grotesk, Spectral, Nunito_Sans } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import { Navigation } from '@/components/Navigation';
import { ClientConfig } from '@/components/ClientConfig';
import { ToastProvider } from '@/components/ui';
import { RouteAmbient, PageTransition } from '@/components/visual';
import { SettingsProvider } from '@/components/providers/SettingsProvider';

/**
 * Type. Each theme names a body + display face, so all four are loaded as CSS
 * variables on <html> and globals.css points `--font-body` / `--font-display` at
 * the pair the active theme wants (see the `[data-theme]` blocks there).
 *
 * Arcade Glow — DM Sans + Space Grotesk (geometric, arcade).
 */
const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
});
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
});

/** Cozy Tabletop — Nunito Sans + Spectral (humanist sans under a book serif). */
const nunitoSans = Nunito_Sans({
  subsets: ['latin'],
  weight: ['400', '600', '700', '900'],
  variable: '--font-nunito-sans',
});
const spectral = Spectral({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-spectral',
});

/**
 * Applied before first paint so a cozy-themed reload never flashes the dark
 * palette. Mirrors the storage key + shape of SettingsProvider; that provider
 * remains authoritative once React mounts.
 */
const THEME_BOOTSTRAP = `try{var s=JSON.parse(localStorage.getItem('gx:settings')||'{}');if(s.theme==='cozy')document.documentElement.dataset.theme='cozy';}catch(e){}`;

export const metadata: Metadata = {
  title: 'GameExplorer - Classic Board Games',
  description: 'Play chess, checkers, reversi and more classic board games online',
  keywords: ['chess', 'board games', 'online games', 'multiplayer'],
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
            <RouteAmbient />
            <Navigation />
            <PageTransition>{children}</PageTransition>
          </ToastProvider>
        </SettingsProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
 