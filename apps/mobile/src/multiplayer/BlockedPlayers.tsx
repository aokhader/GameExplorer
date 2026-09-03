import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { apiFetch } from '@finesse/client';
import { COLORS, useThemeName } from '@finesse/ui';
import { FONTS } from '@/theme/typography';

interface BlockedUser {
  blockedId: string;
  username: string | null;
  createdAt: string;
}

/**
 * Blocked-players management for the profile — the native counterpart to web's
 * `BlockedPlayers`, over the same `/users/blocks` endpoints.
 *
 * Like web, the whole section is hidden while loading and when there is nothing
 * to manage: most players have never blocked anyone, and a "Loading…" box that
 * then vanishes reads as a glitch. Blocking is reachable from the in-game
 * opponent menu; this is where it is undone.
 */
export function BlockedPlayers() {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();

  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ blocked: BlockedUser[] }>('/users/blocks');
      setBlocked(data.blocked);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your block list.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unblock = async (id: string) => {
    setBusyId(id);
    try {
      await apiFetch(`/users/blocks/${id}`, { method: 'DELETE' });
      setBlocked((prev) => prev.filter((b) => b.blockedId !== id));
    } catch {
      // Leave the row in place on failure — silently dropping it would claim an
      // unblock that did not happen.
    } finally {
      setBusyId(null);
    }
  };

  if (loading || (!error && blocked.length === 0)) return null;

  return (
    <View
      style={{
        marginTop: 24,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.surfaceAlt,
        padding: 16,
      }}
    >
      <Text
        style={{
          color: COLORS.fgMuted,
          fontFamily: FONTS.displaySemi,
          fontSize: 12,
          letterSpacing: 0.8,
          marginBottom: 10,
        }}
      >
        BLOCKED PLAYERS
      </Text>

      {error ? (
        <Text style={{ color: COLORS.dangerHover, fontFamily: FONTS.body, fontSize: 13 }}>
          {error}
        </Text>
      ) : (
        blocked.map((b, i) => (
          <View
            key={b.blockedId}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              minHeight: 48,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: COLORS.border,
            }}
          >
            <Text
              numberOfLines={1}
              style={{ flex: 1, color: COLORS.fg, fontFamily: FONTS.body, fontSize: 14 }}
            >
              {b.username ?? 'Unknown player'}
            </Text>
            <Pressable
              onPress={() => void unblock(b.blockedId)}
              disabled={busyId === b.blockedId}
              accessibilityRole="button"
              accessibilityLabel={`Unblock ${b.username ?? 'this player'}`}
              accessibilityState={{ disabled: busyId === b.blockedId }}
              hitSlop={8}
              style={{ paddingVertical: 10, paddingHorizontal: 4 }}
            >
              <Text
                style={{
                  color: COLORS.accentHover,
                  fontFamily: FONTS.bodySemi,
                  fontSize: 14,
                  opacity: busyId === b.blockedId ? 0.5 : 1,
                }}
              >
                {busyId === b.blockedId ? 'Unblocking…' : 'Unblock'}
              </Text>
            </Pressable>
          </View>
        ))
      )}
    </View>
  );
}
