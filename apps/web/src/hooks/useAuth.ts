// Moved to @gameexplorer/client (shared web + mobile). Re-exported here so the
// existing `@/hooks/useAuth` import paths keep working.
// Subpath import (not the barrel) — the nav renders this on every page, and the
// barrel would statically pull socket.io-client into every route's dev graph.
export { useAuth } from '@gameexplorer/client/hooks/useAuth';
