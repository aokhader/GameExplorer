/**
 * The mobile Supabase session, encrypted at rest (security audit v2, GX-22).
 *
 * The session is one JSON value: the access token, the refresh token and the
 * user, email included. It used to go into AsyncStorage as it was — a plain
 * SQLite file on Android, plain files on iOS — and both are copied by device
 * backups and phone-to-phone transfer. A refresh token keeps minting access
 * tokens until it is revoked, so a copied backup was a standing way into the
 * account.
 *
 * Now every value is sealed with AES-256-GCM before it reaches AsyncStorage,
 * and the key lives in the platform keystore (expo-secure-store: the iOS
 * Keychain, Android's Keystore), marked this-device-only. A backup or a
 * transfer can carry the ciphertext but never the key. The session itself
 * cannot go into SecureStore: values over 2048 bytes are not supported there,
 * and a session with its user object is routinely larger. Each value is bound
 * to the name it is stored under, so one sealed value cannot be moved into
 * another's place.
 *
 * What it has to survive:
 *  - **Existing installs.** A session saved in plain text before this change is
 *    read as it is and sealed on the spot, so nobody is signed out by the update.
 *  - **Older binaries.** Both halves are native modules. An over-the-air update
 *    can reach a binary built before they were added (updates follow the app
 *    version, not the native code), and importing either there throws at load
 *    and takes the app down. So they are looked up first and required only if
 *    present; without them the session stays in plain AsyncStorage, as it
 *    always was, until the new binary is installed.
 *  - **A key that is gone.** The app restored onto another phone, or the
 *    keystore reset: the sealed value can never be opened again, so it is
 *    dropped and the user signs in again. A keystore that cannot be read *right
 *    now* is different — the value is kept for the next read.
 *  - **A keystore or cipher that misbehaves.** A value is written sealed only
 *    after it has just been opened again, under a key the keystore has just
 *    handed back. Otherwise it is stored in plain text: no worse than before
 *    this file existed, and far better than the alternative — a value that
 *    seals but will not open is dropped on the next read, and that is a user
 *    signed out on every launch.
 *
 * This file is Metro-only, like `client.native.ts`: the package's `tsc` build
 * skips `*.native.ts`, and the mobile app's typecheck and Jest cover it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo-modules-core';
import type * as CryptoModule from 'expo-crypto';
import type * as SecureStoreModule from 'expo-secure-store';

/** What supabase-js needs from `auth.storage`. */
export interface SessionStorage {
  getItem(name: string): Promise<string | null>;
  setItem(name: string, value: string): Promise<void>;
  removeItem(name: string): Promise<void>;
}

/** The plain key-value store the sealed values live in (AsyncStorage). */
export type Backend = Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem'>;

/** The native half: a device-bound place for one key, and AES-GCM. */
export interface Vault {
  /** The stored key, or null if there is none. Throws if the keystore cannot be read. */
  readKey(): Promise<string | null>;
  writeKey(key: string): Promise<void>;
  deleteKey(): Promise<void>;
  newKey(): Promise<string>;
  seal(key: string, plaintext: string, boundTo: string): Promise<string>;
  /** Throws if the value was sealed under another key, for another name, or altered. */
  open(key: string, sealed: string, boundTo: string): Promise<string>;
}

/** Marks a sealed value. Anything else in the slot is a session from before. */
export const SEALED_PREFIX = 'gx-sealed:v1:';

/** The SecureStore entry holding the key. */
export const SESSION_KEY_NAME = 'gx.session-key';

/**
 * Say once, in the device log, why the session is not being sealed. Every
 * fallback is silent to the user by design, which also makes it invisible to
 * whoever is looking at a bug report without this.
 */
const warned = new Set<string>();
function warnOnce(reason: string, error?: unknown): void {
  if (warned.has(reason)) return;
  warned.add(reason);
  // Native errors quote the value they could not convert, which could be
  // session text. Only the rest of the message is logged.
  const detail = error instanceof Error ? error.message.replace(/'[^']*'/g, "'…'") : '';
  console.warn(`[session storage] ${reason}; keeping the session in plain AsyncStorage. ${detail}`);
}

export function createSessionStorage(backend: Backend, loadVault: () => Vault | null): SessionStorage {
  let vault: Vault | null | undefined;
  const getVault = () => {
    if (vault === undefined) {
      vault = loadVault();
      if (!vault) warnOnce('this binary has no keystore or AES module');
    }
    return vault;
  };

  let known: string | null = null;
  let creating: Promise<string> | null = null;

  /** The key, created on first use if `create`. Throws if the keystore cannot be read. */
  async function key(v: Vault, create: boolean): Promise<string | null> {
    if (known) return known;
    if (creating) return creating;
    const stored = await v.readKey();
    // Another caller may have finished while this one waited.
    if (known) return known;
    if (stored) return (known = stored);
    if (!create) return null;
    creating ??= (async () => {
      const fresh = await v.newKey();
      await v.writeKey(fresh);
      if ((await v.readKey()) !== fresh) throw new Error('The keystore did not keep the key');
      known = fresh;
      return fresh;
    })().finally(() => {
      creating = null;
    });
    return creating;
  }

  async function seal(v: Vault, name: string, value: string): Promise<string> {
    let k: string | null;
    try {
      k = await key(v, true);
    } catch {
      // A key that exists but cannot be read (an Android keystore entry that no
      // longer decrypts) will never work again. Replace it; anything sealed
      // under it is lost either way.
      await v.deleteKey().catch(() => {});
      k = await key(v, true);
    }
    const sealed = await v.seal(k as string, value, name);
    if ((await v.open(k as string, sealed, name)) !== value) throw new Error('Sealed value did not open');
    return SEALED_PREFIX + sealed;
  }

  return {
    async getItem(name) {
      const stored = await backend.getItem(name);
      if (stored == null) return null;
      const v = getVault();
      if (!v) return stored;

      if (!stored.startsWith(SEALED_PREFIX)) {
        // Saved before sealing existed. Seal it now; if that fails it stays as it was.
        try {
          await backend.setItem(name, await seal(v, name, stored));
        } catch (error) {
          // Kept in plain text, tried again on the next read.
          warnOnce('sealing an existing session failed', error);
        }
        return stored;
      }

      let k: string | null;
      try {
        k = await key(v, false);
      } catch {
        return null; // cannot read the keystore right now; keep the value
      }
      try {
        if (!k) throw new Error('no key');
        return await v.open(k, stored.slice(SEALED_PREFIX.length), name);
      } catch {
        // Sealed under a key this device no longer has, or altered: it can
        // never be opened, so it is dropped and the user signs in again.
        await backend.removeItem(name).catch(() => {});
        return null;
      }
    },

    async setItem(name, value) {
      const v = getVault();
      if (v) {
        try {
          await backend.setItem(name, await seal(v, name, value));
          return;
        } catch (error) {
          // Fall through: stored in plain text rather than lost (see header).
          warnOnce('sealing failed', error);
        }
      }
      await backend.setItem(name, value);
    },

    async removeItem(name) {
      await backend.removeItem(name);
    },
  };
}

/** Base64 to bytes, with the runtime's own `atob`. */
function base64ToBytes(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** SecureStore for the key, expo-crypto's AES-GCM for the values. */
export function expoVault(SecureStore: typeof SecureStoreModule, Crypto: typeof CryptoModule): Vault {
  // Excluded from iCloud Keychain, from backups and from device migration, and
  // readable whenever the app is running. Android ignores it; its Keystore keys
  // never leave the device.
  const options = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
  const utf8 = new TextEncoder();
  const text = new TextDecoder();

  let imported: { encoded: string; key: Promise<CryptoModule.AESEncryptionKey> } | null = null;
  const importKey = (encoded: string) => {
    if (imported?.encoded !== encoded) {
      imported = { encoded, key: Crypto.AESEncryptionKey.import(encoded, 'base64') };
    }
    return imported.key;
  };

  return {
    readKey: () => SecureStore.getItemAsync(SESSION_KEY_NAME, options),
    writeKey: (k) => SecureStore.setItemAsync(SESSION_KEY_NAME, k, options),
    deleteKey: () => SecureStore.deleteItemAsync(SESSION_KEY_NAME, options),
    async newKey() {
      const k = await Crypto.AESEncryptionKey.generate(Crypto.AESKeySize.AES256);
      return k.encoded('base64');
    },
    async seal(k, plaintext, boundTo) {
      const sealed = await Crypto.aesEncryptAsync(utf8.encode(plaintext), await importKey(k), {
        additionalData: utf8.encode(boundTo),
      });
      return sealed.combined('base64');
    },
    async open(k, sealed, boundTo) {
      // Bytes, not the base64 string: Android's native `fromCombined` refuses a
      // string ("Value is a string, expected an Object"), although the types and
      // the web implementation accept one. Found on the emulator.
      const data = Crypto.AESSealedData.fromCombined(base64ToBytes(sealed));
      const bytes = await Crypto.aesDecryptAsync(data, await importKey(k), {
        additionalData: utf8.encode(boundTo),
        output: 'bytes',
      });
      return text.decode(bytes);
    },
  };
}

/**
 * The vault, if this binary has both native modules; null if it predates them.
 * `lookup` is a parameter only so a test can play an older binary.
 */
export function loadVault(lookup: (name: string) => unknown = requireOptionalNativeModule): Vault | null {
  if (!lookup('ExpoSecureStore') || !lookup('ExpoCrypto') || !lookup('ExpoCryptoAES')) return null;
  try {
    // Required, not imported: an import would run on older binaries too.
    /* eslint-disable @typescript-eslint/no-require-imports */
    return expoVault(
      require('expo-secure-store') as typeof SecureStoreModule,
      require('expo-crypto') as typeof CryptoModule,
    );
    /* eslint-enable @typescript-eslint/no-require-imports */
  } catch {
    return null;
  }
}

/** The storage the mobile Supabase client keeps its session in. */
export const sealedSessionStorage: SessionStorage = createSessionStorage(AsyncStorage, () => loadVault());
