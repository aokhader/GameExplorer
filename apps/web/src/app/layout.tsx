import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';
import { Navigation } from '@/components/Navigation';
import { ClientConfig } from '@/components/ClientConfig';
import { ToastProvider } from '@/components/ui';
import { RouteAmbient } from '@/components/visual';

const inter = Inter({ subsets: ['latin'] });

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
    <html lang="en" data-scroll-behavior="smooth">
      <body className={inter.className}>
        <ToastProvider>
          <ClientConfig />
          <RouteAmbient />
          <Navigation />
          {children}
        </ToastProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
 