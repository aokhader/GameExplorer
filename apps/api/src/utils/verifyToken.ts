import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

// Supabase signs access tokens with an asymmetric (ECC / ES256) key. We verify
// against the project's public JWKS endpoint, which `createRemoteJWKSet` fetches
// and caches, transparently re-fetching when Supabase rotates the signing key.
//
// Pinning `algorithms: ['ES256']` is required for security: it prevents an
// attacker from supplying a token signed with a different algorithm (e.g. an
// HS256 token whose HMAC secret is the public key — the classic algorithm-
// confusion attack).

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (jwks) return jwks;

  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL is not set');
  }

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
  const { payload } = await jwtVerify(token, getJwks(), { algorithms: ['ES256'] });
  return payload;
}
