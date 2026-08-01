import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool, type PoolConfig } from 'pg';
import { logger } from '../utils/logger';

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
const pool = new Pool({
  ...poolConfig,
  max: 20, // Maximum pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
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

// Handle connection errors
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
  process.exit(-1);
});

// Graceful shutdown
export async function disconnectDatabase() {
  await prisma.$disconnect();
  await pool.end();
}

// Health check
export async function checkDatabaseConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}
