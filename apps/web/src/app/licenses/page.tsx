import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Open Source & Licenses — GameExplorer',
  description:
    'The open-source software GameExplorer is built on, and the licenses it is distributed under.',
};

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
    <div className="relative min-h-svh pt-16">
      <main className="max-w-2xl mx-auto px-6 pt-6 pb-12">
        <h1 className="text-3xl font-bold mb-2">
          Open Source &amp; Licenses
        </h1>
        <p className="text-fg-muted text-sm mb-10">Last updated: September 24, 2026</p>

        <div className="space-y-8 text-fg-muted leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">GameExplorer itself</h2>
            <p>
              GameExplorer&apos;s own source code — the website, the iOS/Android app, and the game
              server — is released under the <span className="text-fg">MIT License</span> and is
              available at <Link href={SOURCE_REPO_URL}>github.com/aokhader/GameExplorer</Link>. The
              GameExplorer name and logo are excluded; forks need their own identity.
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
                <Link href="https://github.com/jdart1/Fathom">Fathom</Link> tablebase probing code
                (Copyright © 2013–2018 Ronald de Man, © 2015 basil00, © 2016–2025 Jon Dart). Both are
                MIT-licensed, which is what lets the same engine ship on Google Play and the Apple App
                Store. The app&apos;s complete notices are in the app itself, under Settings → Open
                source.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">Artwork</h2>
            <p>
              The chess piece shapes are derived from the &ldquo;Merida&rdquo; set published in the{' '}
              <Link href="https://sashite.dev/assets/chess/">Sashité chess assets</Link>, released
              into the public domain under CC0 1.0 Universal. No attribution is required — this note
              is a courtesy. The metallic coloring applied to them is GameExplorer&apos;s own.
            </p>
            <p className="mt-2">
              The interface icons on both platforms are path data from{' '}
              <Link href="https://github.com/phosphor-icons/core">Phosphor Icons</Link> 2.1.1
              (Copyright © 2023 Phosphor Icons), used under the{' '}
              <Link href={`${SOURCE_REPO_URL}/blob/main/LICENSES/phosphor-icons-MIT.txt`}>
                MIT License
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">Fonts</h2>
            <p>
              DM Sans (Copyright 2014 The DM Sans Project Authors), Space Grotesk (Copyright 2020 The
              Space Grotesk Project Authors), Spectral (Copyright 2017 The Spectral Project Authors)
              and Nunito Sans (Copyright 2016 The Nunito Sans Project Authors) are licensed under the{' '}
              <Link href={`${SOURCE_REPO_URL}/blob/main/LICENSES/OFL-1.1.txt`}>
                SIL Open Font License 1.1
              </Link>
              . This website serves them itself; the mobile app bundles them.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">Puzzle content</h2>
            <p>
              Chess puzzles whose source line names a Lichess puzzle id are derived from the{' '}
              <Link href="https://database.lichess.org/#puzzles">
                Lichess open puzzle database
              </Link>
              , released by Lichess under CC0 1.0 Universal. No attribution is required — the
              credit shown on each puzzle, and this note, are a courtesy. The positions come from
              games played by Lichess users; the difficulty bands, the calibration and the wording
              of each prompt are GameExplorer&apos;s own.
            </p>
            <p className="mt-2">
              Every other puzzle — all checkers, reversi and Go problems, and the chess puzzles
              credited to GameExplorer — was composed or engine-generated for this app.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">Reserved usernames</h2>
            <p>
              Part of the list of names no account may take — words like &ldquo;admin&rdquo;,
              &ldquo;support&rdquo; and &ldquo;nobody&rdquo; — is selected from{' '}
              <Link href="https://github.com/marteinn/The-Big-Username-Blocklist">
                The Big Username Blocklist
              </Link>{' '}
              (Copyright © 2015–2021 Martin Sandström), used under the{' '}
              <Link href={`${SOURCE_REPO_URL}/blob/main/LICENSES/big-username-blocklist-MIT.txt`}>
                MIT License
              </Link>
              . The rest of the list is GameExplorer&apos;s own.
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
