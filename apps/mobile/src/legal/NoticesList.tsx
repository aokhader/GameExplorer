import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COLORS, FONT_SIZES, SPACING, useThemeName } from '@gameexplorer/ui';
import { Card, Icon } from '@/components/ui';
import { FONTS } from '@/theme/typography';
import { NOTICES, NOTICE_TEXTS, type Notice, type NoticeKind } from './notices.generated';

/**
 * Every third-party notice the app binary owes, grouped, each expandable to its
 * full licence text.
 *
 * The data is generated from a production bundle's source map by
 * `scripts/generate-mobile-notices.mjs`, so it lists what ships rather than
 * what the lockfile mentions. Texts stay collapsed by default: all of them at
 * once is over a hundred kilobytes of text, and nobody reads it that way.
 */

const GROUPS: { kinds: NoticeKind[]; label: string }[] = [
  { kinds: ['engine'], label: 'Chess engine' },
  { kinds: ['asset', 'content'], label: 'Fonts, icons, artwork and puzzles' },
  { kinds: ['library'], label: 'Libraries' },
];

function NoticeRow({ notice, first }: { notice: Notice; first: boolean }) {
  const [open, setOpen] = useState(false);
  const title = notice.name;
  return (
    <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: COLORS.border }}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${notice.license}`}
        accessibilityState={{ expanded: open }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING[3], paddingVertical: 12 }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.fg, fontSize: FONT_SIZES.sm, fontFamily: FONTS.bodyBold }}>{title}</Text>
          <Text style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.label, marginTop: 2 }}>
            {notice.version ? `${notice.version} · ` : ''}
            {notice.license}
          </Text>
        </View>
        {/* The vendored set has only left/right carets; a quarter turn reads as open. */}
        <Icon
          name="caret-right"
          size={FONT_SIZES.lg}
          color={COLORS.fgSubtle}
          style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}
        />
      </Pressable>
      {open && (
        <Text
          testID="notice-text"
          selectable
          style={{ color: COLORS.fgMuted, fontSize: FONT_SIZES.xs, lineHeight: 16, paddingBottom: 12 }}
        >
          {NOTICE_TEXTS[notice.textIndex]}
        </Text>
      )}
    </View>
  );
}

export function NoticesList() {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();
  return (
    <View>
      {GROUPS.map(({ kinds, label }) => {
        const rows = NOTICES.filter((n) => kinds.includes(n.kind));
        if (!rows.length) return null;
        return (
          <View key={label} style={{ marginBottom: 20 }}>
            <Text
              style={{
                color: COLORS.fgMuted,
                fontSize: FONT_SIZES.xs,
                fontFamily: FONTS.bodyBold,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 8,
              }}
            >
              {label}
            </Text>
            <Card style={{ paddingHorizontal: 16 }}>
              {rows.map((n, i) => (
                <NoticeRow key={`${n.name}@${n.version}`} notice={n} first={i === 0} />
              ))}
            </Card>
          </View>
        );
      })}
    </View>
  );
}
