import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { DockSlot, LiquidateAction, LiquidateGameState } from '@finesse/shared';
import { LIQUIDATE_PANEL_COLORS, useThemeName } from '@finesse/ui';
import { FONTS } from '@/theme/typography';
import { ViewHeader, GhostButton } from './ViewChrome';
import type { LqView } from './types';

/** Matches `GameBar`'s two-tap resign window, so the gesture feels the same. */
const CONFIRM_MS = 3000;

export interface MenuViewProps {
  state: LiquidateGameState;
  youId: string | null;
  deviceIds: readonly string[];
  dispatch: (action: LiquidateAction) => void;
  onBack: () => void;
  roundLabel: string;
  dock: readonly DockSlot[];
  onOpen: (view: LqView) => void;
  onSettings: () => void;
  onResign: () => void;
}

/** Names only at module scope; the glyph colours are read during render. */
const ROWS: { view: LqView; glyph: string; label: string; sub: string; slot?: DockSlot['id'] }[] = [
  { view: 'full', glyph: '⤢', label: 'Full board', sub: 'Whole ring, owners & colonies' },
  { view: 'standings', glyph: '☰', label: 'Standings & log', sub: 'Net worth and match history' },
  { view: 'holdings', glyph: '⚒', label: 'Manage holdings', sub: 'Build, mortgage, sell back', slot: 'manage' },
  { view: 'auction', glyph: '⇄', label: 'Auction', sub: 'Bid on the unclaimed tile', slot: 'auction' },
  { view: 'trade', glyph: '⇆', label: 'Trade', sub: 'Propose a swap with a rival', slot: 'trade' },
];

export function MenuView({ roundLabel, state, dock, onOpen, onSettings, onResign, onBack }: MenuViewProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();
  const P = LIQUIDATE_PANEL_COLORS;

  const [confirming, setConfirming] = useState(false);
  // Read synchronously by the press handler — state has not committed yet when
  // the second tap arrives.
  const confirmingRef = useRef(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => {
      setConfirming(false);
      confirmingRef.current = false;
    }, CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  const pressResign = () => {
    if (confirmingRef.current) {
      onResign();
      return;
    }
    confirmingRef.current = true;
    setConfirming(true);
  };

  const enabledOf = (slot?: DockSlot['id']) =>
    slot ? (dock.find((d) => d.id === slot)?.enabled ?? slotFallback(state, slot)) : true;

  return (
    <View style={{ flex: 1 }}>
      <ViewHeader
        title="Menu"
        sub={`${state.config.mode === 'quick' ? 'Quick' : 'Full'} match · ${roundLabel}`}
        onBack={onBack}
      />

      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 22, gap: 9 }}>
        {ROWS.map((row) => {
          const enabled = enabledOf(row.slot);
          return (
            <Pressable
              key={row.view}
              onPress={() => onOpen(row.view)}
              disabled={!enabled}
              accessibilityRole="button"
              accessibilityLabel={`${row.label} — ${row.sub}`}
              accessibilityState={{ disabled: !enabled }}
            >
              {({ pressed }) => (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 13,
                    padding: 15,
                    borderRadius: 15,
                    borderWidth: 1,
                    borderColor: P.line,
                    backgroundColor: P.panel,
                    opacity: enabled ? (pressed ? 0.7 : 1) : 0.4,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: P.line,
                      backgroundColor: P.panel2,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ fontSize: 18, color: P.accent }}>{row.glyph}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: P.ink }}>
                      {row.label}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{ fontFamily: FONTS.bodySemi, fontSize: 10.5, color: P.soft, marginTop: 2 }}
                    >
                      {row.sub}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 18, color: P.dim }}>›</Text>
                </View>
              )}
            </Pressable>
          );
        })}

        <Pressable onPress={onSettings} accessibilityRole="button" accessibilityLabel="Settings — sound, animations, theme">
          {({ pressed }) => (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 13,
                padding: 15,
                borderRadius: 15,
                borderWidth: 1,
                borderColor: P.line,
                backgroundColor: P.panel,
                opacity: pressed ? 0.7 : 1,
              }}
            >
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: P.line,
                  backgroundColor: P.panel2,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 18, color: P.dim }}>⚙</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: FONTS.bodyBold, fontSize: 14, color: P.ink }}>Settings</Text>
                <Text style={{ fontFamily: FONTS.bodySemi, fontSize: 10.5, color: P.soft, marginTop: 2 }}>
                  Sound, animations, theme
                </Text>
              </View>
              <Text style={{ fontSize: 18, color: P.dim }}>›</Text>
            </View>
          )}
        </Pressable>

        <View style={{ height: 8 }} />

        {/*
          Two taps, like `GameBar`'s resign. Not `declare-bankruptcy` — that is
          only legal while settling a debt — so this leaves the match and clears
          the saved slot rather than folding a seat inside the game.
        */}
        <GhostButton
          label={confirming ? 'Tap again to leave' : 'Resign match'}
          accessibilityLabel={confirming ? 'Confirm resign' : 'Resign match'}
          onPress={pressResign}
          danger
        />
      </ScrollView>
    </View>
  );
}

/**
 * `dockSlots` only ever returns four entries, so a menu row whose slot is not
 * among them (Auction on a normal turn, Manage during one) has to decide for
 * itself. Auction exists only while one is running; everything else follows the
 * dock.
 */
function slotFallback(state: LiquidateGameState, slot: DockSlot['id']): boolean {
  if (slot === 'auction') return state.phase === 'auction';
  return false;
}
