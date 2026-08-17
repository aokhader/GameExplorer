import type { Metadata } from 'next';
import Link from 'next/link';
import { GradientText } from '@/components/visual';

export const metadata: Metadata = {
  title: 'Privacy Policy — GameExplorer',
  description: 'How GameExplorer handles your data on the web and in the mobile app.',
};

/**
 * The privacy policy for both the web app and the iOS/Android app — the URL
 * both app stores require. Static prose; keep it in sync with what the product
 * actually collects (auth email, username, games, ratings, block/report, and
 * the chat/emotes that online play relays but never stores).
 *
 * **This has to match the stores' data-safety declarations.** The Play
 * Data-safety form and Apple's App Privacy answers are filled from this page —
 * see `project-docs/store-submission.md`. If what the product collects changes,
 * this page, that document and the console declarations all move together.
 */
export default function PrivacyPage() {
  return (
    // pt-16 clears the fixed nav, the same shell every other page uses.
    <div className="relative min-h-screen pt-16">
      <main className="max-w-2xl mx-auto px-6 py-14">
        <h1 className="text-3xl font-bold mb-2">
          <GradientText>Privacy Policy</GradientText>
        </h1>
        <p className="text-fg-muted text-sm mb-10">Last updated: August 17, 2026</p>

        <div className="space-y-8 text-fg-muted leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">What this covers</h2>
            <p>
              This policy covers GameExplorer on the web and the GameExplorer app for iOS and
              Android. Both are the same service: play chess, checkers, reversi, Go and Liquidate
              against bots, against someone on the same device, or against people online. The rules
              for using it are in the{' '}
              <Link href="/terms" className="text-info hover:text-info-hover underline">
                Terms of Service
              </Link>
              .
            </p>
            <p className="mt-3">
              You can play almost all of it as a guest, and a guest is not asked for anything at
              all.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">What we collect</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="text-fg">Account details.</span> If you create an account: your
                email address, a username, and (for Google sign-in) the basic profile Google
                shares. You can play as a guest without any of this.
              </li>
              <li>
                <span className="text-fg">Game activity.</span> Games you finish while signed in —
                moves, result, opponent name, and your ratings — so your history and Elo work
                across devices.
              </li>
              <li>
                <span className="text-fg">Online chat and emotes.</span> Online games include a
                chat box and a fixed set of emotes. These are passed straight through the game
                server to the people in that game and are{' '}
                <span className="text-fg">never written to our database</span> — once the game is
                over the messages are gone from our side. Anyone in the game, including spectators,
                can see them, and the other player&apos;s device may keep its own copy.
              </li>
              <li>
                <span className="text-fg">Safety reports.</span> If you block someone we store that
                block so matchmaking can enforce it. If you report someone we store who you
                reported, the reason, the game it happened in, and anything you type in the
                description box.
              </li>
              <li>
                <span className="text-fg">Performance metrics (web only).</span> The website
                collects anonymous page-performance metrics (Vercel Speed Insights). No advertising
                trackers, no ad networks, no selling of data — on either platform.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">What stays on your device</h2>
            <p>
              Preferences (sound, haptics, reduced motion, board options) and your last-played game
              are stored locally on your device and never leave it. Casual bot games and
              pass-and-play games played as a guest are not uploaded anywhere.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">How long it&apos;s kept</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="text-fg">Games.</span> We keep your{' '}
                <span className="text-fg">10 most recent games per game type</span>. Older ones are
                deleted automatically as you play — this is a free-tier storage limit, not an
                archive, so please don&apos;t treat your history here as permanent.
              </li>
              <li>
                <span className="text-fg">Chat and emotes.</span> Not stored at all — they exist
                only for as long as it takes to deliver them.
              </li>
              <li>
                <span className="text-fg">Account, profile and ratings.</span> Kept until you delete
                your account.
              </li>
              <li>
                <span className="text-fg">Blocks and reports.</span> Kept until you delete your
                account, or until a report is resolved.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">Where data lives</h2>
            <p>
              Three companies handle data on our behalf, and that is the complete list:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-3">
              <li>
                <span className="text-fg">Supabase</span> — the database and sign-in provider.
                Accounts, profiles, games, ratings, blocks and reports are stored here.
              </li>
              <li>
                <span className="text-fg">Vercel</span> — hosts the website, and provides the
                anonymous performance metrics above.
              </li>
              <li>
                <span className="text-fg">Render</span> — runs the game server that online matches
                connect to. It relays moves, clocks, chat and emotes; it does not store them.
              </li>
            </ul>
            <p className="mt-3">
              They process this data only to run the service, never for their own purposes. Nothing
              is sold, and nothing is shared with advertisers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">Deleting your account</h2>
            <p>
              You can delete your account at any time — in the mobile app under{' '}
              <span className="text-fg">Settings → Delete account</span>, or on the web at{' '}
              <a href="/settings" className="text-info hover:text-info-hover underline">
                Settings
              </a>{' '}
              (Danger Zone). Deletion removes your profile, games, ratings, friendships, blocks and
              reports, then the account itself. One note: if you played against other people, your
              username remains in <em>their</em> game history rows, the same way finished games
              work on other game platforms. Full details, including how to request deletion if you
              can&apos;t sign in, are on the{' '}
              <a href="/delete-account" className="text-info hover:text-info-hover underline">
                account deletion page
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">Children</h2>
            <p>
              GameExplorer is not directed at children under 13, and we do not knowingly collect
              personal information from them.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">Contact</h2>
            <p>
              Questions or requests about your data:{' '}
              <a
                href="mailto:gameexploreradmin@gmail.com"
                className="text-info hover:text-info-hover underline"
              >
                gameexploreradmin@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
