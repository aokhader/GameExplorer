// AES-256-GCM encryption for sensitive fields (email addresses)
// Never call these functions from client-side code — they require the
// PROFILES_ENCRYPTION_KEY secret which must only exist server-side.

const ALGORITHM = 'AES-GCM';
const IV_LENGTH = 12; // 96 bits, recommended for AES-GCM
const KEY_LENGTH = 256;

/**
 * Derive a CryptoKey from the hex-encoded PROFILES_ENCRYPTION_KEY env var.
 */
async function getKey(): Promise<CryptoKey> {
  const hexKey = process.env.PROFILES_ENCRYPTION_KEY;
  if (!hexKey || hexKey.length !== 64) {
    throw new Error(
      'PROFILES_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
      'Generate one'
    );
  }

  const keyBytes = new Uint8Array(
    hexKey.match(/.{2}/g)!.map((b) => parseInt(b, 16))
  );

  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a base64-encoded string of IV + ciphertext.
 */
export async function encryptEmail(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded
  );

  // Prepend IV to ciphertext so we can recover it on decryption
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);

  return Buffer.from(combined).toString('base64');
}

/**
 * Decrypt a base64-encoded AES-256-GCM ciphertext string.
 */
export async function decryptEmail(encrypted: string): Promise<string> {
  const key = await getKey();
  const combined = new Uint8Array(Buffer.from(encrypted, 'base64'));

  const iv = combined.slice(0, IV_LENGTH);
  const ciphertext = combined.slice(IV_LENGTH);

  const plaintext = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    ciphertext
  );

  return new TextDecoder().decode(plaintext);
}

/**
 * One-way hash of an email address for indexed lookups.
 * Uses SHA-256 — not for password storage, only for finding a profile by email
 * without storing the email in plaintext.
 */
export async function hashEmail(email: string): Promise<string> {
  const normalized = email.toLowerCase().trim();
  const encoded = new TextEncoder().encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return Buffer.from(hashBuffer).toString('hex');
}