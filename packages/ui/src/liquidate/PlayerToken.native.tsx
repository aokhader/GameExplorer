/**
 * PlayerToken — React Native version.
 *
 * Same public API and geometry as PlayerToken.tsx, drawn with react-native-svg.
 * Metro resolves *.native.tsx before *.tsx, so React Native apps pick this up
 * automatically when they import { PlayerToken } from '@finesse/ui'.
 */

import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

export interface PlayerTokenProps {
  /** Fill — the seat's colour, resolved by the caller. */
  color: string;
  /** Edge colour — the tile the token stands on, so it reads on either theme. */
  outline: string;
  /** Token width in px; height follows the 24:30 aspect. */
  width?: number;
  /** Rings the token this device is following. */
  you?: boolean;
  title?: string;
  style?: StyleProp<ViewStyle>;
}

export const PlayerToken = React.memo(function PlayerToken({
  color,
  outline,
  width = 13,
  you = false,
  title,
  style,
}: PlayerTokenProps) {
  const height = Math.round((width / 24) * 30);

  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 24 30"
      style={style}
      accessibilityLabel={title}
      // Decorative unless it is carrying a name; the board's own label speaks
      // for it otherwise.
      accessibilityElementsHidden={title ? undefined : true}
      importantForAccessibility={title ? 'yes' : 'no-hide-descendants'}
    >
      {you && <Circle cx={12} cy={15} r={15} fill={color} opacity={0.3} />}
      <Circle cx={12} cy={6} r={5} fill={color} stroke={outline} strokeWidth={2} />
      <Path
        d="M12 12c-5 0-8 3.4-8 8.5V27a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6.5C20 15.4 17 12 12 12Z"
        fill={color}
        stroke={outline}
        strokeWidth={2}
      />
    </Svg>
  );
});

export default PlayerToken;
