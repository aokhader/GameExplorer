'use client';

import { setApiUrl } from '@gameexplorer/client';

// Configure the shared client layer with the web API URL. Runs once when this
// module loads (client bundle), before any socket connects. The React Native
// app sets its own URL the same way. NEXT_PUBLIC_API_URL is inlined by Next at
// build time; the localhost fallback covers local dev.
setApiUrl(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000');

export function ClientConfig() {
  return null;
}
