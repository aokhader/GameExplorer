import { Text, View } from 'react-native';
import { formatCredits, groupLabel, type LiquidateTile } from '@gameexplorer/shared';
import { LIQUIDATE_PANEL_COLORS, useThemeName, FONT_SIZES, RADIUS, SPACING } from '@gameexplorer/ui';
import { FONTS } from '@/theme/typography';
import { tileAccent } from '../lqTheme';

/**
 * One side of a trade — the design's "You give" / "You get" card.
 *
 * Shared by the builder and the review screen so an offer looks identical
 * whichever end of it you are on.
 */
export function TradePanel({
  title,
  dotColor,
  tiles,
  credits,
  creditsLabel,
  empty = 'Nothing offered',
}: {
  title: string;
  dotColor: string;
  tiles: readonly LiquidateTile[];
  credits: number;
  creditsLabel: string;
  empty?: string;
}) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();
  const P = LIQUIDATE_PANEL_COLORS;

  const rows: { key: string; name: string; sub: string; accent: string; value: string }[] = [
    ...tiles.map((t) => ({
      key: `t${t.id}`,
      name: t.name,
      sub: groupLabel(t),
      accent: tileAccent(t),
      value: 'price' in t ? formatCredits(t.price) : '—',
    })),
  ];
  if (credits > 0) {
    rows.push({
      key: 'credits',
      name: 'Credits',
      sub: creditsLabel,
      accent: P.soft,
      value: formatCredits(credits),
    });
  }

  return (
    <View
      style={{
        backgroundColor: P.panel,
        borderWidth: 1,
        borderColor: P.line,
        borderRadius: RADIUS['2xl'],
        padding: 14,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING[2], marginBottom: 11 }}>
        <View style={{ width: 10, height: 10, borderRadius: RADIUS.full, backgroundColor: dotColor }} />
        <Text style={{ fontFamily: FONTS.bodyBold, fontSize: FONT_SIZES.xs, color: P.ink }}>{title}</Text>
      </View>

      {rows.length === 0 ? (
        <Text style={{ fontFamily: FONTS.bodySemi, fontSize: FONT_SIZES.xs, color: P.soft }}>{empty}</Text>
      ) : (
        rows.map((row) => (
          <View
            key={row.key}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACING['2.5'],
              paddingVertical: 8,
              borderTopWidth: 1,
              borderTopColor: P.line,
            }}
          >
            <View
              style={{ width: 6, height: 26, borderRadius: RADIUS.full, backgroundColor: row.accent }}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{ fontFamily: FONTS.bodyBold, fontSize: FONT_SIZES.label, color: P.ink }}
              >
                {row.name}
              </Text>
              <Text
                numberOfLines={1}
                style={{ fontFamily: FONTS.bodySemi, fontSize: FONT_SIZES['2xs'], color: P.soft }}
              >
                {row.sub}
              </Text>
            </View>
            <Text style={{ fontFamily: FONTS.display, fontSize: FONT_SIZES.xs, color: P.ink }}>
              {row.value}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}
