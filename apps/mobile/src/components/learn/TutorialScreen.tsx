import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { GameTutorial } from '@gameexplorer/shared';
import { COLORS, GAME_ACCENTS, GLOWS_NATIVE, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { Screen, BackHeader, Button, Card, GlowBackdrop } from '@/components/ui';
import { GamePieceIcon } from '@/game/GamePieceIcon';
import { FONTS } from '@/theme/typography';
import { TutorialBoard } from './TutorialBoard';
import { LessonList } from '@/lessons/LessonList';

// Colors are looked up during render, never captured here — the token objects
// are live views, so a module-scope read freezes them at import (see themeRuntime).
const GLOW_KEY: Record<GameTutorial['game'], keyof typeof GLOWS_NATIVE> = {
  chess: 'glowChess',
  checkers: 'glowCheckers',
  reversi: 'glowReversi',
  go: 'glowGo',
  liquidate: 'glowLiquidate',
};

/**
 * `GLOW_KEY` covers every game in the shared tutorial set, and TypeScript
 * enforces that: `Record<GameTutorial['game'], …>` fails to compile the day a
 * sixth game is added without an entry here.
 *
 * This used to be a runtime `in` guard with a `: 'chess'` fallback, which was
 * dead code that read as safety. It was not safe. `keyof typeof GLOW_KEY` was
 * already the whole union, so the fallback could never fire — and if a game
 * HAD slipped through it, the screen would have rendered that game's title and
 * prose under the chess knight, chess accent and chess glow, silently. This
 * screen has drawn a chess knight on the Go tutorial once already; a compile
 * error is the version of this check that actually works.
 */
type MobileTutorialGame = GameTutorial['game'];

/**
 * Scrollable "How to play" screen — the mobile rendering of the shared
 * tutorial content. Same shell language as the setup screens: accent bloom,
 * glowing icon badge, section headings, and a bot CTA at the end.
 */
export function TutorialScreen({ tutorial }: { tutorial: GameTutorial }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const router = useRouter();
  const game: MobileTutorialGame = tutorial.game;
  const accent = GAME_ACCENTS[game];

  return (
    <Screen>
      <GlowBackdrop
        blooms={[{ cx: '50%', cy: '-8%', rx: '80%', ry: '30%', color: accent.base, opacity: 0.16 }]}
      />
      <BackHeader title="How to play" fallbackHref={`/play/${tutorial.game}`} />

      {/* Hero */}
      <View style={{ alignItems: 'center', marginBottom: 26 }}>
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: RADIUS['3xl'],
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: accent.tintBg,
            borderWidth: 1,
            borderColor: accent.tintBorder,
            marginBottom: 16,
            boxShadow: GLOWS_NATIVE[GLOW_KEY[game]],
          }}
        >
          <GamePieceIcon game={game} size={48} />
        </View>
        <Text
          style={{
            fontFamily: FONTS.display,
            fontSize: FONT_SIZES.display,
            color: COLORS.fg,
            textAlign: 'center',
          }}
        >
          {tutorial.title}
        </Text>
        <Text
          style={{
            fontFamily: FONTS.body,
            fontSize: FONT_SIZES.body,
            lineHeight: 22,
            color: COLORS.fgMuted,
            marginTop: 8,
            textAlign: 'center',
          }}
        >
          {tutorial.intro}
        </Text>
      </View>

      {/* Coached lessons — beside the rules prose, not instead of it. This
          screen is where somebody comes to look a rule up; the lessons are
          where they come to be walked through one. */}
      <LessonList game={tutorial.game} />

      {/* Rules sections */}
      {tutorial.sections.map(section => (
        <View key={section.id} style={{ marginBottom: 26 }}>
          <Text
            style={{
              fontFamily: FONTS.displaySemi,
              fontSize: FONT_SIZES.lg,
              color: COLORS.fg,
              marginBottom: 8,
            }}
          >
            {section.heading}
          </Text>
          {section.paragraphs.map((paragraph, i) => (
            <Text
              key={i}
              style={{
                fontFamily: FONTS.body,
                fontSize: FONT_SIZES.body,
                lineHeight: 23,
                color: COLORS.fgMuted,
                marginBottom: 8,
              }}
            >
              {paragraph}
            </Text>
          ))}
          {section.diagrams?.map((diagram, i) => (
            <TutorialBoard key={i} diagram={diagram} />
          ))}
        </View>
      ))}

      {/* Beginner tips */}
      <Card style={{ padding: 18, marginBottom: 28 }}>
        <Text
          style={{
            fontFamily: FONTS.displaySemi,
            fontSize: FONT_SIZES.lg,
            color: COLORS.fg,
            marginBottom: 14,
          }}
        >
          Beginner tips
        </Text>
        <View style={{ gap: SPACING[3] }}>
          {tutorial.tips.map((tip, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: SPACING['2.5'] }}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: RADIUS.full,
                  backgroundColor: accent.tintBg,
                  borderWidth: 1,
                  borderColor: accent.tintBorder,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 1,
                }}
              >
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: FONT_SIZES.caption, color: accent.light }}>
                  {i + 1}
                </Text>
              </View>
              <Text
                style={{
                  flex: 1,
                  fontFamily: FONTS.body,
                  fontSize: FONT_SIZES.sm,
                  lineHeight: 21,
                  color: COLORS.fgMuted,
                }}
              >
                {tip}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      {/* CTA */}
      <Text
        style={{
          fontFamily: FONTS.body,
          fontSize: FONT_SIZES.sm,
          color: COLORS.fgMuted,
          textAlign: 'center',
          marginBottom: 12,
        }}
      >
        Ready to try it for real?
      </Text>
      <Button
        label={tutorial.ctaLabel}
        onPress={() => router.push(`/play/${tutorial.game}` as never)}
        glow
      />
    </Screen>
  );
}
