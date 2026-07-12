/* global jest */
// Official in-memory AsyncStorage mock — the mock file only exports the
// implementation, so it must be registered here (per the async-storage docs).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
