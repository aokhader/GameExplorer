import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { GameTutorial } from '@gameexplorer/shared';
import { COLORS, GAME_ACCENTS, GLOWS_NATIVE } from '@gameexplorer/ui';
import { Screen, BackHeader, Button, Card, GlowBackdrop } from '@/components/ui';
import { GamePieceIcon } from '@/game/GamePieceIcon';
import { FONTS } from '@/theme/typography';
import { TutorialBoard } from './TutorialBoard';

const GLOWS = {
  chess: GLOWS_NATIVE.glowChess,
  checkers: GLOWS_NATIVE.glowCheckers,
  reversi: GLOWS_NATIVE.glowReversi,
} as const;

/**
 * The shared tutorial set is wider than what mobile ships — Liquidate is web-only
 * for now — so narrow before indexing the native accent/glow/icon maps. Routing
 * only ever passes a game this app can render; the fallback just keeps the
 * screen total if that ever stops being true.
 */
type MobileTutorialGame = keyof typeof GLOWS;
const isMobileGame = (game: GameTutorial['game']): game is MobileTutorialGame => game in GLOWS;

/**
 * Scrollable "How to play" screen — the mobile rendering of the shared
 * tutorial content. Same shell language as the setup screens: accent bloom,
 * glowing icon badge, section headings, and a bot CTA at the end.
 */
export function TutorialScreen({ tutorial }: { tutorial: GameTutorial }) {
  const router = useRouter();
  const game = isMobileGame(tutorial.game) ? tutorial.game : 'chess';
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
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: accent.tintBg,
            borderWidth: 1,
            borderColor: accent.tintBorder,
            marginBottom: 16,
            boxShadow: GLOWS[game],
          }}
        >
          <GamePieceIcon game={game} size={48} />
        </View>
        <Text
          style={{
            fontFamily: FONTS.display,
            fontSize: 28,
            color: COLORS.fg,
            textAlign: 'center',
          }}
        >
          {tutorial.title}
        </Text>
        <Text
          style={{
            fontFamily: FONTS.body,
            fontSize: 15,
            lineHeight: 22,
            color: COLORS.fgMuted,
            marginTop: 8,
            textAlign: 'center',
          }}
        >
          {tutorial.intro}
        </Text>
      </View>

      {/* Rules sections */}
      {tutorial.sections.map(section => (
        <View key={section.id} style={{ marginBottom: 26 }}>
          <Text
            style={{
              fontFamily: FONTS.displaySemi,
              fontSize: 18,
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
                fontSize: 15,
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
            fontSize: 17,
            color: COLORS.fg,
            marginBottom: 14,
          }}
        >
          Beginner tips
        </Text>
        <View style={{ gap: 12 }}>
          {tutorial.tips.map((tip, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: accent.tintBg,
                  borderWidth: 1,
                  borderColor: accent.tintBorder,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 1,
                }}
              >
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11, color: accent.light }}>
                  {i + 1}
                </Text>
              </View>
              <Text
                style={{
                  flex: 1,
                  fontFamily: FONTS.body,
                  fontSize: 14,
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
          fontSize: 14,
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
