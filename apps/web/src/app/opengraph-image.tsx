import { ImageResponse } from 'next/og';
import { GAME_LIST, gameCountWord } from '@gameexplorer/shared';

/**
 * The card people see when a GameExplorer link is pasted into a chat.
 *
 * The site had no OG image at all (legal backlog B-04), so every shared link
 * rendered as bare text — which matters more than usual for a project whose
 * whole distribution problem is getting a stranger to click.
 *
 * Generated rather than checked in as a PNG so it stays keyed to the same brand
 * colours as `icon.svg` and the mobile mark, and so the copy can be corrected in
 * a commit. Statically optimized by Next at build time — no per-request cost.
 */

export const alt = 'GameExplorer — five board games with sharp bots, online play and ratings';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// packages/ui Arcade Glow tokens. An OG route cannot import from the token
// module (it runs in the edge-ish og runtime), so these are mirrored by hand —
// the same trade `icon.svg` makes.
const INK_900 = '#0b0e17';
const GOLD = '#cda43f';
const GOLD_LIGHT = '#dcb456';
const GOLD_INK = '#1a1206';
const SLATE_100 = '#e7ecf6';
const SLATE_400 = '#94a3b8';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: INK_900,
          // The gold bloom the app's own pages sit on (RouteAmbient).
          backgroundImage: `radial-gradient(circle at 50% 42%, rgba(205,164,63,0.22), rgba(11,14,23,0) 62%)`,
        }}
      >
        {/* The mark — same disc + play triangle as icon.svg. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 150,
            height: 150,
            borderRadius: 75,
            backgroundImage: `linear-gradient(180deg, ${GOLD_LIGHT}, ${GOLD})`,
          }}
        >
          {/* Same 64-unit viewBox as icon.svg and rendered at the disc's own
              size, so the triangle lands at the identical 43%-of-disc
              proportion. Sizing this independently makes the mark look like a
              different logo at a glance. */}
          <svg width="150" height="150" viewBox="0 0 64 64">
            <path
              d="M27 22 L45 32 L27 42 Z"
              fill={GOLD_INK}
              stroke={GOLD_INK}
              strokeWidth="4"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 44,
            fontSize: 76,
            fontWeight: 700,
            color: SLATE_100,
            letterSpacing: -1.5,
          }}
        >
          GameExplorer
        </div>

        <div style={{ display: 'flex', marginTop: 18, fontSize: 32, color: SLATE_400 }}>
          {gameCountWord()} games. One board. Endless rematches.
        </div>

        <div style={{ display: 'flex', marginTop: 34, fontSize: 26, color: GOLD }}>
          {GAME_LIST.map((g) => g.name).join(' · ')}
        </div>
      </div>
    ),
    size,
  );
}
