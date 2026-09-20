import type { Metadata } from 'next';
import { GAME_LIST } from '@gameexplorer/shared';
import { PlayPicker } from '@/components/play/PlayPicker';

export const metadata: Metadata = {
  title: 'Play — GameExplorer',
  description:
    'Pick a game, choose how you want to play it, and start. Chess, checkers, reversi, Go and Liquidate, free and with no sign-up.',
};

/**
 * `/play` — the navigation's Play.
 *
 * Static. Everything that depends on this browser — the unfinished game, the
 * setup last chosen, whether anyone is signed in, and the `?game=` a link may
 * carry — is read after mount by `PlayPicker`. Reading `?game=` here instead
 * would be enough on its own to make the route server-rendered on demand, for
 * a preference that the page can apply a frame later without anyone noticing.
 */
export default function PlayPage() {
  return (
    <div className="min-h-svh pt-16">
      <div className="container mx-auto max-w-2xl px-4 pt-4 pb-12">
        <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">Play</h1>
        <p className="mt-0.5 text-fg-muted">{GAME_LIST.map((entry) => entry.name).join(' · ')}</p>
        <div className="mt-5">
          <PlayPicker />
        </div>
      </div>
    </div>
  );
}
