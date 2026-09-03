import type { ReactNode } from 'react';
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, useThemeName } from '@finesse/ui';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Screen-reader label on the dismissing scrim. */
  closeLabel?: string;
  /** Hide the grabber — a sheet that cannot be dragged should not imply it can. */
  grabber?: boolean;
  /** Sheet surface. Defaults to the app's raised surface. */
  backgroundColor?: string;
  /** Top corner radius. */
  radius?: number;
  /** Cap the height as a fraction of the window, for long lists. */
  maxHeightRatio?: number;
  children: ReactNode;
}

/**
 * The app's bottom sheet.
 *
 * Lifted verbatim out of `GameBar`'s in-game menu, which was the only one of
 * its kind. The node structure below is deliberately unchanged — `GameBar`'s
 * tests read the menu through jest-expo's Modal mock, which renders children
 * twice and makes them query `.at(-1)`, so adding a wrapper or reordering the
 * two Pressables would shift those indices and break tests that are otherwise
 * untouched by the extraction.
 *
 * The defaults are the menu's own values, so its call site needed no changes
 * beyond the label.
 */
export function Sheet({
  open,
  onClose,
  closeLabel = 'Close',
  grabber = true,
  backgroundColor,
  radius = 20,
  maxHeightRatio = 0.86,
  children,
}: SheetProps) {
  // Repaint when the theme changes; the tokens below are live views.
  useThemeName();
  const { height } = useWindowDimensions();

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}
      >
        {/* Swallows taps so pressing the sheet itself doesn't dismiss it. */}
        <Pressable onPress={() => {}} accessible={false}>
          <SafeAreaView
            edges={['bottom']}
            style={{ backgroundColor: backgroundColor ?? COLORS.surfaceAlt }}
          >
            <View
              style={{
                borderTopLeftRadius: radius,
                borderTopRightRadius: radius,
                borderTopWidth: 1,
                borderColor: COLORS.border,
                paddingHorizontal: 16,
                paddingTop: 10,
                paddingBottom: 12,
                gap: 4,
                maxHeight: height * maxHeightRatio,
              }}
            >
              {grabber && (
                <View
                  style={{
                    alignSelf: 'center',
                    width: 40,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: COLORS.borderStrong,
                    marginBottom: 10,
                  }}
                />
              )}
              {children}
            </View>
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
