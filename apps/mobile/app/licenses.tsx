import { Linking, Text } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { COLORS, FONT_SIZES, useThemeName } from '@gameexplorer/ui';
import { Screen, BackHeader } from '@/components/ui';
import { SOURCE_REPO_URL } from '@/config/support';
import { NoticesList } from '@/legal/NoticesList';
import { FONTS } from '@/theme/typography';

/**
 * Open-source notices — the in-app counterpart to the web's /licenses page.
 *
 * The permissive licences the app is built on (MIT, BSD, Apache, ISC) and the
 * OFL on its fonts all ask for their notice to travel with the binary. Linking
 * to the repository alone does not do that, which is why this screen exists.
 */
export default function LicensesScreen() {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();
  return (
    <Screen>
      <BackHeader fallbackHref="/settings" />
      <Text style={{ color: COLORS.fg, fontSize: FONT_SIZES.display, fontFamily: FONTS.display }}>
        Open-source notices
      </Text>
      <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.sm, marginTop: 4, marginBottom: 20 }}>
        GameExplorer&apos;s own code is released under the MIT License — the GameExplorer name and
        logo excepted.{' '}
        <Text
          accessibilityRole="link"
          style={{ color: COLORS.info, textDecorationLine: 'underline' }}
          onPress={() => {
            WebBrowser.openBrowserAsync(SOURCE_REPO_URL).catch(() => Linking.openURL(SOURCE_REPO_URL));
          }}
        >
          View the source
        </Text>
        . The app also contains the software, fonts and content below, each under its own licence.
        Tap an entry for its full text.
      </Text>
      <NoticesList />
    </Screen>
  );
}
