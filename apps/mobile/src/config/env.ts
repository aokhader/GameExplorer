/**
 * Startup config bootstrap for the mobile app.
 *
 * The shared client layer (`@finesse/client`) is platform-agnostic: it reads
 * the API base URL from an injected value (`setApiUrl`) rather than any env global.
 * Likewise `@finesse/db` takes the OAuth redirect via `setOAuthRedirect`.
 * This mirrors what the web app does at its own startup — see
 * packages/client/src/config.ts and packages/db/src/auth.ts.
 *
 * EXPO_PUBLIC_* vars are inlined by Expo at build time.
 */
import { setApiUrl } from '@finesse/client';
import { setOAuthRedirect } from '@finesse/db';
import * as Linking from 'expo-linking';

let bootstrapped = false;

export function bootstrapConfig(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  // Release builds must never point at localhost (iOS ATS blocks plain http
  // anyway) — if the build-time env is missing, fall back to the deployed API.
  const apiUrl =
    process.env.EXPO_PUBLIC_API_URL ??
    // Host must match the Render service name in render.yaml (`finesse-api`).
    // That service does not exist until the Blueprint is re-synced under the
    // new name, so release builds need EXPO_PUBLIC_API_URL set until it does.
    (__DEV__ ? 'http://localhost:4000' : 'https://finesse-api.onrender.com');
  setApiUrl(apiUrl);

  // Deep link back into the app after OAuth, e.g. finesse://auth/callback.
  setOAuthRedirect(Linking.createURL('/auth/callback'));
}
