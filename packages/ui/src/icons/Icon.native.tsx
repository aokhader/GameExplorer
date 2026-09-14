/**
 * Icon — React Native version. Same path data and the same role as `Icon.tsx`,
 * drawn with react-native-svg. Metro resolves `*.native.tsx` first, so native
 * code importing `Icon` from '@gameexplorer/ui' gets this file.
 *
 * Two differences from web, both forced by the platform:
 *
 * - **`color` is required.** Text colour does not cascade into a React Native
 *   view, so there is no `currentColor` to inherit, and a default would render
 *   an invisible icon on one of the two themes. Pass a live token read during
 *   render, e.g. `COLORS.fgMuted`.
 * - **`size` is a number.** Native has no ems; the caller chooses a size from the
 *   type step the icon sits beside.
 *
 * Decorative by default, like web: without a `label` the icon is hidden from
 * screen readers so a labelled control is not announced twice.
 */

import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ICON_PATHS, ICON_VIEWBOX, type IconName } from './paths';

export interface IconProps {
  name: IconName;
  /** Rendered size in logical pixels (square). Defaults to 20. */
  size?: number;
  color: string;
  /** Accessible name. Omit for a decorative icon beside visible text. */
  label?: string;
  style?: StyleProp<ViewStyle>;
}

export function Icon({ name, size = 20, color, label, style }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox={ICON_VIEWBOX}
      style={style}
      accessible={!!label}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
    >
      <Path d={ICON_PATHS[name]} fill={color} />
    </Svg>
  );
}

export default Icon;
