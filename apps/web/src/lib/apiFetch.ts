// The authenticated API fetch now lives in the shared client layer so web and
// mobile share one implementation (see packages/client/src/apiFetch.ts). This
// re-export keeps the existing `@/lib/apiFetch` import path stable for callers.
// The base URL is `getApiUrl()`, set at startup by ClientConfig via setApiUrl().
export { apiFetch } from '@finesse/client/apiFetch';
