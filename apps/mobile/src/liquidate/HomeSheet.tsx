import { Pressable, Text, View } from 'react-native';
import {
  LiquidateEngine,
  buildInspector,
  formatCredits,
  groupLabel,
  isOwnable,
  type DockSlot,
  type LiquidateAction,
  type LiquidateGameState,
  type PrimaryAction,
} from '@gameexplorer/shared';
import { LIQUIDATE_PANEL_COLORS, useThemeName } from '@gameexplorer/ui';
import { FONTS } from '@/theme/typography';
import { tileAccent } from './lqTheme';
import type { LqView } from './views/types';

/** The glyph and label for each dock slot, in the design's voice. */
const DOCK_META: Record<DockSlot['id'], { glyph: string; label: string; view: LqView }> = {
  manage: { glyph: '⚒', label: 'Manage', view: 'holdings' },
  trade: { glyph: '⇆', label: 'Trade', view: 'trade' },
  standings: { glyph: '☰', label: 'Standings', view: 'standings' },
  board: { glyph: '⤢', label: 'Board', view: 'full' },
  auction: { glyph: '⇄', label: 'Auction', view: 'auction' },
};

export interface HomeSheetProps {
  state: LiquidateGameState;
  youId: string | null;
  /** The tile the sheet describes — usually where the acting seat just landed. */
  focusTile: number;
  /** Small uppercase line above the name. */
  kicker: string;
  cta: PrimaryAction | null;
  /** Copy for the disabled CTA — "Vega is deciding…". */
  waitingFor: string | null;
  dock: readonly DockSlot[];
  /** Hides the property card while a piece is still walking toward it. */
  hideCard: boolean;
  /** The newest card draw, shown as a transient banner. */
  cardDraw: { text: string; deck: 'anomaly' | 'federation' } | null;
  dispatch: (action: LiquidateAction) => void;
  onOpen: (view: LqView) => void;
}

/**
 * The pinned bottom sheet on the board screen.
 *
 * A pinned bar rather than the `Sheet` modal: it is always present, its height
 * is content-driven, and the board above it sizes itself against whatever is
 * left. The design's grabber pill is decorative — there is nothing to expand to.
 */
export function HomeSheet({
  state,
  youId,
  focusTile,
  kicker,
  cta,
  waitingFor,
  dock,
  hideCard,
  cardDraw,
  dispatch,
  onOpen,
}: HomeSheetProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const P = LIQUIDATE_PANEL_COLORS;
  const tile = LiquidateEngine.board(state)[focusTile]!;
  const data = buildInspector(state, focusTile, youId, kicker);
  const accent = tileAccent(tile);

  return (
    <View
      style={{
        backgroundColor: P.panel2,
        borderTopWidth: 1,
        borderTopColor: P.line,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 18,
        paddingTop: 11,
        paddingBottom: 22,
        boxShadow: '0 -12px 30px rgba(0,0,0,0.28)',
      }}
    >
      {/* Decorative: the sheet's height follows its content, so there is nothing
          to drag it open to. */}
      <View
        importantForAccessibility="no"
        style={{
          alignSelf: 'center',
          width: 38,
          height: 4,
          borderRadius: 2,
          backgroundColor: P.line,
          marginBottom: 10,
        }}
      />

      {cardDraw ? (
        <CardBanner text={cardDraw.text} deck={cardDraw.deck} />
      ) : hideCard ? (
        <View style={{ minHeight: 96, justifyContent: 'center' }}>
          <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13, color: P.dim }}>Moving…</Text>
        </View>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  fontFamily: FONTS.bodyBold,
                  fontSize: 9,
                  letterSpacing: 0.9,
                  color: P.accent,
                }}
              >
                {kicker.toUpperCase()}
              </Text>
              <Text
                numberOfLines={1}
                style={{ fontFamily: FONTS.display, fontSize: 25, color: P.ink, marginTop: 3 }}
              >
                {tile.name}
              </Text>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 }}
              >
                <View
                  style={{ width: 11, height: 11, borderRadius: 4, backgroundColor: accent }}
                />
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 11, color: P.ink }}>
                  {data.groupLabel || groupLabel(tile)}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{ flex: 1, fontFamily: FONTS.bodySemi, fontSize: 11, color: P.dim }}
                >
                  · {data.status}
                </Text>
              </View>
            </View>

            {data.price !== null && (
              <View style={{ alignItems: 'flex-end' }}>
                <Text
                  style={{
                    fontFamily: FONTS.bodySemi,
                    fontSize: 9,
                    letterSpacing: 0.5,
                    color: P.dim,
                  }}
                >
                  LIST PRICE
                </Text>
                <Text style={{ fontFamily: FONTS.display, fontSize: 23, color: P.ink }}>
                  {formatCredits(data.price)}
                </Text>
              </View>
            )}
          </View>

          {data.highlight && (
            <View
              style={{
                marginTop: 11,
                backgroundColor: P.hint,
                borderWidth: 1,
                borderColor: P.hintLine,
                borderRadius: 11,
                paddingHorizontal: 11,
                paddingVertical: 9,
              }}
            >
              <Text
                style={{
                  fontFamily: FONTS.bodySemi,
                  fontSize: 11.5,
                  lineHeight: 16,
                  color: P.hintInk,
                }}
              >
                {data.highlight}
              </Text>
            </View>
          )}

          {isOwnable(tile) && <RentStrip rows={data.rent} />}
        </>
      )}

      {/* Primary call to action */}
      <View style={{ marginTop: 14 }}>
        {cta ? (
          <Pressable
            onPress={() => dispatch(cta.action)}
            accessibilityRole="button"
            accessibilityLabel={cta.right ? `${cta.label} for ${cta.right}` : cta.label}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              paddingHorizontal: 14,
              paddingVertical: 13,
              borderRadius: 15,
              backgroundColor: cta.tone === 'danger' ? COLORS_DANGER : P.accent,
              boxShadow: cta.tone === 'danger' ? undefined : '0 8px 22px rgba(231,182,78,0.32)',
            }}
          >
            {({ pressed }) => (
              <>
                <View style={{ flex: 1, opacity: pressed ? 0.85 : 1 }}>
                  <Text
                    style={{
                      fontFamily: FONTS.bodyBold,
                      fontSize: 15,
                      color: cta.tone === 'danger' ? '#fff' : P.accentInk,
                    }}
                  >
                    {cta.label}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: FONTS.bodySemi,
                      fontSize: 10,
                      marginTop: 2,
                      opacity: 0.72,
                      color: cta.tone === 'danger' ? '#fff' : P.accentInk,
                    }}
                  >
                    {cta.sub}
                  </Text>
                </View>
                {cta.right && (
                  <Text
                    style={{
                      fontFamily: FONTS.display,
                      fontSize: 16,
                      color: cta.tone === 'danger' ? '#fff' : P.accentInk,
                    }}
                  >
                    {cta.right}
                  </Text>
                )}
              </>
            )}
          </Pressable>
        ) : (
          <View
            accessible
            accessibilityLabel={waitingFor ?? 'Waiting'}
            accessibilityState={{ disabled: true }}
            accessibilityLiveRegion="polite"
            style={{
              paddingVertical: 17,
              borderRadius: 15,
              borderWidth: 1,
              borderColor: P.line,
              alignItems: 'center',
            }}
          >
            <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13, color: P.dim }}>
              {waitingFor ?? 'Waiting…'}
            </Text>
          </View>
        )}
      </View>

      {/* The four shortcuts */}
      <View style={{ flexDirection: 'row', gap: 9, marginTop: 9 }}>
        {dock.map((slot) => {
          const meta = DOCK_META[slot.id];
          return (
            <Pressable
              key={slot.id}
              onPress={() => onOpen(meta.view)}
              disabled={!slot.enabled}
              accessibilityRole="button"
              accessibilityLabel={slot.enabled ? meta.label : `${meta.label} — ${slot.reason}`}
              accessibilityState={{ disabled: !slot.enabled }}
              style={{ flex: 1 }}
            >
              {({ pressed }) => (
                <View
                  style={{
                    alignItems: 'center',
                    gap: 4,
                    paddingVertical: 10,
                    paddingHorizontal: 4,
                    borderRadius: 13,
                    borderWidth: 1,
                    borderColor: P.line,
                    opacity: slot.enabled ? (pressed ? 0.6 : 1) : 0.38,
                  }}
                >
                  <Text style={{ fontSize: 16, color: P.ink }}>{meta.glyph}</Text>
                  <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 10, color: P.ink }}>
                    {meta.label}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Danger red for the Fold CTA — the one place the sheet leaves the gold accent. */
const COLORS_DANGER = '#ef5f6b';

/**
 * The four-cell rent strip.
 *
 * `buildInspector` returns the whole ladder (seven rungs for a planet); the
 * design shows four. Rather than take the first four — which would drop the
 * megastructure and often the rung in force — this keeps the two ends and the
 * active rung, so the cell a player is actually looking for is always present.
 */
function RentStrip({ rows }: { rows: { label: string; value: string; active: boolean }[] }) {
  useThemeName();
  const P = LIQUIDATE_PANEL_COLORS;
  if (rows.length === 0) return null;

  const activeIndex = rows.findIndex((r) => r.active);
  const wanted = new Set<number>([0, rows.length - 1]);
  if (activeIndex >= 0) wanted.add(activeIndex);
  // Fill toward the middle until four cells are chosen.
  for (let i = 1; wanted.size < Math.min(4, rows.length); i++) {
    if (activeIndex >= 0 && activeIndex + i < rows.length) wanted.add(activeIndex + i);
    if (wanted.size < 4 && activeIndex - i >= 0) wanted.add(activeIndex - i);
    if (i > rows.length) break;
  }
  const shown = [...wanted].sort((a, b) => a - b).slice(0, 4).map((i) => rows[i]!);

  return (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 11 }}>
      {shown.map((r) => (
        <View
          key={r.label}
          style={{
            flex: 1,
            backgroundColor: P.panel,
            borderWidth: 1,
            borderColor: r.active ? P.hintLine : P.line,
            borderRadius: 10,
            paddingVertical: 8,
            paddingHorizontal: 5,
            alignItems: 'center',
          }}
        >
          <Text
            numberOfLines={2}
            style={{
              fontFamily: FONTS.bodySemi,
              fontSize: 8.5,
              lineHeight: 10,
              minHeight: 20,
              textAlign: 'center',
              color: P.soft,
            }}
          >
            {r.label.toUpperCase()}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: FONTS.display,
              fontSize: 12.5,
              marginTop: 3,
              color: r.active ? P.accent : P.ink,
            }}
          >
            {r.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * A drawn card.
 *
 * The engine resolves a card inside the same `applyAction` that drew it — there
 * is no card phase and no pause — so without this the effect is invisible
 * outside the log: money moves, or a ship teleports, with nothing to explain it.
 */
function CardBanner({ text, deck }: { text: string; deck: 'anomaly' | 'federation' }) {
  useThemeName();
  const P = LIQUIDATE_PANEL_COLORS;
  const style = deck === 'anomaly' ? { base: '#9b7be6', glyph: '✦' } : { base: '#59c1f0', glyph: '❖' };

  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      style={{
        minHeight: 96,
        justifyContent: 'center',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: style.base,
        backgroundColor: P.panel,
        padding: 14,
        gap: 6,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Text style={{ fontSize: 15, color: style.base }}>{style.glyph}</Text>
        <Text
          style={{
            fontFamily: FONTS.bodyBold,
            fontSize: 9,
            letterSpacing: 0.9,
            color: style.base,
          }}
        >
          {deck === 'anomaly' ? 'ANOMALY' : 'FEDERATION'}
        </Text>
      </View>
      <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 13.5, lineHeight: 19, color: P.ink }}>
        {text}
      </Text>
    </View>
  );
}
