/**
 * The version line on Settings and in a support email (security audit v2,
 * GX-08). Over-the-air updates are not code-signed, so if a bad one ever
 * ships, a user's report has to say which update they are running.
 */
import { appVersionLabel, supportMailtoUrl } from '@/config/support';

const mockUpdates: { isEnabled: boolean; isEmbeddedLaunch: boolean; updateId: string | null } = {
  isEnabled: true,
  isEmbeddedLaunch: false,
  updateId: null,
};
jest.mock('expo-updates', () => ({
  get isEnabled() {
    return mockUpdates.isEnabled;
  },
  get isEmbeddedLaunch() {
    return mockUpdates.isEmbeddedLaunch;
  },
  get updateId() {
    return mockUpdates.updateId;
  },
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '2.0.0' } },
}));

const UPDATE = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

beforeEach(() => {
  Object.assign(mockUpdates, { isEnabled: true, isEmbeddedLaunch: false, updateId: UPDATE });
});

describe('appVersionLabel', () => {
  it('names the over-the-air update the app is running, as eas update:list shows it', () => {
    expect(appVersionLabel()).toBe('2.0.0 · update 1a2b3c4d');
  });

  it('is just the version on the bundle the binary shipped with', () => {
    mockUpdates.isEmbeddedLaunch = true;
    expect(appVersionLabel()).toBe('2.0.0');
  });

  it('is just the version when updates are off, as in a development build', () => {
    Object.assign(mockUpdates, { isEnabled: false, updateId: null });
    expect(appVersionLabel()).toBe('2.0.0');
  });

  it('rides along in the pre-filled support email', () => {
    const body = decodeURIComponent(supportMailtoUrl().split('&body=')[1]);
    expect(body).toContain('App version: 2.0.0 · update 1a2b3c4d');
  });
});
