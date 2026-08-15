/**
 * Native SFX playback.
 *
 * Sound on mobile was a documented no-op for a long time — the hook honoured the
 * setting and then did nothing, because the web synth is WebAudio and has no
 * files. The recipes now live in `@gameexplorer/shared` and are pre-rendered to
 * WAV by `scripts/render-sfx.mjs`; this covers the playback layer over them.
 *
 * `expo-audio` is mocked globally in jest.setup.js (it touches a native module
 * at import), and the mock deliberately leaves `currentTime` at the end of the
 * clip after `play()` so the rewind path is exercised for real.
 */
import { SFX_EVENTS } from '@gameexplorer/shared';
import { playSfx, releaseSfx } from '../audio/sfxPlayer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const audio = require('expo-audio') as {
  createAudioPlayer: jest.Mock;
  setAudioModeAsync: jest.Mock;
  __players: { play: jest.Mock; seekTo: jest.Mock; remove: jest.Mock; currentTime: number }[];
};

beforeEach(() => {
  releaseSfx();
  audio.__players.length = 0;
  audio.createAudioPlayer.mockClear();
  audio.setAudioModeAsync.mockClear();
});

describe('playSfx', () => {
  it('plays the requested effect', () => {
    playSfx('move');
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(audio.__players[0].play).toHaveBeenCalledTimes(1);
  });

  it('reuses one player per event instead of allocating on every move', () => {
    playSfx('move');
    playSfx('move');
    playSfx('move');
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(audio.__players[0].play).toHaveBeenCalledTimes(3);
  });

  it('rewinds before a repeat, or the second play would be silent', () => {
    playSfx('capture');
    const player = audio.__players[0];
    expect(player.seekTo).not.toHaveBeenCalled(); // fresh player is already at 0

    playSfx('capture');
    expect(player.seekTo).toHaveBeenCalledWith(0);
  });

  it('keeps separate players for separate events', () => {
    playSfx('move');
    playSfx('capture');
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(2);
  });

  it('has a real asset behind every event the shared recipes declare', () => {
    // A missing entry in the player's static require map would be a runtime
    // crash on that one sound only — exactly the kind of gap a device pass
    // misses because nobody castled during the test.
    for (const event of SFX_EVENTS) {
      expect(() => playSfx(event)).not.toThrow();
    }
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(SFX_EVENTS.length);
  });

  it('configures the audio session once, not per sound', () => {
    playSfx('move');
    playSfx('win');
    expect(audio.setAudioModeAsync).toHaveBeenCalledTimes(1);
    // Short blips must not silence the user's music or vanish on a locked ringer.
    expect(audio.setAudioModeAsync).toHaveBeenCalledWith(
      expect.objectContaining({ playsInSilentMode: true, shouldPlayInBackground: false }),
    );
  });
});
