import type { Metadata } from 'next';
import Link from 'next/link';
import { GradientText } from '@/components/visual';
import { SUPPORT_EMAIL } from '@/lib/support';

export const metadata: Metadata = {
  title: 'Delete Your Account — GameExplorer',
  description:
    'How to delete your GameExplorer account and the data attached to it, in the app or by request.',
};

const REQUEST_SUBJECT = 'GameExplorer — Account deletion request';

/**
 * The account-deletion URL Google Play requires from any app that lets users
 * create an account (Play Console → App content → Data safety). Two hard
 * constraints from that policy, so don't "improve" them away:
 *   1. It must be reachable WITHOUT signing in — a Play reviewer never logs in.
 *      So this is a static server page with no auth gate and no useAuth call.
 *   2. It must state what is deleted vs. retained, not just link to Settings.
 * Keep the deleted/retained lists in sync with apps/api account.service.ts —
 * that service is the actual behaviour this page describes.
 */
export default function DeleteAccountPage() {
  return (
    // pt-16 clears the fixed nav, the same shell every other page uses.
    <div className="relative min-h-screen pt-16">
      <main className="max-w-2xl mx-auto px-6 py-14">
        <h1 className="text-3xl font-bold mb-2">
          <GradientText>Delete Your Account</GradientText>
        </h1>
        <p className="text-fg-muted text-sm mb-10">Last updated: July 31, 2026</p>

        <div className="space-y-8 text-fg-muted leading-relaxed">
          <section>
            <p>
              This page explains how to delete your GameExplorer account — the one you use on the
              website and in the GameExplorer app for iOS and Android — and exactly what happens to
              your data when you do. Deleting is permanent and takes effect immediately.
            </p>
            <p className="mt-3">
              If you played as a guest, you don&apos;t have an account and there is nothing to
              delete: guest bot games and pass-and-play games are never uploaded.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">Delete it yourself (fastest)</h2>
            <p className="mb-3">
              You can delete your account from any platform, and it applies everywhere — the
              account is the same one on web, iOS and Android.
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="text-fg">On the web.</span> Sign in, open{' '}
                <Link href="/settings" className="text-info hover:text-info-hover underline">
                  Settings
                </Link>
                , scroll to <span className="text-fg">Danger zone</span>, choose{' '}
                <span className="text-fg">Delete account…</span>, then type{' '}
                <span className="font-mono font-semibold text-fg">DELETE</span> to confirm.
              </li>
              <li>
                <span className="text-fg">In the mobile app.</span> Sign in, open{' '}
                <span className="text-fg">Settings → Delete account</span>, and confirm the same
                way.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">
              Request deletion instead (locked out?)
            </h2>
            <p>
              If you can&apos;t sign in — lost device, lost access to the email or Google, Facebook
              or Apple account you signed up with — email{' '}
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(REQUEST_SUBJECT)}`}
                className="text-info hover:text-info-hover underline"
              >
                {SUPPORT_EMAIL}
              </a>{' '}
              from the address on the account, or tell us the username. We will confirm it&apos;s
              your account before deleting anything, and complete the request within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">What gets deleted</h2>
            <p className="mb-3">All of it, permanently, with no recovery:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="text-fg">Your profile</span> — username, avatar and profile row
              </li>
              <li>
                <span className="text-fg">Your sign-in</span> — the account itself, including the
                email address and any linked Google, Facebook or Apple sign-in
              </li>
              <li>
                <span className="text-fg">Your games</span> — every saved game and its moves, for
                chess, checkers and reversi
              </li>
              <li>
                <span className="text-fg">Your ratings</span> — Elo and stats for all games
              </li>
              <li>
                <span className="text-fg">Your social graph</span> — friendships, blocks, and any
                reports you filed or that named you
              </li>
            </ul>
            <p className="mt-3">
              Preferences stored on your device (sound, haptics, reduced motion, board options) are
              never uploaded in the first place. Deleting the app, or clearing your browser&apos;s
              site data, removes those.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">What we keep, and why</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <span className="text-fg">Your username in other players&apos; game history.</span>{' '}
                If you played against someone, their copy of that finished game still names the
                opponent they faced. We can&apos;t erase it without corrupting their history — this
                is how finished games work on other game platforms too. No other detail about you
                is attached to it.
              </li>
              <li>
                <span className="text-fg">Short-term database backups.</span> Our database provider
                keeps rolling backups for disaster recovery. Deleted data can survive in those
                until they roll over, and they are never used to restore a deleted account.
              </li>
            </ul>
            <p className="mt-3">
              We do not keep a copy of your account for marketing, analytics or resale — there are
              no ad networks or advertising trackers in GameExplorer on any platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">Starting over</h2>
            <p>
              Nothing stops you signing up again later, and your old username is released when the
              account is deleted. A new account starts from scratch: no games, no ratings, no
              friends.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg mb-2">Questions</h2>
            <p>
              Anything about your data, including deletion:{' '}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="text-info hover:text-info-hover underline"
              >
                {SUPPORT_EMAIL}
              </a>
              . See also our{' '}
              <Link href="/privacy" className="text-info hover:text-info-hover underline">
                Privacy Policy
              </Link>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
