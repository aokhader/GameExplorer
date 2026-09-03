import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // For monorepo setup - transpile shared packages
  transpilePackages: ['@finesse/client', '@finesse/shared', '@finesse/ui'],

  experimental: {
    // framer-motion has a large barrel export; pull in only the pieces the
    // lazy GameResultScreen / EmoteBar actually use rather than the whole tree.
    optimizePackageImports: ['framer-motion'],
  },
  
  async headers() {
    return [
      {
        // Cross-origin isolation unlocks SharedArrayBuffer, which the
        // multi-threaded Stockfish build needs (see src/lib/stockfishEngine.ts).
        // Must be site-wide: with client-side routing the isolation state is
        // fixed by whichever document the user first landed on, so scoping
        // these to the chess routes would silently downgrade the engine for
        // anyone who navigated there from another page. This also puts COEP on
        // the /stockfish/* worker scripts themselves, which browsers require
        // before letting a worker join an isolated page.
        // Safe here because the app embeds no cross-origin resources: no
        // external images/iframes, fonts self-hosted via next/font, and
        // Supabase/Socket.io use fetch/XHR/WebSockets which COEP doesn't gate.
        source: '/:path*',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
      {
        // Engine assets are multi-MB and version-stamped in their filenames
        // (stockfish-18.0.8-*), so browsers may cache them forever. Never
        // overwrite these files — ship a new version under a new name.
        source: '/stockfish/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },

  // API proxy to backend (development only)
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: process.env.NEXT_PUBLIC_API_URL 
          ? `${process.env.NEXT_PUBLIC_API_URL}/:path*`
          : 'http://localhost:4000/api/:path*', // Fallback for dev
      },
    ];
  },
  
  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'https',
        hostname: 'your-cdn-domain.com',
      },
    ],
  },
};

export default nextConfig;