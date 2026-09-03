'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DIFFICULTY_ELO, TOUR_GAMES, gameNameList, type OnboardingGame } from '@finesse/shared';
import { useAuth } from '@/hooks/useAuth';
import { ONBOARDED_KEY, SAVE_PROGRESS_PENDING_KEY } from '@/lib/onboarding';
import { GameIcon } from '@/components/game/GameIcon';

// The tour's games are the rated ones (see TOUR_GAMES) — the last step picks a
// bot difficulty on a game's own ELO ladder, which only means something for a
// game whose results move a rating. `OnboardingGame` is the ladder's own key
// type, so the two cannot drift apart.
type GameId = OnboardingGame;
type Opponent = 'bot' | 'friend' | 'online';
type Difficulty = 'relaxed' | 'balanced' | 'sharp';

const OPPONENTS: { id: Opponent; name: string; icon: string; tagline: string; taglineSelected?: string }[] = [
  { id: 'bot',    name: 'Practice vs the bot', icon: '🤖', tagline: 'Recommended for your first game' },
  { id: 'friend', name: 'Invite a friend',     icon: '🤝', tagline: 'Share a link, play together' },
  { id: 'online', name: 'Match online',        icon: '🌐', tagline: 'Find someone at your level' },
];

const DIFFICULTIES: { id: Difficulty; name: string; icon: string; tagline: string }[] = [
  { id: 'relaxed',  name: 'Relaxed',  icon: '😌', tagline: 'Forgiving — great to learn' },
  { id: 'balanced', name: 'Balanced', icon: '🙂', tagline: 'A fair fight' },
  { id: 'sharp',    name: 'Sharp',    icon: '🔥', tagline: 'Bring your A-game' },
];

// DIFFICULTY_ELO now lives in @finesse/shared — mobile's tour reads the
// same ladder (it used to ignore the choice entirely).

// Selection accent per option, as CSS color / glow pairs. Games glow in their
// signature hue; opponents in gold; difficulties cool → hot.
const GAME_ACCENT: Record<GameId, { color: string; glow: string }> = {
  chess:    { color: 'var(--c-game-chess)',    glow: 'var(--c-game-chess-glow)' },
  checkers: { color: 'var(--c-game-checkers)', glow: 'var(--c-game-checkers-glow)' },
  reversi:  { color: 'var(--c-game-reversi)',  glow: 'var(--c-game-reversi-glow)' },
};
const GOLD_ACCENT = { color: 'var(--c-accent)', glow: 'var(--c-accent-glow)' };
const DIFFICULTY_ACCENT: Record<Difficulty, { color: string; glow: string }> = {
  relaxed:  { color: 'var(--c-success-hover)', glow: 'rgba(34, 211, 170, 0.45)' },
  balanced: { color: 'var(--c-info)',          glow: 'var(--c-info-glow)' },
  sharp:    { color: 'var(--c-danger)',        glow: 'rgba(244, 63, 94, 0.45)' },
};

export default function WelcomePage() {
  const router = useRouter();
  const { user } = useAuth();

  const [step, setStep] = useState(0);
  const [game, setGame] = useState<GameId>('chess');
  const [opponent, setOpponent] = useState<Opponent>('bot');
  const [difficulty, setDifficulty] = useState<Difficulty>('relaxed');
  // True once the user moves between steps. The step card only animates on
  // those transitions — on first paint it must be visible immediately: this is
  // the page's LCP element, and stacking opacity-0 entrances on top of the
  // route-level PageTransition fade pushed LCP past 6s for new visitors.
  const [navigated, setNavigated] = useState(false);

  // Seeing the tour counts as taking it — never bounce this visitor here again.
  useEffect(() => {
    localStorage.setItem(ONBOARDED_KEY, '1');
  }, []);

  const startPlaying = () => {
    // Queue the "save your progress" ask for after their first game ends.
    if (!user) localStorage.setItem(SAVE_PROGRESS_PENDING_KEY, '1');
    if (opponent === 'bot') {
      router.push(`/${game}/bot?elo=${DIFFICULTY_ELO[game][difficulty]}&start=1`);
    } else {
      router.push(`/${game}/play`);
    }
  };

  const advance = () => {
    setNavigated(true);
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
    <div className="min-h-screen pt-16 flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Step card — re-keyed so each step change animates in. `page-enter`
            only fires when `data-animate` is present (see globals.css); we mark
            it once the user steps, so the first paint stays static (this is the
            LCP element) but step transitions still animate — even on a direct
            onboarding landing where no route-level navigation has occurred. */}
        <div
          key={step}
          data-animate={navigated ? '' : undefined}
          className="page-enter relative rounded-[20px] border border-white/10 bg-surface-alt surface-raised-lg p-8 sm:p-9 flex flex-col"
          style={
            step === 0
              ? {
                  backgroundImage:
                    'var(--c-welcome-wash), var(--gradient-surface)',
                }
              : undefined
          }
        >
          {/* Back (steps 2+) */}
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              aria-label="Back"
              className="absolute left-4 top-4 w-8 h-8 rounded-full flex items-center justify-center text-fg-muted hover:text-fg hover:bg-white/5 transition-colors"
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
                <div className="text-[52px] leading-none mb-3.5">♟️</div>
                <h1 className="text-[27px] font-bold mb-2.5">
                  Welcome to <span className="text-accent">Finesse</span>
                </h1>
                <p className="text-[15px] text-fg-muted leading-relaxed mb-7">
                  {gameNameList()} — ready in seconds.
                  No download, no sign-up to start.
                </p>
              </div>
              <div className="mt-auto flex flex-col gap-3">
                <button
                  onClick={advance}
                  className="w-full py-3.5 rounded-[14px] bg-accent [background-image:var(--gradient-accent)] text-on-accent font-bold text-base [box-shadow:var(--c-accent-bloom)] hover:brightness-110 transition-all"
                >
                  Let&rsquo;s play →
                </button>
                <p className="text-[13.5px] text-fg-muted text-center">
                  Already have an account?{' '}
                  <Link href="/auth/signin" className="text-info-hover font-semibold hover:underline">
                    Sign in
                  </Link>
                </p>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="text-[23px] font-bold text-center mb-1.5">What do you feel like playing?</h1>
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
                    accent={GAME_ACCENT[g.id]}
                    onSelect={() => setGame(g.id)}
                  />
                ))}
              </div>
              <ContinueButton onClick={advance}>Continue →</ContinueButton>
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="text-[23px] font-bold text-center mb-1.5">Who&rsquo;s your first opponent?</h1>
              <p className="text-sm text-fg-muted text-center mb-5">No pressure — it&rsquo;s just for fun.</p>
              <div className="flex flex-col gap-3">
                {OPPONENTS.map(o => (
                  <OptionRow
                    key={o.id}
                    icon={o.icon}
                    iconSize={28}
                    name={o.name}
                    tagline={o.tagline}
                    selected={opponent === o.id}
                    accent={GOLD_ACCENT}
                    onSelect={() => setOpponent(o.id)}
                  />
                ))}
              </div>
              <ContinueButton onClick={advance} glow={opponent !== 'bot'}>
                {opponent === 'bot' ? 'Continue →' : 'Start playing →'}
              </ContinueButton>
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="text-[23px] font-bold text-center mb-1.5">How tough should the bot be?</h1>
              <p className="text-sm text-fg-muted text-center mb-5">The bot adapts as you improve.</p>
              <div className="flex flex-col gap-3">
                {DIFFICULTIES.map(d => (
                  <OptionRow
                    key={d.id}
                    icon={d.icon}
                    iconSize={26}
                    name={d.name}
                    tagline={d.tagline}
                    selected={difficulty === d.id}
                    accent={DIFFICULTY_ACCENT[d.id]}
                    onSelect={() => setDifficulty(d.id)}
                  />
                ))}
              </div>
              <ContinueButton onClick={advance} glow>
                Start playing →
              </ContinueButton>
            </>
          )}
        </div>

        {/* Every step is skippable */}
        <p className="text-center mt-5">
          <Link href="/" className="text-[13.5px] text-fg-subtle hover:text-fg-muted transition-colors">
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
  accent,
  onSelect,
}: {
  icon: ReactNode;
  iconSize: number;
  name: string;
  tagline: string;
  selected: boolean;
  accent: { color: string; glow: string };
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className="flex items-center gap-3.5 px-4 py-[15px] rounded-[14px] border text-left transition-all"
      style={
        selected
          ? {
              background: `linear-gradient(180deg, color-mix(in srgb, ${accent.color} 16%, transparent), var(--c-game-tint-tail))`,
              borderColor: accent.color,
              boxShadow: `0 0 24px -8px ${accent.glow}`,
            }
          : {
              background: 'var(--c-surface-alt)',
              borderColor: 'var(--c-border)',
            }
      }
    >
      <span className="w-9 text-center leading-none" style={{ fontSize: iconSize }}>
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-bold text-base text-fg">{name}</span>
        <span className="block text-[12.5px] text-fg-muted">{tagline}</span>
      </span>
      {selected && (
        <span
          className="w-[22px] h-[22px] shrink-0 rounded-full flex items-center justify-center text-[13px] font-bold text-white"
          style={{ background: accent.color, color: accent.color === 'var(--c-accent)' ? 'var(--c-on-accent)' : '#fff' }}
        >
          ✓
        </span>
      )}
    </button>
  );
}

function ContinueButton({
  onClick,
  glow = false,
  children,
}: {
  onClick: () => void;
  glow?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="mt-5 w-full py-3.5 rounded-[14px] bg-accent [background-image:var(--gradient-accent)] text-on-accent font-bold text-base hover:brightness-110 transition-all"
      style={glow ? { boxShadow: 'var(--c-accent-bloom)' } : undefined}
    >
      {children}
    </button>
  );
}
