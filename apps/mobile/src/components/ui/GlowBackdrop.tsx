import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

export interface GlowBloom {
  /** Center as percentages of the container, e.g. cx="25%" cy="0%". */
  cx: string;
  cy: string;
  /** Radii as percentages of the container. */
  rx: string;
  ry: string;
  /** Bloom hue (opaque — opacity is applied by the gradient stops). */
  color: string;
  /** Peak opacity at the bloom center (default 0.14). */
  opacity?: number;
}

/**
 * Ambient radial color blooms behind screen content — the native equivalent of
 * web's `radial-gradient(...)` page washes (Arcade Glow). Absolutely fills its
 * parent and ignores touches; render it as the first child of a screen.
 */
export function GlowBackdrop({ blooms }: { blooms: GlowBloom[] }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%">
        <Defs>
          {blooms.map((b, i) => (
            <RadialGradient key={i} id={`glow-${i}`} cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor={b.color} stopOpacity={b.opacity ?? 0.14} />
              <Stop offset="1" stopColor={b.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {blooms.map((b, i) => (
          <Ellipse key={i} cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry} fill={`url(#glow-${i})`} />
        ))}
      </Svg>
    </View>
  );
}
