import { Alert, Linking, Pressable, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { COLORS, RADIUS, type ThemeName, useThemeName } from '@gameexplorer/ui';
import { Screen, BackHeader, Card, Toggle } from '@/components/ui';
import { useSettings, type Settings } from '@/providers/SettingsProvider';
import { playSfx } from '@/audio/sfxPlayer';
import { DeleteAccountCard } from '@/components/settings/DeleteAccountCard';
import {
  PRIVACY_URL,
  SOURCE_REPO_URL,
  SUPPORT_EMAIL,
  TERMS_URL,
  supportMailtoUrl,
} from '@/config/support';

/** Settings a Toggle can drive — the boolean ones. */
type BooleanSettingKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

function SettingRow({
  title,
  description,
  settingKey,
  first,
  onAfterChange,
}: {
  title: string;
  description: string;
  settingKey: BooleanSettingKey;
  first?: boolean;
  /** Fired after the setting is written — used to demo sound/haptics on enable. */
  onAfterChange?: (next: boolean) => void;
}) {
  const { settings, setSetting } = useSettings();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        paddingVertical: 16,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: COLORS.border,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: COLORS.fg, fontSize: 15, fontWeight: '700' }}>{title}</Text>
        <Text style={{ color: COLORS.fgMuted, fontSize: 13, marginTop: 2 }}>{description}</Text>
      </View>
      <Toggle
        value={settings[settingKey]}
        label={title}
        onValueChange={(next) => {
          setSetting(settingKey, next);
          onAfterChange?.(next);
        }}
      />
    </View>
  );
}

/** A tappable row (chevron) — external links / actions, matching SettingRow. */
function LinkRow({
  title,
  description,
  onPress,
  first,
}: {
  title: string;
  description: string;
  onPress: () => void;
  first?: boolean;
}) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      // Static style object — the function form renders unstyled here (matches
      // the SettingRow pattern used everywhere else in the app).
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        paddingVertical: 16,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: COLORS.border,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: COLORS.fg, fontSize: 15, fontWeight: '700' }}>{title}</Text>
        <Text style={{ color: COLORS.fgMuted, fontSize: 13, marginTop: 2 }}>{description}</Text>
      </View>
      <Text style={{ color: COLORS.fgSubtle, fontSize: 20, fontWeight: '700' }}>›</Text>
    </Pressable>
  );
}

/**
 * Theme picker. Each card previews its own theme, so the swatches are literal hex
 * rather than tokens — a card has to show its palette while the *other* theme is
 * the active one, which a live token can't do. Keep in step with `THEMES` in
 * `packages/ui/src/tokens.ts` if a palette moves.
 */
interface ThemeOption {
  id: ThemeName;
  name: string;
  tagline: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  fg: string;
  fgMuted: string;
  accent: string;
  boardLight: string;
  boardDark: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'dark',
    name: 'Arcade Glow',
    tagline: 'Neon on near-black, gold action.',
    surface: '#0b0e17',
    surfaceAlt: '#141b2d',
    border: '#2b3652',
    fg: '#e7ecf6',
    fgMuted: '#9aa6bd',
    accent: '#cda43f',
    boardLight: '#445576',
    boardDark: '#2a3550',
  },
  {
    id: 'cozy',
    name: 'Cozy Tabletop',
    tagline: 'Warm wood and felt, green action.',
    surface: '#efe6d3',
    surfaceAlt: '#faf4e8',
    border: '#cdbb98',
    fg: '#2c2117',
    fgMuted: '#5e5341',
    accent: '#2f6e4e',
    boardLight: '#e7c9a0',
    boardDark: '#a9743f',
  },
];

function ThemeCard({ option, selected, onSelect }: {
  option: ThemeOption;
  selected: boolean;
  onSelect: () => void;
}) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${option.name}. ${option.tagline}`}
      style={{
        flex: 1,
        borderRadius: RADIUS.lg,
        padding: 10,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? COLORS.accent : COLORS.border,
        backgroundColor: COLORS.surfaceAlt,
      }}
    >
      {/* Miniature of the theme: a board corner, a card, an action pill. */}
      <View
        style={{
          borderRadius: RADIUS.md,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: option.border,
          backgroundColor: option.surface,
          padding: 8,
          flexDirection: 'row',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <View style={{ width: 44, height: 44, flexDirection: 'row', flexWrap: 'wrap' }}>
          {Array.from({ length: 16 }, (_, i) => (
            <View
              key={i}
              style={{
                width: 11,
                height: 11,
                backgroundColor:
                  ((i >> 2) + i) % 2 === 0 ? option.boardLight : option.boardDark,
              }}
            />
          ))}
        </View>
        <View
          style={{
            flex: 1,
            borderRadius: RADIUS.sm,
            backgroundColor: option.surfaceAlt,
            borderWidth: 1,
            borderColor: option.border,
            padding: 6,
            justifyContent: 'space-between',
          }}
        >
          <View style={{ gap: 3 }}>
            <View style={{ height: 4, width: '62%', borderRadius: 2, backgroundColor: option.fg }} />
            <View style={{ height: 3, width: '86%', borderRadius: 2, backgroundColor: option.fgMuted }} />
          </View>
          <View style={{ height: 9, width: 34, borderRadius: 3, backgroundColor: option.accent }} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ color: COLORS.fg, fontSize: 14, fontWeight: '700', flexShrink: 1 }}>
          {option.name}
        </Text>
        {selected && (
          <Text
            style={{
              color: COLORS.onAccent,
              backgroundColor: COLORS.accent,
              fontSize: 10,
              fontWeight: '800',
              paddingHorizontal: 6,
              paddingVertical: 1,
              borderRadius: 999,
              overflow: 'hidden',
            }}
          >
            Active
          </Text>
        )}
      </View>
      <Text style={{ color: COLORS.fgMuted, fontSize: 12, marginTop: 2 }}>{option.tagline}</Text>
    </Pressable>
  );
}

function ThemePicker() {
  const { settings, setSetting } = useSettings();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Theme"
      style={{ flexDirection: 'row', gap: 10, paddingVertical: 4 }}
    >
      {THEME_OPTIONS.map((option) => (
        <ThemeCard
          key={option.id}
          option={option}
          selected={settings.theme === option.id}
          onSelect={() => setSetting('theme', option.id)}
        />
      ))}
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  return (
    <Text
      style={{
        color: COLORS.fgMuted,
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
        marginTop: 4,
      }}
    >
      {children}
    </Text>
  );
}

/**
 * Device preferences (persisted by SettingsProvider) + the account Danger Zone.
 * Mirrors the web /settings page. Preferences are device-local; the delete row
 * only appears when signed in.
 */
export default function SettingsScreen() {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  return (
    <Screen>
      <BackHeader fallbackHref="/" />
      <Text style={{ color: COLORS.fg, fontSize: 28, fontWeight: '800' }}>Settings</Text>
      <Text style={{ color: COLORS.fgMuted, fontSize: 14, marginTop: 4, marginBottom: 20 }}>
        Preferences are saved on this device.
      </Text>

      <SectionLabel>Appearance</SectionLabel>
      <Text style={{ color: COLORS.fgMuted, fontSize: 13, marginBottom: 10 }}>
        Applies everywhere — screens, boards and pieces.
      </Text>
      <View style={{ marginBottom: 20 }}>
        <ThemePicker />
      </View>

      <SectionLabel>Sound &amp; feedback</SectionLabel>
      <Card style={{ paddingHorizontal: 16, marginBottom: 20 }}>
        <SettingRow
          first
          title="Sound effects"
          description="Play subtle sounds for moves, captures, and wins."
          settingKey="sound"
          // Give immediate feedback so the toggle is self-demonstrating, the
          // same way web's settings page does. Called directly rather than
          // through useGameSfx: the hook reads the setting from context, which
          // has not re-rendered yet at this point.
          onAfterChange={(next) => next && playSfx('move')}
        />
        <SettingRow
          title="Haptics"
          description="Vibrate on key moments (supported devices)."
          settingKey="haptics"
          onAfterChange={(next) => next && void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)}
        />
      </Card>

      <SectionLabel>Motion</SectionLabel>
      <Card style={{ paddingHorizontal: 16, marginBottom: 20 }}>
        <SettingRow
          first
          title="Reduce motion"
          description="Minimize animations. Your system setting is also respected."
          settingKey="reduceMotion"
        />
      </Card>

      <SectionLabel>Board</SectionLabel>
      <Card style={{ paddingHorizontal: 16, marginBottom: 20 }}>
        <SettingRow
          first
          title="Show coordinates"
          description="Display rank and file labels along the board edge."
          settingKey="showCoordinates"
        />
        <SettingRow
          title="Flip board in pass & play"
          description="Rotate the board to face whoever's turn it is."
          settingKey="flipBoardPassAndPlay"
        />
      </Card>

      <SectionLabel>Help &amp; support</SectionLabel>
      <Card style={{ paddingHorizontal: 16, marginBottom: 20 }}>
        <LinkRow
          first
          title="Contact support"
          description={`Found a bug or have a concern? ${SUPPORT_EMAIL}`}
          onPress={() => {
            // Pre-filled with app version + platform; if no mail app is set up,
            // surface the address so the user can reach us some other way.
            Linking.openURL(supportMailtoUrl()).catch(() =>
              Alert.alert('Contact support', `Email us at ${SUPPORT_EMAIL}`),
            );
          }}
        />
        <LinkRow
          title="Terms of service"
          description="Fair play, community rules, and what to expect from the service."
          onPress={() => {
            WebBrowser.openBrowserAsync(TERMS_URL).catch(() => Linking.openURL(TERMS_URL));
          }}
        />
        <LinkRow
          title="Privacy policy"
          description="How your data is handled, on web and mobile."
          onPress={() => {
            WebBrowser.openBrowserAsync(PRIVACY_URL).catch(() => Linking.openURL(PRIVACY_URL));
          }}
        />
        {/* Attribution for the bundled engine. The binary has been all-MIT since
            Arasan replaced GPL Stockfish (July 2026) — see apps/mobile/LICENSE.md. */}
        <LinkRow
          title="Open source"
          description="MIT licensed · powered by the Arasan chess engine. View the source and notices."
          onPress={() => {
            WebBrowser.openBrowserAsync(SOURCE_REPO_URL).catch(() => Linking.openURL(SOURCE_REPO_URL));
          }}
        />
      </Card>

      <DeleteAccountCard />
    </Screen>
  );
}
