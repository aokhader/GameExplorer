import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, type PoolConfig } from 'pg';
import { logger } from '../utils/logger';
import { retry } from '../utils/retry';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL must be set');
}

/**
 * TLS for the Postgres connection.
 *
 * `pg` does NOT negotiate TLS unless it is asked to, so a bare DATABASE_URL
 * connects in cleartext. Putting `?sslmode=require` in the URL is not the fix
 * either: pg-connection-string only applies libpq's lenient `require` semantics
 * when `uselibpqcompat` is set. In the default path it merely sets `ssl = {}`
 * (plus a deprecation warning), leaving `rejectUnauthorized` to Node's default
 * of `true` — full chain verification against Node's built-in CA store. Supabase
 * serves a cert signed by its own root CA, which is not in that store, so the
 * connection dies with `SELF_SIGNED_CERT_IN_CHAIN`.
 *
 * So we configure TLS explicitly here instead of through the URL:
 *   - DATABASE_CA_CERT set  → verified TLS against Supabase's CA (what we want)
 *   - not set               → encrypted but UNVERIFIED, with a loud warning
 *   - local host            → no TLS, so the docker-compose dev DB still works
 *
 * Get the CA from Supabase → Project Settings → Database → SSL Configuration
 * ("Download certificate"), and paste the PEM into DATABASE_CA_CERT on Render.
 */
function buildSslConfig(url: URL): PoolConfig['ssl'] {
  const mode = url.searchParams.get('sslmode');
  if (mode === 'disable') return false;

  const host = url.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '';
  if (isLocal && !mode) return false;

  const raw = process.env.DATABASE_CA_CERT?.trim();
  if (raw) {
    // Some dashboards store multi-line secrets with literal backslash-n rather
    // than real newlines; a PEM with the wrong line breaks fails to parse.
    const ca = raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
    return { ca, rejectUnauthorized: true };
  }

  logger.warn(
    'DATABASE_CA_CERT is not set — the Postgres connection is encrypted but the ' +
      "server certificate is NOT verified. Set it to Supabase's CA certificate " +
      '(Project Settings → Database → SSL Configuration) to close this gap.',
  );
  return { rejectUnauthorized: false };
}

// pg merges the parsed connection string OVER explicit options
// (connection-parameters.js: `Object.assign({}, config, parse(connectionString))`),
// so an `sslmode` left in the URL would silently discard the `ssl` object above.
// Strip it and let buildSslConfig be the single source of truth.
let poolConfig: PoolConfig;
try {
  const url = new URL(connectionString);
  const ssl = buildSslConfig(url);
  url.searchParams.delete('sslmode');
  poolConfig = { connectionString: url.toString(), ssl };
} catch {
  // Not a URL we can parse (unusual libpq forms, unencoded characters). Hand it
  // to pg untouched rather than refusing to boot.
  logger.warn('DATABASE_URL could not be parsed as a URL; leaving TLS config to pg.');
  poolConfig = { connectionString };
}

// Create PostgreSQL connection pool
//
// connectionTimeoutMillis covers the whole handshake: TCP, TLS with CA
// verification, and SCRAM auth through Supabase's pooler. 2s was too tight for
// a just-booted container on Render's free tier (a tenth of a CPU, also busy
// loading the app), and it is the timeout every request waits out when the
// database is unreachable, so it stays short of "the app looks hung".
const pool = new Pool({
  ...poolConfig,
  max: 20, // Maximum pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Create Prisma adapter
const adapter = new PrismaPg(pool);

// Initialize Prisma Client
export const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'error', 'warn']
    : ['error'],
});

// Handle connection errors.
//
// `pg` emits this on an IDLE client, which happens routinely: the server closes
// a connection, a network blip drops it, or Supabase's pooler recycles it. The
// pool discards that client and carries on — nothing is lost, and the next
// query opens a fresh connection. Exiting the process here turned a normal,
// self-healing event into a full restart, which (Redis being colocated with
// persistence off) wiped every live game on the service. Log it instead.
pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error (idle client discarded):', err);
});

// Graceful shutdown
export async function disconnectDatabase() {
  await prisma.$disconnect();
  await pool.end();
}

/**
 * Waits between boot-time connection attempts: six attempts over ~30s of
 * waiting, ~60s in all with each attempt's connect timeout.
 *
 * One attempt used to be all there was, so a single slow handshake exited the
 * process and Render restarted it, over and over. A database that stays away
 * this long is down (a paused Supabase project looks exactly like this), and
 * exiting is still right then: it keeps the deploy visibly failed instead of
 * serving an API that cannot read anything.
 */
export const DB_BOOT_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000] as const;

/** Boot-time check: true once `SELECT 1` succeeds, false when every attempt failed. */
export async function waitForDatabase(): Promise<boolean> {
  try {
    await retry(() => prisma.$queryRaw`SELECT 1`, {
      delaysMs: DB_BOOT_RETRY_DELAYS_MS,
      onRetry: (error, attempt, delayMs) => {
        const reason = error instanceof Error ? error.message : String(error);
        logger.warn(
          `Database not reachable (attempt ${attempt}/${DB_BOOT_RETRY_DELAYS_MS.length + 1}: ${reason}); ` +
            `retrying in ${delayMs / 1000}s`,
        );
      },
    });
    return true;
  } catch (error) {
    logger.error('Database connection failed:', error);
    return false;
  }
}
