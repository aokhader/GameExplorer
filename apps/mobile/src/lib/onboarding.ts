import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * First-run onboarding flag (device-local). Mirrors the web `ge:onboarded`
 * localStorage flag — once the welcome tour has been seen, the home hub stops
 * redirecting there. Stored in AsyncStorage since native has no localStorage.
 */
const ONBOARDED_KEY = 'gx:onboarded';

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
