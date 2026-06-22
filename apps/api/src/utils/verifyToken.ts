import type { JWTPayload } from 'jose';

// Supabase signs access tokens with an asymmetric (ECC / ES256) key. We verify
// against the project's public JWKS endpoint, which `createRemoteJWKSet` fetches
// and caches, transparently re-fetching when Supabase rotates the signing key.
//
// Pinning `algorithms: ['ES256']` is required for security: it prevents an
// attacker from supplying a token signed with a different algorithm (e.g. an
// HS256 token whose HMAC secret is the public key — the classic algorithm-
// confusion attack).
//
// jose@6 is ESM-only. This package compiles to CommonJS, and not every runtime
// supports `require()` of an ESM module — Node < 20.19 and some serverless
// runtimes (e.g. Vercel) throw ERR_REQUIRE_ESM. A dynamic `import()` works from
// CommonJS on every Node version, so we load jose lazily and cache the module.

type Jose = typeof import('jose');

let josePromise: Promise<Jose> | null = null;
function loadJose(): Promise<Jose> {
  josePromise ??= import('jose');
  return josePromise;
}

let jwks: ReturnType<Jose['createRemoteJWKSet']> | null = null;

async function getJwks() {
  if (jwks) return jwks;

  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is not set');
  }

  const { createRemoteJWKSet } = await loadJose();
  jwks = createRemoteJWKSet(
    new URL(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`),
  );
  return jwks;
}

/**
 * Verifies a Supabase access token against the project's JWKS and returns its
 * payload. Throws if the token is missing/invalid/expired or if SUPABASE_URL
 * is not configured.
 */
export async function verifySupabaseToken(token: string): Promise<JWTPayload> {
  const { jwtVerify } = await loadJose();
  const { payload } = await jwtVerify(token, await getJwks(), { algorithms: ['ES256'] });
  return payload;
}
