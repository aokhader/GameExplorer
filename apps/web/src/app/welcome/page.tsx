'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DIFFICULTY_ELO, TOUR_GAMES, gameNameList, type OnboardingGame } from '@gameexplorer/shared';
import { useAuth } from '@/hooks/useAuth';
import { ONBOARDED_KEY, SAVE_PROGRESS_PENDING_KEY } from '@/lib/onboarding';
import { GameIcon } from '@/components/game/GameIcon';
import { Icon, type IconName } from '@gameexplorer/ui';

// The tour's games are the rated ones (see TOUR_GAMES) — the last step picks a
// bot difficulty on a game's own ELO ladder, which only means something for a
// game whose results move a rating. `OnboardingGame` is the ladder's own key
// type, so the two cannot drift apart.
type GameId = OnboardingGame;
type Opponent = 'bot' | 'friend' | 'online';
type Difficulty = 'relaxed' | 'balanced' | 'sharp';

const OPPONENTS: { id: Opponent; name: string; icon: IconName; tagline: string; taglineSelected?: string }[] = [
  { id: 'bot',    name: 'Practice vs the bot', icon: 'robot', tagline: 'Recommended for your first game' },
  { id: 'friend', name: 'Invite a friend',     icon: 'handshake', tagline: 'Share a link, play together' },
  { id: 'online', name: 'Match online',        icon: 'globe', tagline: 'Find someone at your level' },
];

const DIFFICULTIES: { id: Difficulty; name: string; icon: IconName; tagline: string }[] = [
  { id: 'relaxed',  name: 'Relaxed',  icon: 'plant', tagline: 'Forgiving — great to learn' },
  { id: 'balanced', name: 'Balanced', icon: 'scales', tagline: 'A fair fight' },
  { id: 'sharp',    name: 'Sharp',    icon: 'fire', tagline: 'Bring your A-game' },
];

// DIFFICULTY_ELO now lives in @gameexplorer/shared — mobile's tour reads the
// same ladder (it used to ignore the choice entirely).

export default function WelcomePage() {
  const router = useRouter();
  const { user } = useAuth();

  const [step, setStep] = useState(0);
  const [game, setGame] = useState<GameId>('chess');
  const [opponent, setOpponent] = useState<Opponent>('bot');
  const [difficulty, setDifficulty] = useState<Difficulty>('relaxed');

  // Seeing the tour counts as taking it — never bounce this visitor here again.
  useEffect(() => {
    localStorage.setItem(ONBOARDED_KEY, '1');
  }, []);

  const startPlaying = () => {
    // Queue the "save your progress" ask for after their first game ends.
    if (!user) localStorage.setItem(SAVE_PROGRESS_PENDING_KEY, '1');
    if (opponent === 'bot') {
      router.push(`/${game}/bot?elo=${DIFFICULTY_ELO[game][difficulty]}&start=1&casual=1`);
    } else {
      router.push(`/${game}/play`);
    }
  };

  const advance = () => {
    if (step === 2 && opponent !== 'bot') {
      startPlaying(); // friend/online games pick their own terms — no bot difficulty
    } else if (step === 3) {
      startPlaying();
    } else {
      setStep(s => s + 1);
    }
  };

  const totalSteps = 4;

  return (
    <div className="min-h-svh pt-16 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* One flat card per step. It used to slide in on every step, over a
            gold wash on the first — but the heading and the progress dots
            already change, so the movement said nothing they did not
            (ux-fix-ideas.md §6.1). */}
        <div className="relative rounded-2xl border border-border bg-surface-alt p-6 sm:p-8 flex flex-col">
          {/* Back (steps 2+) */}
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              aria-label="Back"
              className="absolute left-2 top-2 w-11 h-11 rounded-full flex items-center justify-center text-fg-muted hover:text-fg hover:bg-white/5 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}

          {/* Progress dots */}
          <div className="flex justify-center gap-1.5 mb-7" aria-label={`Step ${step + 1} of ${totalSteps}`}>
            {Array.from({ length: totalSteps }, (_, i) => (
              <span
                key={i}
                className="h-[5px] rounded-full transition-all duration-300"
                style={{
                  width: i === step ? 22 : 8,
                  background: i === step ? 'var(--c-accent)' : 'var(--c-border-strong)',
                }}
              />
            ))}
          </div>

          {step === 0 && (
            <>
              <div className="text-center">
                <div className="text-5xl leading-none mb-3.5 flex justify-center"><GameIcon game="chess" /></div>
                <h1 className="text-display font-bold mb-2.5">
                  Welcome to <span className="text-accent">GameExplorer</span>
                </h1>
                <p className="text-body text-fg-muted leading-relaxed mb-7">
                  {gameNameList()} — ready in seconds.
                  No download, no sign-up to start.
                </p>
              </div>
              <div className="mt-auto flex flex-col gap-3">
                <ContinueButton onClick={advance} flush>
                  Let&rsquo;s play →
                </ContinueButton>
                <p className="text-sm text-fg-muted text-center">
                  Already have an account?{' '}
                  <Link
                    href="/auth/signin"
                    className="inline-flex min-h-11 items-center px-1 text-info-hover font-semibold hover:underline"
                  >
                    Sign in
                  </Link>
                </p>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="text-2xl font-bold text-center mb-1.5">What do you feel like playing?</h1>
              <p className="text-sm text-fg-muted text-center mb-5">You can switch anytime.</p>
              <div className="flex flex-col gap-3">
                {TOUR_GAMES.map(g => (
                  <OptionRow
                    key={g.id}
                    icon={<GameIcon game={g.id} />}
                    iconSize={30}
                    name={g.name}
                    tagline={g.tagline}
                    selected={game === g.id}
                    onSelect={() => setGame(g.id)}
                  />
                ))}
              </div>
              <ContinueButton onClick={advance}>Continue →</ContinueButton>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="text-2xl font-bold text-center mb-1.5">Who&rsquo;s your first opponent?</h1>
              <p className="text-sm text-fg-muted text-center mb-5">No pressure — it&rsquo;s just for fun.</p>
              <div className="flex flex-col gap-3">
                {OPPONENTS.map(o => (
                  <OptionRow
                    key={o.id}
                    icon={<Icon name={o.icon} />}
                    iconSize={28}
                    name={o.name}
                    tagline={o.tagline}
                    selected={opponent === o.id}
                    onSelect={() => setOpponent(o.id)}
                  />
                ))}
              </div>
              <ContinueButton onClick={advance}>
                {opponent === 'bot' ? 'Continue →' : 'Start playing →'}
              </ContinueButton>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="text-2xl font-bold text-center mb-1.5">How tough should the bot be?</h1>
              <p className="text-sm text-fg-muted text-center mb-5">You can change the strength any time.</p>
              <div className="flex flex-col gap-3">
                {DIFFICULTIES.map(d => (
                  <OptionRow
                    key={d.id}
                    icon={<Icon name={d.icon} />}
                    iconSize={26}
                    name={d.name}
                    tagline={d.tagline}
                    selected={difficulty === d.id}
                    onSelect={() => setDifficulty(d.id)}
                  />
                ))}
              </div>
              <ContinueButton onClick={advance}>
                Start playing →
              </ContinueButton>
            </>
          )}
        </div>

        {/* Every step is skippable */}
        <p className="text-center mt-3">
          <Link
            href="/"
            className="inline-flex min-h-11 items-center px-3 text-sm text-fg-muted hover:text-fg transition-colors"
          >
            Skip the tour — browse on my own
          </Link>
        </p>
      </div>
    </div>
  );
}

function OptionRow({
  icon,
  iconSize,
  name,
  tagline,
  selected,
  onSelect,
}: {
  icon: ReactNode;
  iconSize: number;
  name: string;
  tagline: string;
  selected: boolean;
  onSelect: () => void;
}) {
  // One selected style for every question: an accent border, a muted fill and
  // a check. Each option used to glow in its own colour — a game's neon, gold,
  // or cool-to-hot for difficulty — which the option's name already carried.
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex items-center gap-3.5 px-4 py-3.5 rounded-xl border text-left motion-control motion-safe:active:scale-[0.98] ${
        selected ? 'border-accent bg-accent-muted' : 'border-border bg-surface-alt hover:border-border-strong'
      }`}
    >
      <span className="w-9 text-center leading-none" style={{ fontSize: iconSize }}>
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-base text-fg">{name}</span>
        <span className="block text-label text-fg-muted">{tagline}</span>
      </span>
      {selected && (
        <span className="w-[22px] h-[22px] shrink-0 rounded-full flex items-center justify-center text-label font-bold bg-accent text-on-accent">
          <Icon name="check" />
        </span>
      )}
    </button>
  );
}

/** The step's one gold element. `flush` drops the top margin where the button
 *  sits in a column that already spaces it. */
function ContinueButton({
  onClick,
  flush = false,
  children,
}: {
  onClick: () => void;
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`${flush ? '' : 'mt-5 '}w-full min-h-11 py-3.5 rounded-xl bg-accent text-on-accent font-bold text-base motion-control motion-safe:active:scale-[0.98] hover:bg-accent-hover`}
    >
      {children}
    </button>
  );
}
