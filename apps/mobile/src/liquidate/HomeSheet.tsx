import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  LiquidateEngine,
  buildInspector,
  formatCredits,
  groupLabel,
  isOwnable,
  type DockSlot,
  type InspectorData,
  type LiquidateAction,
  type LiquidateGameState,
  type PrimaryAction,
} from '@finesse/shared';
import { LIQUIDATE_DECK_STYLE, LIQUIDATE_PANEL_COLORS, useThemeName } from '@finesse/ui';
import { FONTS } from '@/theme/typography';
import { tileAccent } from './lqTheme';
import type { LqView } from './views/types';

/**
 * Minimum height for the sheet's collapsed detail block, in points.
 *
 * This is what keeps the board still. The board fills whatever the sheet leaves,
 * so anything that changes the sheet's height resizes the ring — and the states
 * this block cycles through during one ordinary turn (walking, a drawn card, the
 * tile landed on) have wildly different natural heights.
 *
 * The floor is the height of the tallest COLLAPSED state: the two rows every
 * tile draws — kicker, name, system row, and the hint/ladder row under them. The
 * rent ladder is deliberately outside it: opening the ladder is the one thing
 * allowed to grow the sheet, because the player asked for it and can see why the
 * board shrank.
 *
 * Every text style below carries an explicit `lineHeight` for the same reason:
 * React Native's default leading is ~1.2×, which quietly inflated each row.
 */
const DETAIL_MIN_HEIGHT = 118;

/**
 * Height of the primary button, in points.
 *
 * Fixed for the same reason as the block above it: the active CTA carries a
 * label and a sub-line while the "…is deciding" state carries one line, and
 * letting them size themselves moved the sheet — and so the board — every time
 * play passed to a bot. 53 is the design's own box: 13pt padding either side of
 * a 15pt label and a 10pt sub-line.
 */
const CTA_HEIGHT = 53;

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
  const ownable = isOwnable(tile);

  /**
   * Which tile's rent ladder is open — not a boolean.
   *
   * Storing the tile rather than a flag makes the ladder close by itself when
   * the focus moves on, without an effect to reset it: a ladder left open from
   * two turns ago would keep the board shrunk for a tile nobody is looking at.
   */
  const [openTile, setOpenTile] = useState<number | null>(null);
  const ladderOpen = openTile === focusTile;

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
      {/* Decorative: the sheet is a fixed height, so there is nothing to drag
          it open to. */}
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

      {/*
        The collapsed card: two rows, the same height for every tile.

        What goes in here swings by well over a hundred points if left alone — a
        planet says far more than a stretch of drift — and since the board takes
        whatever the sheet leaves, every one of those swings would resize the
        ring mid-turn. The floor holds it flat; the ladder below is the only
        thing that moves it.
      */}
      <View style={{ minHeight: DETAIL_MIN_HEIGHT }}>
        {cardDraw ? (
          <CardBanner text={cardDraw.text} deck={cardDraw.deck} />
        ) : hideCard ? (
          <View style={{ flex: 1, justifyContent: 'center' }}>
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
                  lineHeight: 12,
                  letterSpacing: 0.9,
                  color: P.accent,
                }}
              >
                {kicker.toUpperCase()}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 26,
                  // The design sets 26px/1 — the name is the sheet's tallest
                  // line, so its leading is where slack shows up first.
                  lineHeight: 26,
                  color: P.ink,
                  marginTop: 3,
                }}
              >
                {tile.name}
              </Text>
            </View>

            {data.price !== null && (
              <View style={{ alignItems: 'flex-end' }}>
                <Text
                  style={{
                    fontFamily: FONTS.bodySemi,
                    fontSize: 9,
                    lineHeight: 12,
                    letterSpacing: 0.5,
                    color: P.dim,
                  }}
                >
                  LIST PRICE
                </Text>
                <Text
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: 24,
                    lineHeight: 28,
                    color: P.ink,
                  }}
                >
                  {formatCredits(data.price)}
                </Text>
              </View>
            )}
          </View>

            {/*
              The system line, spanning the whole sheet rather than sitting in
              the name's column — that is what lets the holder read flush with
              the right edge, under the price, instead of stopping short of it.
              Group and set-progress belong together on the left; who holds the
              tile is a separate fact and gets the other end of the row.
            */}
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7 }}
            >
              <View
                style={{ width: 11, height: 11, borderRadius: 4, backgroundColor: accent }}
              />
              <Text
                style={{ fontFamily: FONTS.bodyBold, fontSize: 11, lineHeight: 14, color: P.ink }}
              >
                {data.groupLabel || groupLabel(tile)}
              </Text>
              {data.progress && (
                <SetChip
                  held={data.progress.held}
                  total={data.progress.total}
                  accent={accent}
                  label={data.progress.label}
                />
              )}
              <View style={{ flex: 1 }} />
              {/* A tile that cannot be owned has no holder worth two mentions:
                  its whole story is one line, and it is told in the row below
                  where there is room for it. */}
              {ownable && (
                <Text
                  numberOfLines={1}
                  style={{
                    flexShrink: 1,
                    textAlign: 'right',
                    fontFamily: FONTS.bodySemi,
                    fontSize: 11,
                    lineHeight: 14,
                    color: P.dim,
                  }}
                >
                  {data.status}
                </Text>
              )}
            </View>

            <LadderRow
              data={data}
              ownable={ownable}
              /* An unclaimed tile has no rent story to tell yet, so the hint
                 half of the ladder row would otherwise sit empty. */
              unowned={ownable && state.tiles[focusTile]!.ownerId === null}
              /* Utilities charge a multiple of the roll, so their ladder has no
                 credit range to summarise — "dice × 3–dice × 9" is not a span
                 of money and reads as a typo. */
              range={ownable && tile.kind !== 'utility'}
              open={ladderOpen}
              onToggle={() => setOpenTile(ladderOpen ? null : focusTile)}
            />
          </>
        )}
      </View>

      {/*
        Outside the floored block on purpose — this is the one thing allowed to
        push the sheet up and the board down, and only ever because the player
        just tapped for it.
      */}
      {ladderOpen && !hideCard && !cardDraw && <RentStrip rows={data.rent} />}

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
              height: CTA_HEIGHT,
              borderRadius: 15,
              backgroundColor: cta.tone === 'danger' ? P.danger : P.accent,
              boxShadow: cta.tone === 'danger' ? undefined : '0 8px 22px rgba(231,182,78,0.32)',
            }}
          >
            {({ pressed }) => (
              <>
                <View style={{ flex: 1, opacity: pressed ? 0.85 : 1 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: FONTS.bodyBold,
                      fontSize: 15,
                      lineHeight: 16,
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
                      lineHeight: 12,
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
              height: CTA_HEIGHT,
              borderRadius: 15,
              borderWidth: 1,
              borderColor: P.line,
              alignItems: 'center',
              justifyContent: 'center',
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
                    paddingVertical: 9,
                    paddingHorizontal: 4,
                    borderRadius: 13,
                    borderWidth: 1,
                    borderColor: P.line,
                    opacity: slot.enabled ? (pressed ? 0.6 : 1) : 0.38,
                  }}
                >
                  <Text style={{ fontSize: 16, lineHeight: 18, color: P.ink }}>{meta.glyph}</Text>
                  <Text
                    style={{
                      fontFamily: FONTS.bodyBold,
                      fontSize: 10,
                      lineHeight: 12,
                      color: P.ink,
                    }}
                  >
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

/** What the hint row says about a tile nobody has claimed. */
const UNOWNED_HINT = 'Unowned and ready for purchase';

/**
 * `#rrggbb` at a given alpha.
 *
 * The design tints this pill with `color-mix(… var(--blue) 16%, transparent)`,
 * which native has no equivalent for. Every colour reaching here is a system hue
 * from `LIQUIDATE_SYSTEM_COLORS`, and those are all six-digit hex.
 */
function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/**
 * How much of this tile's system the followed seat holds, as `2/3`.
 *
 * The design doc offers four treatments for this and marks the fraction chip as
 * the one in use. It is counted for the VIEWER, not the tile's owner — the
 * question it answers is "how close am I to the set", which is what decides
 * whether the tile on screen is worth its price.
 */
function SetChip({
  held,
  total,
  accent,
  label,
}: {
  held: number;
  total: number;
  accent: string;
  label: string;
}) {
  useThemeName();
  const P = LIQUIDATE_PANEL_COLORS;

  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{
        flexShrink: 0,
        paddingHorizontal: 9,
        paddingVertical: 2,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: withAlpha(accent, 0.4),
        backgroundColor: withAlpha(accent, 0.16),
      }}
    >
      {/*
        One `Text`, not a baseline-aligned row of two.

        The design sets the numerator and denominator at different sizes on a
        shared baseline, and `alignItems: 'baseline'` is the obvious way to say
        that — but Yoga measures a baseline row badly enough that the denominator
        rendered as a bare "1/" with the total clipped away. Nested text shares a
        baseline by definition and is measured once, as one line.
      */}
      <Text
        numberOfLines={1}
        style={{ fontFamily: FONTS.display, fontSize: 13, lineHeight: 16, color: accent }}
      >
        {held}
        <Text style={{ fontFamily: FONTS.display, fontSize: 10, color: P.dim }}>/{total}</Text>
      </Text>
    </View>
  );
}

/**
 * The hint line, and the tap that opens the rent ladder under it.
 *
 * One row doing two jobs, as the design draws it: the sentence explaining why
 * this tile matters, and the ladder's range as the affordance for expanding it.
 * Both are optional — an unowned planet nobody is close to completing has
 * nothing to say about itself, and a corner has no ladder — so the row falls
 * back to whichever half it has rather than disappearing, since a row that comes
 * and goes would move the board.
 */
function LadderRow({
  data,
  ownable,
  unowned,
  range,
  open,
  onToggle,
}: {
  data: InspectorData;
  ownable: boolean;
  unowned: boolean;
  range: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  useThemeName();
  const P = LIQUIDATE_PANEL_COLORS;

  const hasLadder = ownable && data.rent.length > 0;
  // `highlight` wins where it exists — "claiming this completes the system" is
  // worth more than saying the tile is for sale, which the price already does.
  const text =
    data.highlight ?? (unowned ? UNOWNED_HINT : ownable ? null : data.status);
  const span =
    range && data.rent.length > 1
      ? `${data.rent[0]!.value}–${data.rent[data.rent.length - 1]!.value}`
      : null;

  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        marginTop: 11,
        backgroundColor: P.hint,
        borderWidth: 1,
        borderColor: P.hintLine,
        borderRadius: 11,
        paddingHorizontal: 11,
        paddingVertical: 8,
      }}
    >
      {text && (
        <Text
          // One line, ellipsized, exactly as the design sets it. A second line
          // here would be a second height for the sheet, and so for the board.
          numberOfLines={1}
          style={{ flex: 1, fontFamily: FONTS.bodySemi, fontSize: 11, lineHeight: 15, color: P.hintInk }}
        >
          {text}
        </Text>
      )}
      {hasLadder && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <Text
            style={{
              fontFamily: FONTS.bodySemi,
              fontSize: 11,
              lineHeight: 15,
              opacity: 0.7,
              color: P.hintInk,
            }}
          >
            ladder
          </Text>
          {span && (
            <Text
              style={{ fontFamily: FONTS.display, fontSize: 11, lineHeight: 15, color: P.hintInk }}
            >
              {span}
            </Text>
          )}
          <Text
            style={{
              fontFamily: FONTS.display,
              fontSize: 11,
              lineHeight: 15,
              opacity: 0.7,
              color: P.hintInk,
              // The design rotates the chevron 90° when the ladder is open.
              transform: [{ rotate: open ? '90deg' : '0deg' }],
            }}
          >
            ›
          </Text>
        </View>
      )}
    </View>
  );

  if (!hasLadder) return text ? body : <View style={{ marginTop: 11, height: 33 }} />;

  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={
        open ? 'Hide the rent ladder' : `Show the rent ladder${span ? `, ${span}` : ''}`
      }
      accessibilityHint={text ?? undefined}
    >
      {({ pressed }) => <View style={{ opacity: pressed ? 0.7 : 1 }}>{body}</View>}
    </Pressable>
  );
}

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
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
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
              fontSize: 13,
              lineHeight: 15,
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
  const style = LIQUIDATE_DECK_STYLE[deck];

  return (
    <View
      accessible
      accessibilityLiveRegion="polite"
      style={{
        flex: 1,
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
      {/* Capped at the three lines that fit the sheet's floored block. A fourth
          would grow the sheet, and the board would jump while a card is read. */}
      <Text
        numberOfLines={3}
        style={{ fontFamily: FONTS.bodySemi, fontSize: 13.5, lineHeight: 19, color: P.ink }}
      >
        {text}
      </Text>
    </View>
  );
}
