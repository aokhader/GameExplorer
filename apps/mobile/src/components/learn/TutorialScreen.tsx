import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { GameTutorial } from '@gameexplorer/shared';
import { COLORS, GAME_ACCENTS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { Screen, BackHeader, Button, Card } from '@/components/ui';
import { GamePieceIcon } from '@/game/GamePieceIcon';
import { FONTS } from '@/theme/typography';
import { TutorialBoard } from './TutorialBoard';
import { LessonList } from '@/lessons/LessonList';

/**
 * Scrollable "How to play" screen — the mobile rendering of the shared
 * tutorial content: the game's piece art beside its title, the rules sections,
 * and a bot CTA at the end. The accent bloom and glowing 80pt icon badge it
 * opened on went with the setup screens' hero (ux-fix-ideas.md §6.3).
 *
 * `GamePieceIcon` resolves every game through an exhaustive switch, so a
 * sixth game without art fails to compile rather than drawing the chess
 * knight on its tutorial — which this screen has done once already.
 */
export function TutorialScreen({ tutorial }: { tutorial: GameTutorial }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const router = useRouter();
  const game = tutorial.game;
  // The tip numbers wear the game's colour — a small identity mark.
  const accent = GAME_ACCENTS[game];

  return (
    <Screen>
      <BackHeader title="How to play" fallbackHref={`/play/${tutorial.game}`} />

      <View style={{ marginBottom: 20 }}>
        <View accessibilityRole="header" style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING[3] }}>
          <GamePieceIcon game={game} size={32} />
          <Text style={{ flex: 1, fontFamily: FONTS.display, fontSize: FONT_SIZES['2xl'], color: COLORS.fg }}>
            {tutorial.title}
          </Text>
        </View>
        <Text
          style={{
            fontFamily: FONTS.body,
            fontSize: FONT_SIZES.body,
            lineHeight: 22,
            color: COLORS.fgMuted,
            marginTop: 10,
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
      />
    </Screen>
  );
}
