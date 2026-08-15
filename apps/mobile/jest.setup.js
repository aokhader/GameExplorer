/* global jest */
// Official in-memory AsyncStorage mock — the mock file only exports the
// implementation, so it must be registered here (per the async-storage docs).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// expo-audio talks to a native module at import time, so merely importing
// anything that plays a sound blows up under Jest. This is a genuine native
// boundary (unlike reanimated below, whose internals other libraries reach
// into), so a global mock is the right shape. The player's own logic — reuse
// and rewind-before-replay — is asserted against this mock in sfxPlayer.test.ts.
jest.mock('expo-audio', () => {
  const players = [];
  return {
    __players: players,
    createAudioPlayer: jest.fn(() => {
      const player = {
        currentTime: 0,
        playing: false,
        play: jest.fn(function play() {
          this.playing = true;
          // Mimic a finished clip so a repeat has to rewind, like the real one.
          this.currentTime = 1;
        }),
        pause: jest.fn(),
        seekTo: jest.fn(function seekTo(seconds) {
          this.currentTime = seconds;
          return Promise.resolve();
        }),
        remove: jest.fn(),
      };
      players.push(player);
      return player;
    }),
    setAudioModeAsync: jest.fn(() => Promise.resolve()),
  };
});

// NOTE: reanimated is deliberately NOT mocked globally. Gesture-handler's
// GestureDetector reaches into reanimated's real internals (useEvent/useHandler),
// so a blanket mock breaks every gesture-driven component test. Files that need
// one opt in via `mockReanimated` — see src/__tests__/helpers/reanimatedMock.ts.
