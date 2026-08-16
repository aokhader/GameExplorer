import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { COLORS, GAME_ACCENTS, useThemeName } from '@gameexplorer/ui';
import { DIFFICULTY_ELO } from '@gameexplorer/shared';
import { useAuth } from '@gameexplorer/client';
import { Screen, Button } from '@/components/ui';
import { GamePieceIcon } from '@/game/GamePieceIcon';
import { markOnboarded, markSaveProgressPending } from '@/lib/onboarding';

type GameId = 'chess' | 'checkers' | 'reversi';
type Opponent = 'bot' | 'friend' | 'online';
type Difficulty = 'relaxed' | 'balanced' | 'sharp';

const GAMES: { id: GameId; name: string; tagline: string }[] = [
  { id: 'chess', name: 'Chess', tagline: 'Timeless strategy' },
  { id: 'checkers', name: 'Checkers', tagline: 'Easy to learn' },
  { id: 'reversi', name: 'Reversi', tagline: 'Quick to master' },
];

/**
 * Matches web's tour, now that mobile has online play to offer.
 *
 * "Invite a friend" and "Match online" both land on the same screen — the
 * matchmaking panel has Find Game and Play a Friend side by side — so they are
 * two doors into one place rather than two destinations. They are still worth
 * listing separately: "share a link with someone I know" and "find a stranger"
 * are different intentions, and a player who only wants the first should not
 * have to guess that it lives behind a button labelled for the second.
 */
const OPPONENTS: { id: Opponent; name: string; icon: string; tagline: string }[] = [
  { id: 'bot', name: 'Practice vs the bot', icon: '🤖', tagline: 'Recommended for your first game' },
  { id: 'friend', name: 'Invite a friend', icon: '🤝', tagline: 'Share a link, play together' },
  { id: 'online', name: 'Match online', icon: '🌐', tagline: 'Find someone at your level' },
];

// Colors are looked up during render, never captured here — the token objects
// are live views, so a module-scope read freezes them at import (see themeRuntime).
const DIFFICULTIES: {
  id: Difficulty; name: string; icon: string; tagline: string; accentKey: keyof typeof COLORS;
}[] = [
  { id: 'relaxed', name: 'Relaxed', icon: '😌', tagline: 'Forgiving — great to learn', accentKey: 'successHover' },
  { id: 'balanced', name: 'Balanced', icon: '🙂', tagline: 'A fair fight', accentKey: 'info' },
  { id: 'sharp', name: 'Sharp', icon: '🔥', tagline: 'Bring your A-game', accentKey: 'dangerHover' },
];

function OptionRow({
  icon,
  name,
  tagline,
  selected,
  accent,
  onPress,
}: {
  /** An emoji string, or piece art for the game rows. */
  icon: ReactNode;
  name: string;
  tagline: string;
  selected: boolean;
  accent: string;
  onPress: () => void;
}) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingHorizontal: 16,
        paddingVertical: 15,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: selected ? accent : COLORS.border,
        backgroundColor: selected ? COLORS.surfaceHover : COLORS.surfaceAlt,
      }}
    >
      {typeof icon === 'string' ? <Text style={{ fontSize: 26 }}>{icon}</Text> : icon}
      <View style={{ flex: 1 }}>
        <Text style={{ color: COLORS.fg, fontSize: 16, fontWeight: '700' }}>{name}</Text>
        <Text style={{ color: COLORS.fgMuted, fontSize: 13 }}>{tagline}</Text>
      </View>
      {selected && (
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: COLORS.surface, fontSize: 13, fontWeight: '800' }}>✓</Text>
        </View>
      )}
    </Pressable>
  );
}

/**
 * First-run tour. A trimmed native mirror of the web `/welcome`: pick a game, pick
 * a difficulty vibe, start playing. Seeing the tour counts as onboarding, so the
 * home hub never redirects here again. "Start playing" routes into the game screen
 * (a placeholder until the native boards land in M2/M3).
 */
export default function WelcomeScreen() {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const router = useRouter();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [game, setGame] = useState<GameId>('chess');
  const [opponent, setOpponent] = useState<Opponent>('bot');
  const [difficulty, setDifficulty] = useState<Difficulty>('relaxed');

  // Seeing the tour counts as taking it.
  useEffect(() => {
    markOnboarded();
  }, []);

  // Set once the tour has launched a game. Because that hand-off is a `push`
  // (see `start`), this screen stays underneath it — so if the player backs out
  // of their first game they would land back in onboarding. Bounce them to the
  // hub instead, which is where `replace` would have left them.
  const handedOff = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (handedOff.current) router.replace('/' as never);
    }, [router]),
  );

  // Four dots even though a non-bot opponent skips the difficulty step: the
  // count is the tour's shape, not a live estimate that shrinks under the
  // player as they choose. Same as web.
  const totalSteps = 4;

  // The picked vibe is carried through as an ELO, the way web's tour does it —
  // it used to be collected and then dropped, so every tour started the default
  // bot no matter which card the player chose.
  const start = () => {
    // Queue the "save your progress" ask for after their first game ends.
    if (!user) void markSaveProgressPending();
    // `push`, never `replace`. Replacing this screen with a game screen crashes
    // Fabric on Android roughly two times in three:
    //
    //   addViewAt: failed to insert view … Caused by: The specified child
    //   already has a parent
    //
    // Measured on a Pixel 8 emulator: `replace` 4 crashes / 6 runs, `push` 0 /
    // 6, and entering the same screen from the hub (also a push) 0 / 5. Doing
    // both — replace to the hub, then push — still crashed 2 / 6 even a frame
    // apart, so there is no ordering that makes `replace` safe here.
    //
    // The cost of pushing is that the tour stays under the game, which is what
    // `handedOff` below undoes.
    handedOff.current = true;
    router.push({
      pathname: '/play/[game]',
      params:
        opponent === 'bot'
          ? { game, elo: String(DIFFICULTY_ELO[game][difficulty]), start: '1' }
          : // Online picks its own terms on the matchmaking screen — time
            // control, rated, and whether to queue or send a link — so there is
            // no bot difficulty to carry.
            { game, online: '1' },
    } as never);
  };

  const advance = () => {
    // A non-bot opponent has no difficulty to choose, so step 2 is its last.
    if (step === 2 && opponent !== 'bot') start();
    else if (step === 3) start();
    else setStep((s) => s + 1);
  };

  return (
    <Screen>
      {/* Progress dots */}
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 12, marginBottom: 24 }}>
        {Array.from({ length: totalSteps }, (_, i) => (
          <View
            key={i}
            style={{
              height: 5,
              width: i === step ? 22 : 8,
              borderRadius: 3,
              backgroundColor: i === step ? COLORS.accent : COLORS.border,
            }}
          />
        ))}
      </View>

      {step > 0 && (
        <Pressable onPress={() => setStep((s) => s - 1)} hitSlop={10} style={{ marginBottom: 8 }}>
          <Text style={{ color: COLORS.fgMuted, fontSize: 15 }}>‹ Back</Text>
        </Pressable>
      )}

      {step === 0 && (
        <View style={{ alignItems: 'center', paddingTop: 24, gap: 14 }}>
          <Text style={{ fontSize: 56 }}>♟️</Text>
          <Text style={{ color: COLORS.fg, fontSize: 26, fontWeight: '800', textAlign: 'center' }}>
            Welcome to <Text style={{ color: COLORS.accent }}>GameExplorer</Text>
          </Text>
          <Text style={{ color: COLORS.fgMuted, fontSize: 15, textAlign: 'center', lineHeight: 22, maxWidth: 300 }}>
            Chess, checkers &amp; reversi — the classics you know, ready in seconds.
          </Text>
          <View style={{ width: '100%', gap: 12, marginTop: 16 }}>
            <Button label="Let's play →" onPress={advance} glow />
            <Pressable
              onPress={() => router.replace('/(auth)/sign-in' as never)}
              style={{ alignItems: 'center', paddingVertical: 8 }}
            >
              <Text style={{ color: COLORS.fgMuted, fontSize: 14 }}>
                Already have an account? <Text style={{ color: COLORS.infoHover, fontWeight: '700' }}>Sign in</Text>
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {step === 1 && (
        <>
          <Text style={{ color: COLORS.fg, fontSize: 22, fontWeight: '800', textAlign: 'center' }}>
            What do you feel like playing?
          </Text>
          <Text style={{ color: COLORS.fgMuted, fontSize: 14, textAlign: 'center', marginTop: 4, marginBottom: 20 }}>
            You can switch anytime.
          </Text>
          <View style={{ gap: 12 }}>
            {GAMES.map((g) => (
              <OptionRow
                key={g.id}
                icon={<GamePieceIcon game={g.id} size={30} />}
                name={g.name}
                tagline={g.tagline}
                selected={game === g.id}
                accent={GAME_ACCENTS[g.id].base}
                onPress={() => setGame(g.id)}
              />
            ))}
          </View>
          <Button label="Continue →" onPress={advance} style={{ marginTop: 20 }} />
        </>
      )}

      {step === 2 && (
        <>
          <Text style={{ color: COLORS.fg, fontSize: 22, fontWeight: '800', textAlign: 'center' }}>
            Who&apos;s your first opponent?
          </Text>
          <Text style={{ color: COLORS.fgMuted, fontSize: 14, textAlign: 'center', marginTop: 4, marginBottom: 20 }}>
            {user
              ? 'Every mode is available from the game screen too.'
              : 'Online games need an account — we ask when you get there.'}
          </Text>
          <View style={{ gap: 12 }}>
            {OPPONENTS.map((o) => (
              <OptionRow
                key={o.id}
                icon={o.icon}
                name={o.name}
                tagline={o.tagline}
                selected={opponent === o.id}
                accent={COLORS.accent}
                onPress={() => setOpponent(o.id)}
              />
            ))}
          </View>
          <Button
            label={opponent === 'bot' ? 'Continue →' : 'Start playing →'}
            onPress={advance}
            glow={opponent !== 'bot'}
            style={{ marginTop: 20 }}
          />
        </>
      )}

      {step === 3 && (
        <>
          <Text style={{ color: COLORS.fg, fontSize: 22, fontWeight: '800', textAlign: 'center' }}>
            How tough should the bot be?
          </Text>
          <Text style={{ color: COLORS.fgMuted, fontSize: 14, textAlign: 'center', marginTop: 4, marginBottom: 20 }}>
            The bot adapts as you improve.
          </Text>
          <View style={{ gap: 12 }}>
            {DIFFICULTIES.map((d) => (
              <OptionRow
                key={d.id}
                icon={d.icon}
                name={d.name}
                tagline={d.tagline}
                selected={difficulty === d.id}
                accent={COLORS[d.accentKey]}
                onPress={() => setDifficulty(d.id)}
              />
            ))}
          </View>
          <Button label="Start playing →" onPress={advance} glow style={{ marginTop: 20 }} />
        </>
      )}

      <Pressable onPress={() => router.replace('/' as never)} style={{ alignItems: 'center', marginTop: 20 }}>
        <Text style={{ color: COLORS.fgSubtle, fontSize: 13 }}>Skip the tour — browse on my own</Text>
      </Pressable>
    </Screen>
  );
}
