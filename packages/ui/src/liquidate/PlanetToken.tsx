/**
 * PlanetToken — web component.
 *
 * Liquidate's identity mark. See LIQUIDATE_PLANET_STYLE in ./tokens for why the
 * ring is load-bearing rather than decorative.
 *
 * Colours resolve through `var(--gx-liquidate-planet-…, <token>)` so a web theme
 * can recolour them from CSS, with the shared token as the fallback — the same
 * contract ChessPiece, ReversiDisc and GoStone use. PlanetToken.native.tsx
 * mirrors this markup with react-native-svg.
 *
 * `size` accepts a string so callers can pass `size="1em"` and let the SVG scale
 * off whatever `text-*` class already wraps it. That is what lets this drop into
 * surfaces that previously held a Unicode glyph without per-site sizing.
 */
import React from 'react';
import { LIQUIDATE_PLANET_STYLE } from './tokens';

export interface PlanetTokenProps {
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * The ring, as one ellipse on a 100-unit box: centred, rx 46 / ry 15, tilted
 * -22°. It is drawn TWICE and the sphere is painted between the two passes —
 * the full ellipse first (the sphere then hides its middle, leaving the two
 * tips reading as "behind"), then just the front half on top. Splitting it into
 * two computed arcs would be the obvious approach and is not needed: occlusion
 * by the sphere does the same job for free.
 *
 * The front half runs from the ring's right tip, under the sphere, to its left
 * tip — the endpoints are the ellipse at t=0 and t=180 after the tilt.
 */
const RING = { cx: 50, cy: 50, rx: 46, ry: 15, tilt: -22 };
const RING_FRONT = 'M 92.65 32.77 A 46 15 -22 0 1 7.35 67.23';

/** Sphere sits left of and below centre, which is what opens room for the ring's high side. */
const SPHERE = { cx: 48, cy: 54, r: 30 };

export function PlanetToken({ size = 40, className, style }: PlanetTokenProps) {
  const s = LIQUIDATE_PLANET_STYLE;
  const v = (slot: string, fallback: string) => `var(--gx-liquidate-planet-${slot}, ${fallback})`;
  const bodyId = React.useId();

  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="planet"
      className={className}
      style={{ display: 'block', width: size, height: size, ...style }}
    >
      <defs>
        <radialGradient id={bodyId} cx="34%" cy="28%" r="80%">
          {s.body.map((stop, i) => (
            <stop
              key={stop.offset}
              offset={`${stop.offset * 100}%`}
              stopColor={v(`${i + 1}`, stop.color)}
            />
          ))}
        </radialGradient>
      </defs>

      {/* Pass 1: the whole ring. The sphere lands on top of its middle. */}
      <ellipse
        cx={RING.cx}
        cy={RING.cy}
        rx={RING.rx}
        ry={RING.ry}
        fill="none"
        stroke={v('ring-back', s.ringBack)}
        strokeWidth={4}
        transform={`rotate(${RING.tilt} ${RING.cx} ${RING.cy})`}
      />

      <circle cx={SPHERE.cx} cy={SPHERE.cy} r={SPHERE.r} fill={`url(#${bodyId})`} />
      <circle
        cx={SPHERE.cx}
        cy={SPHERE.cy}
        r={SPHERE.r - 0.6}
        fill="none"
        stroke={v('border', s.border)}
        strokeWidth={1.2}
      />

      <ellipse
        cx={38}
        cy={44}
        rx={9}
        ry={6}
        fill={v('sheen', s.sheen)}
        opacity={0.5}
        transform="rotate(-24 38 44)"
      />

      {/* Pass 2: the front half, over the sphere. Stroke stays at 5 so the ring
          survives the 22px profile row — below ~4.5 it disappears there. */}
      <path
        d={RING_FRONT}
        fill="none"
        stroke={v('ring', s.ring)}
        strokeWidth={5}
        strokeLinecap="round"
      />
    </svg>
  );
}

export default PlanetToken;
