/**
 * Jest for the mobile app (component + lib tests). Per the repo's test-runner
 * split: Vitest for pure-TS packages (packages/shared), Jest for React Native
 * surfaces — jest-expo wires the RN/Expo babel transform and module mocks.
 * Boards' gesture/reanimated flows are exercised by the Maestro e2e smoke flow
 * (.maestro/), not here.
 */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['./jest.setup.js'],
  transformIgnorePatterns: [
    // jest-expo's default allowlist, plus our workspace packages (TS source).
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|standard-navigation|@sentry/react-native|native-base|react-native-svg|@gameexplorer/.*))',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testMatch: ['**/__tests__/**/*.test.(ts|tsx)'],
};
