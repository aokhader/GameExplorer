import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LocalStore } from '@gameexplorer/client/storage';

/**
 * AsyncStorage behind the client layer's `LocalStore` — remembered setups and
 * unfinished games.
 *
 * No `getSync`: AsyncStorage has none, so screens that read through this wait a
 * frame for `hydrated` rather than painting defaults first.
 */
export const nativeLocalStore: LocalStore = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  remove: (key) => AsyncStorage.removeItem(key),
};
