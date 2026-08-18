import { useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { COLORS, useThemeName } from '@gameexplorer/ui';
import { FONTS } from '@/theme/typography';

export interface CustomEloPickerProps {
  value: number;
  onChange: (elo: number) => void;
  /** Weakest rating on offer. */
  min: number;
  /** Strongest rating on offer — lower when the native engine isn't linked. */
  max: number;
  /** Accent for the filled track, the thumb and the readout. */
  accent: string;
  /** Translucent accent for the card background. */
  tint: string;
}

/** Drag granularity. Typing a value is exact; dragging lands on round numbers. */
const DRAG_STEP = 25;
const STEPS = [-100, -25, 25, 100] as const;

const TRACK_HEIGHT = 8;
const THUMB = 26;

/**
 * Exact-rating control for the "Custom" bot tier — a drag track for finding a
 * ballpark, ± buttons for nudging, and a readout you can tap and type into when
 * you want a specific number (e.g. matching your own rating exactly).
 *
 * The bounds come from the caller because they depend on the build: without the
 * native Arasan engine linked in, the in-house TS engine tops out just under
 * `ENGINE_MIN_ELO` and the ceiling drops to match.
 */
export function CustomEloPicker({
  value,
  onChange,
  min,
  max,
  accent,
  tint,
}: CustomEloPickerProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  // Raw text while the readout is being edited; null when it isn't. Committing
  // on every keystroke would fight the user ("16" clamps to the 400 floor before
  // they can finish typing "1650").
  const [draft, setDraft] = useState<string | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);

  const clamp = (elo: number) => Math.max(min, Math.min(max, elo));

  // The gesture is built once, so it reads the live handler through a ref
  // (same pattern as the boards).
  const seekRef = useRef<(x: number) => void>(() => {});
  seekRef.current = (x: number) => {
    if (trackWidth <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / trackWidth));
    const raw = min + ratio * (max - min);
    const next = clamp(Math.round(raw / DRAG_STEP) * DRAG_STEP);
    if (next !== value) onChange(next);
  };

  const gesture = useMemo(() => {
    const seek = (x: number) => seekRef.current(x);
    // runOnJS(true): unlike the boards, nothing here animates on the UI thread —
    // every update is a plain setState — so the handlers run on the JS thread and
    // this component needs no worklets at all.
    const tap = Gesture.Tap().runOnJS(true).onEnd((e) => seek(e.x));
    // activeOffsetX so a vertical swipe still scrolls the setup page; only a
    // sideways drag claims the track.
    const pan = Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-6, 6])
      .onUpdate((e) => seek(e.x));
    return Gesture.Race(pan, tap);
  }, []);

  const ratio = max > min ? (value - min) / (max - min) : 0;
  const thumbLeft = ratio * Math.max(0, trackWidth - THUMB);

  const commitDraft = () => {
    const parsed = Number.parseInt(draft ?? '', 10);
    if (Number.isFinite(parsed)) onChange(clamp(parsed));
    setDraft(null);
  };

  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: tint,
        padding: 16,
        gap: 14,
        marginBottom: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <View style={{ flexShrink: 1 }}>
          <Text style={{ color: COLORS.fg, fontFamily: FONTS.displaySemi, fontSize: 15 }}>
            Custom rating
          </Text>
          <Text style={{ color: COLORS.fgMuted, fontSize: 12, marginTop: 2 }}>
            {strengthBlurb(value)}
          </Text>
        </View>
        <TextInput
          value={draft ?? String(value)}
          onChangeText={(text) => setDraft(text.replace(/[^0-9]/g, '').slice(0, 4))}
          onFocus={() => setDraft(String(value))}
          onBlur={commitDraft}
          onSubmitEditing={commitDraft}
          keyboardType="number-pad"
          returnKeyType="done"
          selectTextOnFocus
          accessibilityLabel={`Bot rating, ${value}. Type a rating between ${min} and ${max}`}
          style={{
            minWidth: 92,
            textAlign: 'right',
            color: accent,
            fontFamily: FONTS.displaySemi,
            fontSize: 30,
            padding: 0,
          }}
        />
      </View>

      {/* Drag track */}
      <GestureDetector gesture={gesture}>
        <View
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
          accessibilityRole="adjustable"
          accessibilityLabel="Bot rating"
          accessibilityValue={{ min, max, now: value }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) =>
            onChange(
              clamp(value + (e.nativeEvent.actionName === 'increment' ? DRAG_STEP : -DRAG_STEP)),
            )
          }
          // Padded vertically so the whole strip is grabbable, not just the 8px rail.
          style={{ justifyContent: 'center', height: THUMB + 12 }}
        >
          <View
            style={{
              height: TRACK_HEIGHT,
              borderRadius: TRACK_HEIGHT / 2,
              backgroundColor: COLORS.surfaceMuted,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${ratio * 100}%`,
                height: '100%',
                backgroundColor: accent,
              }}
            />
          </View>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: thumbLeft,
              width: THUMB,
              height: THUMB,
              borderRadius: THUMB / 2,
              backgroundColor: accent,
              borderWidth: 3,
              borderColor: COLORS.surface,
            }}
          />
        </View>
      </GestureDetector>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: COLORS.fgSubtle, fontSize: 11 }}>{min}</Text>
        <Text style={{ color: COLORS.fgSubtle, fontSize: 11 }}>{max}</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {STEPS.map((step) => {
          const next = clamp(value + step);
          const disabled = next === value;
          return (
            <Pressable
              key={step}
              onPress={() => onChange(next)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityLabel={`${step > 0 ? 'Increase' : 'Decrease'} rating by ${Math.abs(step)}`}
              accessibilityState={{ disabled }}
              style={{
                flex: 1,
                minHeight: 40,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.surfaceMuted,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: disabled ? 0.35 : 1,
              }}
            >
              <Text style={{ color: COLORS.fg, fontSize: 13, fontFamily: FONTS.bodyBold }}>
                {step > 0 ? `+${step}` : step}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Plain-language sense of a rating, so a number the player picked out of the air
 * still tells them what they're in for. Bands follow the preset ladder.
 */
function strengthBlurb(elo: number): string {
  if (elo < 800) return 'Beginner — hangs pieces often';
  if (elo < 1100) return 'Novice — spots one-move threats';
  if (elo < 1400) return 'Club player — beatable with tactics';
  if (elo < 1800) return 'Intermediate — rarely blunders';
  if (elo < 2200) return 'Advanced — finds deep combinations';
  if (elo < 2500) return 'Expert — punishes every mistake';
  return 'Master — extremely strong';
}
