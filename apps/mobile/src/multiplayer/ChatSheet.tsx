import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { COLORS, useThemeName } from '@finesse/ui';
import { Sheet } from '@/components/ui/Sheet';
import { TextField } from '@/components/ui';
import { FONTS } from '@/theme/typography';

export interface ChatMessage {
  userId: string;
  username: string;
  text: string;
}

export interface ChatSheetProps {
  open: boolean;
  onClose: () => void;
  log: ChatMessage[];
  /** The signed-in player's id, so their own lines can be told apart. */
  myUserId: string | null;
  text: string;
  onChangeText: (next: string) => void;
  onSend: () => void;
  /** Sending is only possible while a game is running. */
  canSend: boolean;
}

/** Matches the server-side cap on `send_chat`. */
const MAX_CHARS = 200;

/**
 * In-game chat as a bottom sheet.
 *
 * Web keeps chat permanently open in the side rail; a phone has no side rail,
 * and a permanent chat panel would cost the board the vertical space it needs.
 * So chat lives behind the bar's 💬 button, which carries an unread badge — the
 * conversation is never more than one tap away, and never in the way of a move.
 */
export function ChatSheet({
  open,
  onClose,
  log,
  myUserId,
  text,
  onChangeText,
  onSend,
  canSend,
}: ChatSheetProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const scrollRef = useRef<ScrollView>(null);

  // Follow the conversation: a new message while the sheet is open should be
  // visible without a scroll.
  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(id);
  }, [open, log.length]);

  return (
    <Sheet open={open} onClose={onClose} closeLabel="Close chat">
      <Text
        style={{
          color: COLORS.fgMuted,
          fontFamily: FONTS.displaySemi,
          fontSize: 13,
          letterSpacing: 0.6,
          marginBottom: 8,
        }}
      >
        CHAT
      </Text>

      <ScrollView
        ref={scrollRef}
        style={{ maxHeight: 220 }}
        contentContainerStyle={{ gap: 6, paddingBottom: 8 }}
        keyboardShouldPersistTaps="handled"
      >
        {log.length === 0 ? (
          <Text style={{ color: COLORS.fgSubtle, fontFamily: FONTS.body, fontSize: 13 }}>
            No messages yet — say hello.
          </Text>
        ) : (
          log.map((m, i) => {
            const mine = !!myUserId && m.userId === myUserId;
            return (
              <Text
                key={i}
                style={{ color: COLORS.fgMuted, fontFamily: FONTS.body, fontSize: 14, lineHeight: 20 }}
              >
                <Text style={{ color: mine ? COLORS.accentHover : COLORS.fg, fontFamily: FONTS.bodyBold }}>
                  {m.username}:{' '}
                </Text>
                {m.text}
              </Text>
            );
          })
        )}
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 }}>
        <View style={{ flex: 1 }}>
          <TextField
            value={text}
            onChangeText={onChangeText}
            placeholder="Message…"
            maxLength={MAX_CHARS}
            returnKeyType="send"
            onSubmitEditing={onSend}
            // The sheet stays open on send, so a reply doesn't cost another tap.
            blurOnSubmit={false}
            editable={canSend}
            accessibilityLabel="Chat message"
          />
        </View>
        <Pressable
          onPress={onSend}
          disabled={!canSend || !text.trim()}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !canSend || !text.trim() }}
        >
          {({ pressed }) => (
            <View
              style={{
                height: 48,
                paddingHorizontal: 18,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: COLORS.accent,
                opacity: !canSend || !text.trim() ? 0.4 : pressed ? 0.8 : 1,
              }}
            >
              <Text style={{ color: COLORS.onAccent, fontSize: 15, fontFamily: FONTS.bodyBold }}>Send</Text>
            </View>
          )}
        </Pressable>
      </View>
    </Sheet>
  );
}
