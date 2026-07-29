/* global jest */
// Official in-memory AsyncStorage mock — the mock file only exports the
// implementation, so it must be registered here (per the async-storage docs).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// NOTE: reanimated is deliberately NOT mocked globally. Gesture-handler's
// GestureDetector reaches into reanimated's real internals (useEvent/useHandler),
// so a blanket mock breaks every gesture-driven component test. Files that need
// one opt in via `mockReanimated` — see src/__tests__/helpers/reanimatedMock.ts.
