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
 * Eased falloff from the bloom center to its edge, as `[offset, alphaScale]`.
 *
 * A plain two-stop gradient ramps opacity linearly, which the eye reads as a
 * distinct disc: the center holds too much color and the rim terminates on a
 * visible Mach band. These stops approximate a gaussian shoulder — a long, thin
 * tail — so the bloom dissolves into the background with no discernible circle.
 */
const FALLOFF: readonly (readonly [number, number])[] = [
  [0, 1],
  [0.3, 0.66],
  [0.5, 0.38],
  [0.68, 0.18],
  [0.84, 0.06],
  [1, 0],
];

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
              {FALLOFF.map(([offset, alpha]) => (
                <Stop
                  key={offset}
                  offset={offset}
                  stopColor={b.color}
                  stopOpacity={(b.opacity ?? 0.14) * alpha}
                />
              ))}
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
