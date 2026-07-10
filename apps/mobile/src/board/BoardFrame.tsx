import { useState } from 'react';
import { View, useWindowDimensions, type ViewStyle } from 'react-native';

export interface BoardFrameProps {
  /** Render prop — receives the resolved square edge length in px so boards can
   *  hit-test touches (RN has no CSS `min()`; the number must be concrete). */
  children: (size: number) => React.ReactNode;
  /** Upper bound on the board's edge length, in px. */
  maxPx?: number;
  /** Upper bound on the board's edge length, as a fraction (0–100) of window height. */
  vhCap?: number;
  style?: ViewStyle;
}

/**
 * The native port of web's `BoardFrame` sizing contract.
 *
 * Web uses CSS `width: min(vhCap·svh, maxPx, 100%)`. RN has no `min()`/`svh`, so
 * we compute the same three-way minimum numerically:
 *   - `containerW`      → measured available width (never overflows the column),
 *   - `vhCap/100·winH`  → never taller than the viewport in the stacked layout,
 *   - `maxPx`           → never larger than is comfortable.
 *
 * The board is centered and square. Children get the concrete `size` so the board
 * can map a touch point to a square (`size / 8`).
 */
export function BoardFrame({ children, maxPx = 600, vhCap = 80, style }: BoardFrameProps) {
  const { height } = useWindowDimensions();
  // Start at 0 so nothing paints at a wrong size before the first layout pass;
  // the container fills its parent's width, then we lock the square to it.
  const [containerW, setContainerW] = useState(0);

  const size = Math.min((vhCap / 100) * height, maxPx, containerW || maxPx);

  return (
    <View
      style={[{ width: '100%', alignItems: 'center' }, style]}
      onLayout={(e) => setContainerW(e.nativeEvent.layout.width)}
    >
      {containerW > 0 && <View style={{ width: size, height: size }}>{children(size)}</View>}
    </View>
  );
}
