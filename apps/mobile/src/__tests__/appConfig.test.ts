import config from '../../app.config';

/**
 * Native settings that no screen exercises, so nothing else fails if they are
 * lost — to `expo install --fix` turning a plugin entry back into a bare
 * string, or to a template refresh.
 */
describe('app.config — where the saved session can go (security audit v2, GX-22)', () => {
  it('keeps Android out of cloud backup', () => {
    expect(config.android?.allowBackup).toBe(false);
  });

  it("applies expo-secure-store's plugin, for its transfer rules, without a Face ID prompt", () => {
    const entry = config.plugins?.find((p) => (Array.isArray(p) ? p[0] : p) === 'expo-secure-store');

    // Its Android rules keep the key file on the device and leave AsyncStorage
    // out of a phone-to-phone transfer, which `allowBackup` does not cover on
    // Android 12+. They are on unless `configureAndroidBackup` is false.
    expect(Array.isArray(entry)).toBe(true);
    const options = (entry as [string, Record<string, unknown>])[1];
    expect(options.configureAndroidBackup).not.toBe(false);
    expect(options.faceIDPermission).toBe(false);
  });
});

describe('app.config — only the permissions the app uses (security audit v2, WS7-06)', () => {
  /**
   * expo-audio's defaults declare the microphone on both platforms, an iOS
   * background audio mode and an Android foreground media service. The app
   * only plays sound effects in the foreground. A bare `'expo-audio'` entry, which
   * `expo install --fix` would happily write, turns all of it back on.
   */
  it('configures expo-audio for foreground playback only', () => {
    const entry = config.plugins?.find((p) => (Array.isArray(p) ? p[0] : p) === 'expo-audio');

    expect(Array.isArray(entry)).toBe(true);
    expect((entry as [string, Record<string, unknown>])[1]).toEqual({
      microphonePermission: false,
      recordAudioAndroid: false,
      enableBackgroundPlayback: false,
    });
  });

  it("blocks the bare template's draw-over-apps and shared-storage permissions", () => {
    expect(config.android?.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
      ]),
    );
  });

  /**
   * expo-secure-store depends on androidx.biometric, whose manifest declares
   * both. Only biometric-protected items need them, and the session key is not
   * one (sessionStorage.native.ts never passes `requireAuthentication`). Found
   * in the merged release manifest, not in any config.
   */
  it("blocks the biometric permissions secure-store's library brings", () => {
    expect(config.android?.blockedPermissions).toEqual(
      expect.arrayContaining(['android.permission.USE_BIOMETRIC', 'android.permission.USE_FINGERPRINT']),
    );
  });

  it('asks for nothing it does not use', () => {
    const declared = config.android?.permissions ?? [];
    for (const unused of ['android.permission.RECORD_AUDIO', 'android.permission.SYSTEM_ALERT_WINDOW']) {
      expect(declared).not.toContain(unused);
    }
    expect(config.ios?.infoPlist?.NSMicrophoneUsageDescription).toBeUndefined();
    expect(config.ios?.infoPlist?.UIBackgroundModes).toBeUndefined();
  });
});
