/**
 * Icon — web component over the vendored Phosphor path data in `paths.ts`.
 * `Icon.native.tsx` mirrors this for React Native; keep the two in step.
 *
 * The interface's icons used to be emoji: a different drawing on every platform,
 * no way to take a theme colour, and actively wrong on Cozy Tabletop's
 * parchment. These are vector paths painted in the text colour, so an icon
 * belongs to the palette of whatever it sits in.
 *
 * Game identity is not an icon — a game is drawn with its own piece art through
 * `GameIcon` / `GamePieceIcon`. This component is for the interface around it.
 *
 * Decorative by default: without a `label` the SVG is hidden from assistive
 * technology, because an icon beside a text label would otherwise be read twice.
 * Pass `label` when the icon is the only thing naming a control.
 */

import React from 'react';
import { ICON_PATHS, ICON_VIEWBOX, type IconName } from './paths';

export interface IconProps {
  name: IconName;
  /**
   * Rendered size. A pixel number, or a CSS length. Defaults to `1em`, so an icon
   * scales with the type it sits beside without a size of its own.
   */
  size?: number | string;
  /** Defaults to `currentColor`, so the icon takes its surrounding text colour. */
  color?: string;
  /** Accessible name. Omit for a decorative icon beside visible text. */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function Icon({ name, size = '1em', color = 'currentColor', label, className, style }: IconProps) {
  return (
    <svg
      viewBox={ICON_VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      fill={color}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      className={className}
      // Nudged below the baseline so a 1em icon sits optically centred in a line
      // of text, the way an inline glyph would.
      style={{ display: 'inline-block', flexShrink: 0, verticalAlign: '-0.125em', ...style }}
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

export default Icon;
