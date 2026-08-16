import AsyncStorage from '@react-native-async-storage/async-storage';
import { ONBOARDING_KEYS } from '@gameexplorer/shared';

/**
 * First-run onboarding flags, device-local in AsyncStorage (native has no
 * localStorage).
 *
 * The keys and what each one means live in `@gameexplorer/shared` next to the
 * tour's difficulty ladder, so the two platforms cannot document them
 * differently — including *why* the prefixes differ, which is the part that
 * looks like a bug and must not be "fixed".
 *
 * The accessors stay here rather than being shared: AsyncStorage is async and
 * web's localStorage is not, and web reads the onboarded flag synchronously in
 * its redirect effect. Sharing four one-line wrappers is not worth putting a
 * frame of the wrong screen in front of every new web visitor.
 */
const ONBOARDED_KEY = ONBOARDING_KEYS.native.onboarded;
const SAVE_PROGRESS_PENDING_KEY = ONBOARDING_KEYS.native.saveProgressPending;

export async function hasOnboarded(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDED_KEY)) === '1';
  } catch {
    // If storage is unavailable, don't trap the user in the tour on every launch.
    return true;
  }
}

export async function markOnboarded(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDED_KEY, '1');
  } catch {
    /* best-effort */
  }
}

export async function markSaveProgressPending(): Promise<void> {
  try {
    await AsyncStorage.setItem(SAVE_PROGRESS_PENDING_KEY, '1');
  } catch {
    /* best-effort */
  }
}

export async function isSaveProgressPending(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SAVE_PROGRESS_PENDING_KEY)) === '1';
  } catch {
    return false;
  }
}

/** Any choice consumes the flag, so the ask never nags. */
export async function consumeSaveProgressPending(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SAVE_PROGRESS_PENDING_KEY);
  } catch {
    /* best-effort */
  }
}
