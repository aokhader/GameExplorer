// Moved to @gameexplorer/client (shared web + mobile). Re-exported here so the
// existing `@/stores/authStore` import paths keep working.
// Subpath import (not the barrel) — avoids dragging socket.io-client into the
// dev module graph of every page that reads auth state.
export { useAuthStore } from '@gameexplorer/client/stores/authStore';
