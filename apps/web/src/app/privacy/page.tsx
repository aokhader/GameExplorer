import type { Metadata } from 'next';
import { GradientText } from '@/components/visual';

export const metadata: Metadata = {
  title: 'Privacy Policy — GameExplorer',
  description: 'How GameExplorer handles your data on the web and in the mobile app.',
};

/**
 * The privacy policy for both the web app and the iOS/Android app — the URL
 * both app stores require. Static prose; keep it in sync with what the product
 * actually collects (auth email, username, games, ratings, block/report).
 */
export default function PrivacyPage() {
  return (
    // pt-16 clears the fixed nav, the same shell every other page uses.
    <div className="relative min-h-screen pt-16">
      <main className="max-w-2xl mx-auto px-6 py-14">
        <h1 className="text-3xl font-bold mb-2">
          <GradientText>Privacy Policy</GradientText>
        </h1>
        <p className="text-fg-muted text-sm mb-10">Last updated: July 11, 2026</p>

        <div className="space-y-8 text-fg-muted leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">What this covers</h2>
            <p>
              This policy covers GameExplorer on the web and the GameExplorer app for iOS and
              Android. Both are the same service: play chess, checkers and reversi against bots,
              another person, or online opponents.
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
                <span className="text-fg">Safety reports.</span> If you block or report another
                player, we store that block/report so it can be enforced.
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
            <h2 className="text-lg font-semibold text-fg mb-2">Where data lives</h2>
            <p>
              Accounts, games and ratings are stored with Supabase (our database and
              authentication provider). The web app is hosted on Vercel and the game server on
              Render. These providers process data on our behalf; none of them use it for their own
              purposes.
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
