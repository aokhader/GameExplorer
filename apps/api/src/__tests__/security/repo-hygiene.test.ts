// Security audit v2, GX-14: the repository is public, and before Wave 6 its
// ignore rules let 9 of 14 likely credential files be committed. The Play
// service-account key was kept out only because its name happened to end in
// "auth.json". Git is asked directly, for files that do not exist, so the
// answer is the one a careless `git add -A` would get.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { join } from 'path';

const REPO = join(__dirname, '../../../../..');

function ignored(path: string): boolean {
  const res = spawnSync('git', ['-C', REPO, 'check-ignore', '-q', path]);
  if (res.error) throw res.error;
  // 0 = ignored, 1 = not ignored, anything else = git itself failed.
  if (res.status !== 0 && res.status !== 1) throw new Error(`git check-ignore exited ${res.status}`);
  return res.status === 0;
}

const CREDENTIALS = [
  'apps/mobile/google-services.json',
  'apps/mobile/GoogleService-Info.plist',
  'apps/mobile/credentials.json',
  'apps/mobile/AuthKey_ABC123.p8',
  'apps/mobile/dist.p12',
  'apps/mobile/release.keystore',
  'apps/mobile/release.jks',
  'apps/mobile/.env.production',
  'apps/api/.env.production',
  'apps/api/.env',
  'apps/web/.env.production',
  'secrets.json',
  'apps/mobile/gameexplorergstoreoauth.json',
  'apps/mobile/play-service-account.json',
  'apps/api/signing.key',
  'apps/api/server.pem',
  'packages/db/.env',
];

describe('credential files', () => {
  it.each(CREDENTIALS)('%s cannot be committed by accident', (path) => {
    expect(ignored(path)).toBe(true);
  });

  it('still lets the example environment file be committed', () => {
    expect(ignored('apps/api/.env.example')).toBe(false);
  });
});
