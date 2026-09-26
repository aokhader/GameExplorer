import { readFileSync } from 'fs';
import { join } from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import type * as SecureStoreModule from 'expo-secure-store';
import {
  createSessionStorage,
  expoVault,
  loadVault,
  SEALED_PREFIX,
  SESSION_KEY_NAME,
  type Vault,
} from '@gameexplorer/db/src/sessionStorage.native';

/**
 * The mobile session at rest (security audit v2, GX-22).
 *
 * The Supabase session — refresh token, access token, the user and their email
 * — used to sit in AsyncStorage in plain text, which device backups and
 * phone-to-phone transfer copy. It is now sealed with AES-256-GCM under a key
 * kept in the platform keystore.
 *
 * The AES here is the real thing: expo-crypto's own wrapper, with its native
 * half swapped for the web implementation, which runs on Node's WebCrypto. Only
 * the keystore is faked.
 */
jest.mock('expo-crypto/build/aes/ExpoCryptoAES', () => {
  const web = jest.requireActual('expo-crypto/build/aes/ExpoCryptoAES.web').default;
  // Android's native `fromCombined` refuses a base64 string, though the types
  // and this web implementation take one. That sealed every session and then
  // failed to open it again — found on the emulator, invisible here until the
  // double was made as strict as the device.
  const fromCombined = web.SealedData.fromCombined.bind(web.SealedData);
  web.SealedData.fromCombined = (combined: unknown, config?: unknown) => {
    if (typeof combined === 'string') throw new Error('Value is a string, expected an Object');
    return fromCombined(combined, config);
  };
  return { __esModule: true, default: web };
});

if (!globalThis.crypto?.subtle) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Object.defineProperty(globalThis, 'crypto', { value: require('crypto').webcrypto, configurable: true });
}

const THIS_DEVICE_ONLY = 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY';

/** An in-memory keystore that can be made unreadable, like a real one on a bad day. */
function fakeSecureStore() {
  const items = new Map<string, string>();
  const state = { unreadable: false };
  const store = {
    AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: THIS_DEVICE_ONLY,
    getItemAsync: jest.fn(async (name: string) => {
      if (state.unreadable) throw new Error('Could not decrypt the value');
      return items.get(name) ?? null;
    }),
    setItemAsync: jest.fn(async (name: string, value: string) => {
      items.set(name, value);
    }),
    deleteItemAsync: jest.fn(async (name: string) => {
      items.delete(name);
    }),
  };
  return { store: store as unknown as typeof SecureStoreModule, mock: store, items, state };
}

const SLOT = 'sb-projectref-auth-token';
const VERIFIER_SLOT = 'sb-projectref-auth-token-code-verifier';
const SESSION = JSON.stringify({
  access_token: 'eyJhbGciOiJFUzI1NiJ9.payload.signature',
  refresh_token: 'refresh-SECRET-abc123',
  expires_at: 1_900_000_000,
  user: { id: 'u-1', email: 'player@example.com', user_metadata: { full_name: 'Zoë Ünicode' } },
});

let keystore: ReturnType<typeof fakeSecureStore>;
let vault: Vault;
const storage = () => createSessionStorage(AsyncStorage, () => vault);
const raw = (name = SLOT) => AsyncStorage.getItem(name);

let warn: jest.SpyInstance;

beforeEach(async () => {
  await AsyncStorage.clear();
  keystore = fakeSecureStore();
  vault = expoVault(keystore.store, Crypto);
  // The fallbacks say why in the device log; here that is expected noise.
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => warn.mockRestore());

describe('the session is sealed at rest (GX-22)', () => {
  it('round-trips exactly, non-ASCII included', async () => {
    const s = storage();
    await s.setItem(SLOT, SESSION);

    expect(await s.getItem(SLOT)).toBe(SESSION);
    // A second storage over the same device: nothing held in memory.
    expect(await storage().getItem(SLOT)).toBe(SESSION);
  });

  it('leaves no token, email or JSON in what AsyncStorage holds', async () => {
    await storage().setItem(SLOT, SESSION);
    const stored = (await raw()) as string;

    expect(stored.startsWith(SEALED_PREFIX)).toBe(true);
    for (const secret of ['refresh_token', 'refresh-SECRET-abc123', 'eyJhbGci', 'player@example.com', '{']) {
      expect(stored).not.toContain(secret);
    }
  });

  it('keeps the key in the keystore, this device only, and nowhere in AsyncStorage', async () => {
    await storage().setItem(SLOT, SESSION);

    expect(keystore.mock.setItemAsync).toHaveBeenCalledTimes(1);
    expect(keystore.mock.setItemAsync).toHaveBeenCalledWith(SESSION_KEY_NAME, expect.any(String), {
      keychainAccessible: THIS_DEVICE_ONLY,
    });
    const key = keystore.items.get(SESSION_KEY_NAME) as string;
    expect(key).toMatch(/^[A-Za-z0-9+/]{43}=$/); // 256 bits, base64
    const everything = await AsyncStorage.multiGet(await AsyncStorage.getAllKeys());
    expect(JSON.stringify(everything)).not.toContain(key);
  });

  it('seals each write afresh, so equal sessions do not look equal', async () => {
    const s = storage();
    await s.setItem(SLOT, SESSION);
    const first = await raw();
    await s.setItem(SLOT, SESSION);

    expect(await raw()).not.toBe(first);
  });

  it('removes', async () => {
    const s = storage();
    await s.setItem(SLOT, SESSION);
    await s.removeItem(SLOT);

    expect(await raw()).toBeNull();
    expect(await s.getItem(SLOT)).toBeNull();
  });
});

describe('what it has to survive', () => {
  it('an existing install: a plain-text session still signs in, and is sealed on the spot', async () => {
    await AsyncStorage.setItem(SLOT, SESSION); // written by the previous version

    expect(await storage().getItem(SLOT)).toBe(SESSION);
    expect(((await raw()) as string).startsWith(SEALED_PREFIX)).toBe(true);
    expect(await storage().getItem(SLOT)).toBe(SESSION);
  });

  it('a restore onto another phone: the key is not there, so the user signs in again', async () => {
    await storage().setItem(SLOT, SESSION);
    keystore.items.clear(); // what a backup or a transfer does not carry

    await expect(storage().getItem(SLOT)).resolves.toBeNull();
    expect(await raw()).toBeNull();
  });

  it('an altered value is refused and dropped', async () => {
    await storage().setItem(SLOT, SESSION);
    const stored = (await raw()) as string;
    const body = stored.slice(SEALED_PREFIX.length);
    const flipped = body.slice(0, 20) + (body[20] === 'A' ? 'B' : 'A') + body.slice(21);
    await AsyncStorage.setItem(SLOT, SEALED_PREFIX + flipped);

    await expect(storage().getItem(SLOT)).resolves.toBeNull();
    expect(await raw()).toBeNull();
  });

  it('a sealed value moved into another slot will not open there', async () => {
    const s = storage();
    await s.setItem(VERIFIER_SLOT, 'pkce-verifier');
    await s.setItem(SLOT, SESSION);
    await AsyncStorage.setItem(VERIFIER_SLOT, (await raw(SLOT)) as string);

    expect(await storage().getItem(VERIFIER_SLOT)).toBeNull();
  });

  it('a keystore that cannot be read right now: nothing is returned, and nothing is thrown away', async () => {
    await storage().setItem(SLOT, SESSION);
    const sealed = await raw();
    keystore.state.unreadable = true;

    await expect(storage().getItem(SLOT)).resolves.toBeNull();
    expect(await raw()).toBe(sealed);

    keystore.state.unreadable = false;
    expect(await storage().getItem(SLOT)).toBe(SESSION);
  });

  it('a keystore entry that will never read again is replaced on the next sign-in', async () => {
    await storage().setItem(SLOT, SESSION);
    const s = storage();
    keystore.state.unreadable = true;
    keystore.mock.deleteItemAsync.mockImplementationOnce(async (name: string) => {
      keystore.items.delete(name);
      keystore.state.unreadable = false;
    });
    await s.setItem(SLOT, SESSION);

    expect(keystore.mock.deleteItemAsync).toHaveBeenCalledWith(SESSION_KEY_NAME, expect.anything());
    expect(((await raw()) as string).startsWith(SEALED_PREFIX)).toBe(true);
    expect(await storage().getItem(SLOT)).toBe(SESSION);
  });

  it('the first writes, all at once, agree on one key', async () => {
    const s = storage();
    const slots = ['a', 'b', 'c', 'd', 'e'];
    await Promise.all(slots.map((slot) => s.setItem(slot, `value-${slot}`)));

    expect(keystore.mock.setItemAsync).toHaveBeenCalledTimes(1);
    const fresh = storage();
    for (const slot of slots) expect(await fresh.getItem(slot)).toBe(`value-${slot}`);
  });

  it('a keystore that will not seal: the session is kept in plain text rather than lost', async () => {
    const broken: Vault = { ...vault, seal: () => Promise.reject(new Error('keystore failure')) };
    const s = createSessionStorage(AsyncStorage, () => broken);
    await s.setItem(SLOT, SESSION);

    expect(await raw()).toBe(SESSION);
    expect(await s.getItem(SLOT)).toBe(SESSION);
  });

  /**
   * The failure that would hurt most: a value that seals but will not open is
   * dropped on the next read, so the user would be signed out on every launch.
   * Native AES only runs on a device, so the storage checks each seal itself.
   */
  it('a cipher that seals but will not open: plain text, never a sign-out loop', async () => {
    const lopsided: Vault = { ...vault, open: () => Promise.reject(new Error('cannot open')) };
    const s = createSessionStorage(AsyncStorage, () => lopsided);
    await s.setItem(SLOT, SESSION);

    expect(await raw()).toBe(SESSION);
    expect(await createSessionStorage(AsyncStorage, () => lopsided).getItem(SLOT)).toBe(SESSION);
  });

  it('a keystore that does not keep the key: plain text, never a sign-out loop', async () => {
    keystore.mock.setItemAsync.mockImplementation(async () => {}); // accepts, keeps nothing
    await storage().setItem(SLOT, SESSION);

    expect(await raw()).toBe(SESSION);
    expect(await storage().getItem(SLOT)).toBe(SESSION);
  });

  it('says why in the device log, without the session in it', async () => {
    let fresh!: typeof import('@gameexplorer/db/src/sessionStorage.native');
    jest.isolateModules(() => {
      // A fresh module: each reason is logged once per app run.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      fresh = require('@gameexplorer/db/src/sessionStorage.native');
    });
    // Native conversion errors quote the value they choked on.
    const quoting: Vault = {
      ...vault,
      seal: (_k, plaintext) => Promise.reject(new Error(`Cannot convert '${plaintext}' to an Object`)),
    };
    await fresh.createSessionStorage(AsyncStorage, () => quoting).setItem(SLOT, SESSION);

    expect(warn).toHaveBeenCalledTimes(1);
    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('sealing failed');
    expect(logged).not.toContain('refresh-SECRET');
    expect(logged).not.toContain('player@example.com');
  });
});

describe('older binaries, which an over-the-air update can reach', () => {
  it('without either native module there is no vault, and nothing is required', () => {
    const present = (names: string[]) => (name: string) => (names.includes(name) ? {} : null);

    expect(loadVault(present([]))).toBeNull();
    expect(loadVault(present(['ExpoSecureStore']))).toBeNull();
    expect(loadVault(present(['ExpoCrypto', 'ExpoCryptoAES']))).toBeNull();
    expect(loadVault(present(['ExpoSecureStore', 'ExpoCrypto']))).toBeNull();
    expect(loadVault(present(['ExpoSecureStore', 'ExpoCrypto', 'ExpoCryptoAES']))).not.toBeNull();
  });

  it('keep reading and writing plain AsyncStorage, as before', async () => {
    await AsyncStorage.setItem(SLOT, SESSION);
    const s = createSessionStorage(AsyncStorage, () => null);

    expect(await s.getItem(SLOT)).toBe(SESSION);
    await s.setItem(SLOT, `${SESSION} `);
    expect(await raw()).toBe(`${SESSION} `);
  });
});

describe('the Supabase client', () => {
  /**
   * Built lazily from `EXPO_PUBLIC_*` values Jest does not have, so the check
   * is on the source: the one place the session store is chosen.
   */
  it('keeps its session in the sealed storage', () => {
    const source = readFileSync(
      join(__dirname, '../../../../packages/db/src/client.native.ts'),
      'utf8',
    );

    expect(source).toMatch(/storage:\s*sealedSessionStorage\b/);
    expect(source).not.toMatch(/storage:\s*AsyncStorage\b/);
  });
});
