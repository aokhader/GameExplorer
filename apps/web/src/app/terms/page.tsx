import type { Metadata } from 'next';
import Link from 'next/link';
import { GradientText } from '@/components/visual';
import { SUPPORT_EMAIL } from '@/lib/support';

export const metadata: Metadata = {
  title: 'Terms of Service — Finesse',
  description: 'The rules for using Finesse on the web and in the mobile app.',
};

/**
 * The terms of service for both the web app and the iOS/Android app.
 *
 * Both stores expect a terms URL for an app with accounts, online play and
 * user-generated content, and the app has been distributed to testers without
 * one. Signup on both platforms points here — see `apps/web/src/app/auth/signup`
 * and `apps/mobile/app/(auth)/sign-up.tsx`.
 *
 * Keep this in sync with what the product actually does. In particular the fair
 * play and community sections describe real, enforced mechanisms (ratings,
 * chat, emotes, block/report) — do not promise moderation that does not exist.
 */
export default function TermsPage() {
  return (
    // pt-16 clears the fixed nav, the same shell every other page uses.
    <div className="relative min-h-screen pt-16">
      <main className="max-w-2xl mx-auto px-6 py-14">
        <h1 className="text-3xl font-bold mb-2">
          <GradientText>Terms of Service</GradientText>
        </h1>
        <p className="text-fg-muted text-sm mb-10">Last updated: August 17, 2026</p>

        <div className="space-y-8 text-fg-muted leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">What this covers</h2>
            <p>
              These terms apply to Finesse on the web and the Finesse app for iOS and
              Android. Both are the same service: play chess, checkers, reversi, Go and Liquidate
              against bots, against someone on the same device, or against people online. By using
              Finesse — with or without an account — you agree to these terms. If you
              don&apos;t agree with them, please don&apos;t use the service.
            </p>
            <p className="mt-3">
              Finesse is a free hobby project run by one person. There are no purchases, no
              subscriptions and no advertising.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">Who can use Finesse</h2>
            <p>
              You need to be at least 13 years old. Finesse isn&apos;t directed at children
              under 13, and accounts belonging to them will be removed along with their data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">Your account</h2>
            <p>
              You can play most of Finesse as a guest. An account is what makes ratings, game
              history and online play work. When you create one:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-3">
              <li>Keep your password to yourself — you&apos;re responsible for what happens on your account.</li>
              <li>
                Pick a username other people can see next to you in a game. Usernames that
                impersonate someone else, or that would break the community rules below, can be
                reset or removed.
              </li>
              <li>
                Don&apos;t use extra accounts to get around a suspension, to manipulate ratings, or
                to dodge someone who has blocked you.
              </li>
            </ul>
            <p className="mt-3">
              You can delete your account at any time — in the app under{' '}
              <span className="text-fg">Settings → Delete account</span>, or on the web at{' '}
              <Link href="/settings" className="text-info hover:text-info-hover underline">
                Settings
              </Link>
              . What that removes is described in the{' '}
              <Link href="/privacy" className="text-info hover:text-info-hover underline">
                Privacy Policy
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">Fair play</h2>
            <p>
              Rated games move a real number on someone else&apos;s profile, so they only mean
              anything if both sides play them honestly. In rated games against another person:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-3">
              <li>
                Don&apos;t use a chess engine, a solver, another person, or any other outside help
                to choose your moves. Finesse&apos;s own analysis, training hints and puzzles
                are there to learn from between games — training hints already cost you rating
                points, which is the trade they&apos;re meant to be.
              </li>
              <li>
                Don&apos;t deliberately lose, stall, or arrange results to move a rating — yours or
                anyone else&apos;s.
              </li>
              <li>
                Don&apos;t abandon games to avoid a loss. Disconnecting mid-game forfeits it after a
                short grace period, which is by design.
              </li>
            </ul>
            <p className="mt-3">
              Playing bots, training, puzzles and pass-and-play are all yours to do however you
              like — none of that affects another player.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">Community rules</h2>
            <p>
              Online games include in-game chat and a fixed set of emotes. Anything you send there,
              along with your username, is visible to the person you&apos;re playing and to anyone
              spectating. Don&apos;t use them to:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-3">
              <li>Harass, threaten, or abuse anyone.</li>
              <li>
                Attack people over race, ethnicity, national origin, religion, disability, gender,
                age, sexual orientation or gender identity.
              </li>
              <li>Post sexual content, or anything sexualising a minor.</li>
              <li>Spam, advertise, or link to malware or scams.</li>
              <li>Impersonate another player, or claim to speak for Finesse.</li>
              <li>Share someone else&apos;s personal information.</li>
            </ul>
            <p className="mt-3">
              Every online game has a <span className="text-fg">block</span> and{' '}
              <span className="text-fg">report</span> option on your opponent. Blocking someone also
              keeps matchmaking from pairing you with them again. Reports are read by a person, not
              a system, and the honest description of what that means for a project this size is
              that it is one person reading them — so use the block, it takes effect immediately.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">What you post</h2>
            <p>
              Your username and chat messages stay yours. By sending them you give Finesse
              permission to display them to the people you&apos;re playing with and to store them
              as needed to run the service. Content that breaks the rules above can be removed, and
              usernames can be reset.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">The service itself</h2>
            <p>
              Finesse&apos;s code, artwork and written content belong to its author, except for
              the open-source components listed on the{' '}
              <Link href="/licenses" className="text-info hover:text-info-hover underline">
                licenses page
              </Link>
              . Please don&apos;t copy the app wholesale or pass it off as your own; the source is
              public and the license there tells you what you may do with it.
            </p>
            <p className="mt-3">
              Don&apos;t attack the service: no scraping at volume, no attempts to break into other
              people&apos;s accounts, no interfering with the game server or with other
              players&apos; games.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">Availability</h2>
            <p>
              This is a hobby project on free hosting. Games, features and ratings can change, and
              the service can be slow, unavailable, or discontinued — sometimes without warning. The
              game server sleeps when idle, so the first connection after a quiet period can take
              around half a minute. Please don&apos;t rely on Finesse for anything that
              matters, and don&apos;t treat your game history here as permanent storage.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">Suspension</h2>
            <p>
              Accounts that break these terms can be suspended or removed. For anything short of
              serious or repeated abuse the first step is usually a conversation — write to the
              address below if you think something was a mistake.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">No warranty, and limits on liability</h2>
            <p>
              Finesse is provided &ldquo;as is&rdquo;, without warranties of any kind. To the
              extent the law allows, its author isn&apos;t liable for lost games, lost ratings, lost
              data, or any indirect or consequential damages arising from your use of the service.
              Nothing here limits liability that can&apos;t be limited by law, and some jurisdictions
              don&apos;t allow these exclusions — in which case they apply to you only as far as
              they legally can.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">Changes to these terms</h2>
            <p>
              These terms may change as the app does. The date at the top of this page is when they
              last changed, and continuing to use Finesse after that means the new version
              applies. Changes that meaningfully affect signed-in players will be announced in the
              app.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">Contact</h2>
            <p>
              Questions about these terms, appeals, or reports of abuse:{' '}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-info hover:text-info-hover underline"
              >
                {SUPPORT_EMAIL}
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
