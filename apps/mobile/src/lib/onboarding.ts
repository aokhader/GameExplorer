import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * First-run onboarding flag (device-local). Mirrors the web `ge:onboarded`
 * localStorage flag — once the welcome tour has been seen, the home hub stops
 * redirecting there. Stored in AsyncStorage since native has no localStorage.
 */
const ONBOARDED_KEY = 'gx:onboarded';

/**
 * Set when a signed-out visitor starts their first game from the tour. The
 * game-result screen consumes it to show the one-time "save your progress"
 * sign-up ask — the account request comes *after* they have played, and only
 * once. Mirrors web's `ge:save-progress-pending`.
 */
const SAVE_PROGRESS_PENDING_KEY = 'gx:save-progress-pending';

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
