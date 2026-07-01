import type { Metadata } from 'next';
import { DM_Sans, Space_Grotesk } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import { Navigation } from '@/components/Navigation';
import { ClientConfig } from '@/components/ClientConfig';
import { ToastProvider } from '@/components/ui';
import { RouteAmbient, PageTransition } from '@/components/visual';
import { SettingsProvider } from '@/components/providers/SettingsProvider';

// Body face — DM Sans; applied as the default font on <body>.
const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

// Display face — Space Grotesk; exposed as --font-space-grotesk and consumed by
// the `--font-display` var (headings + `.font-display`) in globals.css.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
});

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
    <html lang="en" data-scroll-behavior="smooth" className={spaceGrotesk.variable}>
      <body className={dmSans.className}>
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
 