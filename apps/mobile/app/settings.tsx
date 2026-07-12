import { Alert, Linking, Pressable, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { COLORS } from '@gameexplorer/ui';
import { Screen, BackHeader, Card, Toggle } from '@/components/ui';
import { useSettings, type Settings } from '@/providers/SettingsProvider';
import { DeleteAccountCard } from '@/components/settings/DeleteAccountCard';
import { PRIVACY_URL, SUPPORT_EMAIL, supportMailtoUrl } from '@/config/support';

function SettingRow({
  title,
  description,
  settingKey,
  first,
}: {
  title: string;
  description: string;
  settingKey: keyof Settings;
  first?: boolean;
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
        onValueChange={(next) => setSetting(settingKey, next)}
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

function SectionLabel({ children }: { children: string }) {
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
  return (
    <Screen>
      <BackHeader fallbackHref="/" />
      <Text style={{ color: COLORS.fg, fontSize: 28, fontWeight: '800' }}>Settings</Text>
      <Text style={{ color: COLORS.fgMuted, fontSize: 14, marginTop: 4, marginBottom: 20 }}>
        Preferences are saved on this device.
      </Text>

      <SectionLabel>Sound &amp; feedback</SectionLabel>
      <Card style={{ paddingHorizontal: 16, marginBottom: 20 }}>
        <SettingRow
          first
          title="Sound effects"
          description="Play subtle sounds for moves, captures, and wins."
          settingKey="sound"
        />
        <SettingRow
          title="Haptics"
          description="Vibrate on key moments (supported devices)."
          settingKey="haptics"
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
          title="Privacy policy"
          description="How your data is handled, on web and mobile."
          onPress={() => {
            WebBrowser.openBrowserAsync(PRIVACY_URL).catch(() => Linking.openURL(PRIVACY_URL));
          }}
        />
      </Card>

      <DeleteAccountCard />
    </Screen>
  );
}
