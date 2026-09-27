import { createHash } from 'crypto';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Arasan's neural network ships inside the app. `CHECKSUMS.txt` records the
 * file checked against the arasan-chess commit it came from (cpp/arasan/
 * VENDORED.txt), and this fails if the file changes without its line or the
 * build names a network nobody checked (security audit v2, GX-23).
 */

const MODULE = join(__dirname, '../../modules/react-native-arasan');

function listed(): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of readFileSync(join(MODULE, 'CHECKSUMS.txt'), 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const match = /^([0-9a-f]{64}) {2}(\S+)$/.exec(line);
    if (!match) throw new Error(`malformed line: ${line}`);
    out.set(match[2], match[1]);
  }
  return out;
}

describe('vendored Arasan network', () => {
  it('matches its recorded checksum', () => {
    for (const [file, sha] of listed()) {
      const actual = createHash('sha256').update(readFileSync(join(MODULE, file))).digest('hex');
      expect(`${file} ${actual}`).toBe(`${file} ${sha}`);
    }
  });

  it('ships no network without a checksum', () => {
    const networks = readdirSync(join(MODULE, 'assets'))
      .filter((name) => name.endsWith('.nnue'))
      .map((name) => `assets/${name}`);
    expect(networks.sort()).toEqual([...listed().keys()].sort());
  });

  it('builds against a checked network', () => {
    const checked = [...listed().keys()];
    for (const build of ['android/CMakeLists.txt', 'host/CMakeLists.txt', 'ReactNativeArasan.podspec']) {
      const network = /NETWORK=(\S+\.nnue)/.exec(readFileSync(join(MODULE, build), 'utf8'))?.[1];
      expect(checked).toContain(`assets/${network}`);
    }
  });
});
