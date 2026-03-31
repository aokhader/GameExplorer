import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
 
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
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
 