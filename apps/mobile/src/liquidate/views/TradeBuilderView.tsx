import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  LiquidateEngine,
  formatCredits,
  groupLabel,
  isOwnable,
  type LiquidateAction,
  type LiquidateGameState,
  type LiquidateTile,
  type OwnableTile,
} from '@gameexplorer/shared';
import { LIQUIDATE_PANEL_COLORS, useThemeName } from '@gameexplorer/ui';
import { FONTS } from '@/theme/typography';
import { seatColor, tileAccent } from '../lqTheme';
import { ViewHeader, ViewSection, ViewActionBar, AccentButton, GhostButton } from './ViewChrome';

const CREDIT_STEPS = [25, 100];

export interface TradeBuilderViewProps {
  state: LiquidateGameState;
  youId: string | null;
  deviceIds: readonly string[];
  dispatch: (action: LiquidateAction) => void;
  onBack: () => void;
}

/**
 * Build an offer.
 *
 * The engine cannot enumerate `propose-trade` — its payload is constructed, not
 * chosen from a list — so this screen validates by calling `applyAction`'s own
 * guards through a dry run before enabling Send. That keeps the rules in one
 * place: a developed planet cannot be traded, and the engine says so.
 */
export function TradeBuilderView({ state, dispatch, onBack }: TradeBuilderViewProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();
  const P = LIQUIDATE_PANEL_COLORS;

  const from = state.players[state.currentPlayerIndex]!;
  const partners = state.players.filter((p) => p.id !== from.id && !p.bankrupt);

  const [toId, setToId] = useState(partners[0]?.id ?? '');
  const [offerTiles, setOfferTiles] = useState<number[]>([]);
  const [requestTiles, setRequestTiles] = useState<number[]>([]);
  const [offerCredits, setOfferCredits] = useState(0);
  const [requestCredits, setRequestCredits] = useState(0);

  const board = LiquidateEngine.board(state);
  const to = state.players.find((p) => p.id === toId) ?? null;

  const mine = board.filter(
    (t): t is OwnableTile => isOwnable(t) && state.tiles[t.id]!.ownerId === from.id,
  );
  const theirs = board.filter(
    (t): t is OwnableTile => isOwnable(t) && state.tiles[t.id]!.ownerId === toId,
  );

  const offer = useMemo(
    () => ({ toId, offerTiles, requestTiles, offerCredits, requestCredits }),
    [toId, offerTiles, requestTiles, offerCredits, requestCredits],
  );

  // Ask the engine rather than re-deriving its guards here.
  const check = useMemo(
    () => LiquidateEngine.applyAction(state, { type: 'propose-trade', trade: offer }),
    [state, offer],
  );
  const empty =
    offerTiles.length === 0 &&
    requestTiles.length === 0 &&
    offerCredits === 0 &&
    requestCredits === 0;

  const net =
    requestTiles.reduce((s, id) => s + priceOf(board[id]), 0) +
    requestCredits -
    (offerTiles.reduce((s, id) => s + priceOf(board[id]), 0) + offerCredits);

  const toggle = (list: number[], setList: (v: number[]) => void, id: number) =>
    setList(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  if (!to) {
    return (
      <View style={{ flex: 1 }}>
        <ViewHeader title="Propose trade" sub="No one to trade with" onBack={onBack} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ViewHeader title="Propose trade" sub={`with ${to.name}`} onBack={onBack} />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 18, gap: 12 }}>
        {partners.length > 1 && (
          <View>
            <ViewSection>Partner</ViewSection>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {partners.map((p) => {
                const selected = p.id === toId;
                const seat = state.players.findIndex((q) => q.id === p.id);
                return (
                  <Pressable
                    key={p.id}
                    onPress={() => {
                      setToId(p.id);
                      setRequestTiles([]);
                      setRequestCredits(0);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Trade with ${p.name}`}
                    accessibilityState={{ selected }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 7,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                      borderRadius: 11,
                      borderWidth: selected ? 2 : 1,
                      borderColor: selected ? P.accent : P.line,
                      backgroundColor: selected ? P.hint : P.panel2,
                    }}
                  >
                    <View
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: 4.5,
                        backgroundColor: seatColor(seat),
                      }}
                    />
                    <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12, color: P.ink }}>
                      {p.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <TileChooser
          title="You give"
          dotColor={P.you}
          tiles={mine}
          selected={offerTiles}
          onToggle={(id) => toggle(offerTiles, setOfferTiles, id)}
          credits={offerCredits}
          maxCredits={from.credits}
          onCredits={setOfferCredits}
          creditsLabel="from your reserve"
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: P.line }} />
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              borderWidth: 1,
              borderColor: P.line,
              backgroundColor: P.panel,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 14, color: P.accent }}>⇅</Text>
          </View>
          <View style={{ flex: 1, height: 1, backgroundColor: P.line }} />
        </View>

        <TileChooser
          title="You get"
          dotColor={seatColor(state.players.findIndex((p) => p.id === toId))}
          tiles={theirs}
          selected={requestTiles}
          onToggle={(id) => toggle(requestTiles, setRequestTiles, id)}
          credits={requestCredits}
          maxCredits={to.credits}
          onCredits={setRequestCredits}
          creditsLabel={`from ${to.name}'s reserve`}
        />

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 13,
            paddingVertical: 11,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: P.hintLine,
            backgroundColor: P.hint,
          }}
        >
          <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 11.5, color: P.hintInk }}>
            Net to you
          </Text>
          <Text style={{ fontFamily: FONTS.display, fontSize: 15, color: P.hintInk }}>
            {net >= 0 ? '+' : ''}
            {formatCredits(net)}
          </Text>
        </View>

        {!empty && !check.valid && check.reason && (
          <Text
            style={{
              fontFamily: FONTS.bodySemi,
              fontSize: 11.5,
              color: '#ef5f6b',
              textAlign: 'center',
            }}
          >
            {check.reason}
          </Text>
        )}
      </ScrollView>

      <ViewActionBar>
        <View style={{ flexDirection: 'row', gap: 9 }}>
          <GhostButton label="Cancel" onPress={onBack} style={{ width: 96 }} />
          <AccentButton
            label={`Send offer to ${to.name}`}
            disabled={empty || !check.valid}
            onPress={() => {
              dispatch({ type: 'propose-trade', trade: offer });
              onBack();
            }}
            style={{ flex: 1 }}
          />
        </View>
      </ViewActionBar>
    </View>
  );
}

/** Only ownable tiles carry a price; everything else contributes nothing. */
function priceOf(tile: LiquidateTile | undefined): number {
  return tile && isOwnable(tile) ? tile.price : 0;
}

/** One side of the builder: tappable holdings plus a credit stepper. */
function TileChooser({
  title,
  dotColor,
  tiles,
  selected,
  onToggle,
  credits,
  maxCredits,
  onCredits,
  creditsLabel,
}: {
  title: string;
  dotColor: string;
  tiles: readonly OwnableTile[];
  selected: number[];
  onToggle: (id: number) => void;
  credits: number;
  maxCredits: number;
  onCredits: (v: number) => void;
  creditsLabel: string;
}) {
  useThemeName();
  const P = LIQUIDATE_PANEL_COLORS;

  return (
    <View
      style={{
        backgroundColor: P.panel,
        borderWidth: 1,
        borderColor: P.line,
        borderRadius: 16,
        padding: 14,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 11 }}>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dotColor }} />
        <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12, color: P.ink }}>{title}</Text>
      </View>

      {tiles.length === 0 ? (
        <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 11.5, color: P.soft }}>
          No holdings to offer.
        </Text>
      ) : (
        tiles.map((tile) => {
          const on = selected.includes(tile.id);
          return (
            <Pressable
              key={tile.id}
              onPress={() => onToggle(tile.id)}
              accessibilityRole="checkbox"
              accessibilityLabel={`${tile.name}, ${groupLabel(tile)}`}
              accessibilityState={{ checked: on }}
            >
              {({ pressed }) => (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 9,
                    paddingVertical: 8,
                    borderTopWidth: 1,
                    borderTopColor: P.line,
                    opacity: pressed ? 0.6 : 1,
                  }}
                >
                  <View
                    style={{
                      width: 6,
                      height: 26,
                      borderRadius: 3,
                      backgroundColor: tileAccent(tile),
                    }}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{
                        fontFamily: FONTS.bodyBold,
                        fontSize: 12.5,
                        color: on ? P.accent : P.ink,
                      }}
                    >
                      {tile.name}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{ fontFamily: FONTS.bodySemi, fontSize: 10, color: P.soft }}
                    >
                      {groupLabel(tile)}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: FONTS.display, fontSize: 12, color: P.ink }}>
                    {formatCredits(tile.price)}
                  </Text>
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 5,
                      borderWidth: on ? 0 : 1,
                      borderColor: P.line,
                      backgroundColor: on ? P.accent : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {on && (
                      <Text style={{ fontSize: 11, color: P.accentInk }}>✓</Text>
                    )}
                  </View>
                </View>
              )}
            </Pressable>
          );
        })
      )}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginTop: 12,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: P.line,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 12, color: P.ink }}>
            {formatCredits(credits)}
          </Text>
          <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 10, color: P.soft }}>
            {creditsLabel}
          </Text>
        </View>
        {CREDIT_STEPS.map((step) => (
          <GhostButton
            key={step}
            label={`+${step}`}
            accessibilityLabel={`Add ${step} credits to ${title}`}
            disabled={credits + step > maxCredits}
            onPress={() => onCredits(Math.min(credits + step, maxCredits))}
            style={{ width: 56 }}
          />
        ))}
        <GhostButton
          label="0"
          accessibilityLabel={`Clear the credits on ${title}`}
          disabled={credits === 0}
          onPress={() => onCredits(0)}
          style={{ width: 44 }}
        />
      </View>
    </View>
  );
}
