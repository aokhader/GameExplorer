import type { Metadata } from 'next';
import { GradientText } from '@/components/visual';

export const metadata: Metadata = {
  title: 'Open Source & Licenses — Finesse',
  description:
    'The open-source software Finesse is built on, and the licenses it is distributed under.',
};

// Still the GameExplorer repo: this is the MIT source offer, so it has to be a
// URL that actually resolves. Update it when the GitHub repository is renamed.
const SOURCE_REPO_URL = 'https://github.com/aokhader/GameExplorer';

function Link({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-info hover:text-info-hover underline"
    >
      {children}
    </a>
  );
}

/**
 * Public attribution page for both platforms. This is not decoration: the web
 * app serves unmodified Stockfish.js WASM builds to every visitor's browser,
 * and the GPL requires recipients be told the license and offered the
 * corresponding source.
 *
 * The conveyed work is Stockfish.js (Chess.com, LLC) — an Emscripten port of
 * Stockfish, not Stockfish itself — so under GPLv3 §6 the offer below must
 * name the port at the served version. Upstream Stockfish is credited for
 * attribution but is NOT where the corresponding source lives.
 * Keep in sync with LICENSE.md and apps/mobile/LICENSE.md.
 */
export default function LicensesPage() {
  return (
    // pt-16 clears the fixed nav, the same shell every other page uses.
    <div className="relative min-h-screen pt-16">
      <main className="max-w-2xl mx-auto px-6 py-14">
        <h1 className="text-3xl font-bold mb-2">
          <GradientText>Open Source &amp; Licenses</GradientText>
        </h1>
        <p className="text-fg-muted text-sm mb-10">Last updated: August 18, 2026</p>

        <div className="space-y-8 text-fg-muted leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">Finesse itself</h2>
            <p>
              Finesse&apos;s own source code — the website, the iOS/Android app, and the game
              server — is released under the <span className="text-fg">MIT License</span> and is
              available at <Link href={SOURCE_REPO_URL}>github.com/aokhader/GameExplorer</Link>. The
              Finesse name and logo are excluded; forks need their own identity.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">Chess engines</h2>
            <ul className="list-disc pl-5 space-y-3">
              <li>
                <span className="text-fg">Stockfish.js (this website) — GPL-3.0-or-later.</span>{' '}
                Chess bots rated 1400 and above, and the analysis board, run unmodified{' '}
                <Link href="https://github.com/nmrugg/stockfish.js">Stockfish.js</Link> 18.0.8
                builds (Copyright © 2026 Chess.com, LLC) compiled to WebAssembly, downloaded to your
                browser and run as separate Web Worker programs. Stockfish.js is free software under
                the{' '}
                <Link href="https://www.gnu.org/licenses/gpl-3.0.txt">
                  GNU General Public License v3
                </Link>
                ; its complete corresponding source, for the version served here, is available from
                the Stockfish.js project linked above. Stockfish.js is an Emscripten port of{' '}
                <Link href="https://github.com/official-stockfish/Stockfish">Stockfish</Link>{' '}
                (Copyright © T. Romstad, M. Costalba, J. Kiiski, G. Linscott and other
                contributors); the bundled neural network is by Linmiao Xu.
              </li>
              <li>
                <span className="text-fg">Arasan (mobile app) — MIT.</span> The iOS and Android app
                instead links the <Link href="https://github.com/jdart1/arasan-chess">Arasan</Link>{' '}
                engine and its NNUE network (Copyright 1994–2026 Jon Dart), together with the{' '}
                <Link href="https://github.com/jdart1/Fathom">Fathom</Link> tablebase probing code.
                Both are MIT-licensed, which is what lets the same engine ship on Google Play and the
                Apple App Store.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">Artwork</h2>
            <p>
              The chess piece shapes are derived from the &ldquo;Merida&rdquo; set published in the{' '}
              <Link href="https://sashite.dev/assets/chess/">Sashité chess assets</Link>, released
              into the public domain under CC0 1.0 Universal. No attribution is required — this note
              is a courtesy. The metallic coloring applied to them is Finesse&apos;s own.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">Everything else</h2>
            <p>
              The apps are built on Next.js, React, React Native and Expo, and a long tail of
              open-source libraries — each under its own license, recorded in the{' '}
              <code className="text-fg text-sm">package.json</code> and lockfile in the repository.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
