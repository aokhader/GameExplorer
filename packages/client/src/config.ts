/**
 * Platform-agnostic runtime config for the shared client layer.
 *
 * The web app calls setApiUrl() with NEXT_PUBLIC_API_URL at startup; the React
 * Native app will call it with its own value. Keeping the URL here (instead of
 * reading process.env inside the store) is what lets this package run unchanged
 * on a non-Next runtime.
 */
let apiUrl = 'http://localhost:4000';

export function setApiUrl(url: string): void {
  apiUrl = url;
}

export function getApiUrl(): string {
  return apiUrl;
}
