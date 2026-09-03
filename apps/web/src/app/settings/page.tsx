'use client';

import React from 'react';
import Link from 'next/link';
import { Card, Toggle } from '@/components/ui';
import { GradientText } from '@/components/visual';
import {
  useSettings,
  type Settings,
  type ThemeChoice,
} from '@/components/providers/SettingsProvider';
import { playSfx } from '@/lib/sound/synth';
import { DeleteAccountCard } from '@/components/settings/DeleteAccountCard';
import { SUPPORT_EMAIL } from '@/lib/support';
import { cn } from '@/lib/utils';

// ── Setting row ───────────────────────────────────────────────────────────────
/** Settings a Toggle can drive — the boolean ones. */
type BooleanSettingKey = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

function SettingRow({
  title,
  description,
  settingKey,
  onAfterChange,
}: {
  title: string;
  description: string;
  settingKey: BooleanSettingKey;
  onAfterChange?: (next: boolean) => void;
}) {
  const { settings, setSetting } = useSettings();
  const checked = settings[settingKey];
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="min-w-0">
        <p className="font-semibold text-fg">{title}</p>
        <p className="text-sm text-fg-muted">{description}</p>
      </div>
      <Toggle
        checked={checked}
        label={title}
        onChange={(next) => {
          setSetting(settingKey, next);
          onAfterChange?.(next);
        }}
      />
    </div>
  );
}

// ── Theme picker ──────────────────────────────────────────────────────────────
/**
 * Swatches are literal hex, not `--c-*` vars, on purpose: each card has to show
 * its own theme's colors while the *other* theme is the active one, so it can't
 * read from the document. Keep these in step with the `[data-theme]` blocks in
 * globals.css if a palette moves.
 */
interface ThemeOption {
  id: ThemeChoice;
  name: string;
  tagline: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  fg: string;
  fgMuted: string;
  accent: string;
  onAccent: string;
  boardLight: string;
  boardDark: string;
  /** Display face used for the card's own title — a preview of the theme's voice. */
  fontFamily: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'dark',
    name: 'Arcade Glow',
    tagline: 'Neon on near-black, gold action.',
    surface: '#0b0e17',
    surfaceAlt: '#141b2d',
    border: '#2b3652',
    fg: '#e7ecf6',
    fgMuted: '#9aa6bd',
    accent: '#cda43f',
    onAccent: '#1a1206',
    boardLight: '#445576',
    boardDark: '#2a3550',
    fontFamily: 'var(--font-space-grotesk), sans-serif',
  },
  {
    id: 'cozy',
    name: 'Cozy Tabletop',
    tagline: 'Warm wood and felt, green action.',
    surface: '#efe6d3',
    surfaceAlt: '#faf4e8',
    border: '#cdbb98',
    fg: '#2c2117',
    fgMuted: '#5e5341',
    accent: '#2f6e4e',
    onAccent: '#f4ecd9',
    boardLight: '#e7c9a0',
    boardDark: '#a9743f',
    fontFamily: 'var(--font-spectral), serif',
  },
];

function ThemeCard({
  option,
  selected,
  onSelect,
}: {
  option: ThemeOption;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'group relative flex-1 rounded-xl p-3 text-left transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ring-offset-2 ring-offset-surface-alt',
        selected
          ? 'ring-2 ring-accent'
          : 'ring-1 ring-border hover:ring-border-strong motion-safe:hover:-translate-y-0.5',
      )}
    >
      {/* Miniature of the theme: page, a card, a board corner and a button. */}
      <div
        aria-hidden
        className="rounded-lg overflow-hidden mb-3"
        style={{ background: option.surface, border: `1px solid ${option.border}` }}
      >
        <div className="flex gap-2 p-3">
          <div
            className="grid grid-cols-4 grid-rows-4 shrink-0 rounded"
            style={{ width: 52, height: 52, outline: `1px solid ${option.border}` }}
          >
            {Array.from({ length: 16 }, (_, i) => (
              <div
                key={i}
                style={{
                  background:
                    ((i >> 2) + i) % 2 === 0 ? option.boardLight : option.boardDark,
                }}
              />
            ))}
          </div>
          <div
            className="flex-1 rounded p-2 flex flex-col justify-between"
            style={{ background: option.surfaceAlt, border: `1px solid ${option.border}` }}
          >
            <div className="space-y-1">
              <div style={{ background: option.fg, height: 4, width: '62%', borderRadius: 2 }} />
              <div
                style={{ background: option.fgMuted, height: 3, width: '86%', borderRadius: 2 }}
              />
            </div>
            <div
              className="rounded-sm"
              style={{ background: option.accent, height: 10, width: 38 }}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-fg" style={{ fontFamily: option.fontFamily }}>
          {option.name}
        </p>
        {selected && (
          <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full bg-accent text-on-accent">
            Active
          </span>
        )}
      </div>
      <p className="text-sm text-fg-muted mt-0.5">{option.tagline}</p>
    </button>
  );
}

function ThemePicker() {
  const { settings, setSetting } = useSettings();
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex flex-col sm:flex-row gap-3 py-4"
    >
      {THEME_OPTIONS.map((option) => (
        <ThemeCard
          key={option.id}
          option={option}
          selected={settings.theme === option.id}
          onSelect={() => setSetting('theme', option.id)}
        />
      ))}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="relative min-h-dvh pt-16">
      <div className="container mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
          <GradientText>Settings</GradientText>
        </h1>
        <p className="text-fg-muted mb-8">
          Preferences are saved on this device.
        </p>

        {/* Appearance */}
        <Card elevation="raised" className="mb-6 px-5 py-1">
          <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wide pt-4 pb-1">
            Appearance
          </h2>
          <p className="text-sm text-fg-muted">
            Applies everywhere on this device — pages, boards and pieces.
          </p>
          <ThemePicker />
        </Card>

        {/* Sound & feedback */}
        <Card elevation="raised" className="mb-6 px-5 py-1">
          <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wide pt-4 pb-1">
            Sound &amp; feedback
          </h2>
          <div className="divide-y divide-border">
            <SettingRow
              title="Sound effects"
              description="Play subtle sounds for moves, captures, and wins."
              settingKey="sound"
              // Give immediate feedback so the toggle is self-demonstrating.
              // Deliberately NOT `useGameSfx`: that hook gates on the *current*
              // render's `sound`, which is still false in the tick where this
              // fires, so the confirmation was silently swallowed — and a toggle
              // that makes no sound reads as "sound is broken". Mobile's settings
              // screen calls its player directly for the same reason.
              onAfterChange={(next) => next && void playSfx('move')}
            />
            <SettingRow
              title="Haptics"
              description="Vibrate on key moments (supported devices, e.g. mobile)."
              settingKey="haptics"
              onAfterChange={(next) => {
                if (!next) return;
                try {
                  navigator.vibrate?.(12);
                } catch {
                  /* unsupported — ignore */
                }
              }}
            />
          </div>
        </Card>

        {/* Motion */}
        <Card elevation="raised" className="mb-6 px-5 py-1">
          <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wide pt-4 pb-1">
            Motion
          </h2>
          <div className="divide-y divide-border">
            <SettingRow
              title="Reduce motion"
              description="Minimize animations and celebratory effects. Your system setting is also respected."
              settingKey="reduceMotion"
            />
          </div>
        </Card>

        {/* Board */}
        <Card elevation="raised" className="px-5 py-1">
          <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wide pt-4 pb-1">
            Board
          </h2>
          <div className="divide-y divide-border">
            <SettingRow
              title="Show coordinates"
              description="Display rank and file labels (a–h, 1–8) along the board edge."
              settingKey="showCoordinates"
            />
            <SettingRow
              title="Flip board in pass & play"
              description="Turn the board around between turns so the player to move is always at the bottom."
              settingKey="flipBoardPassAndPlay"
            />
          </div>
        </Card>

        {/* Help & support */}
        <Card elevation="raised" className="mt-6 px-5 py-1">
          <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wide pt-4 pb-1">
            Help &amp; support
          </h2>
          <div className="divide-y divide-border">
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Finesse — Bug report / feedback')}`}
              className="group flex items-center justify-between gap-4 py-4"
            >
              <div className="min-w-0">
                <p className="font-semibold text-fg">Contact support</p>
                <p className="text-sm text-fg-muted">
                  Found a bug or have a concern during a game? {SUPPORT_EMAIL}
                </p>
              </div>
              <span className="text-fg-subtle group-hover:text-fg transition-colors" aria-hidden>
                ›
              </span>
            </a>
            <Link
              href="/terms"
              className="group flex items-center justify-between gap-4 py-4"
            >
              <div className="min-w-0">
                <p className="font-semibold text-fg">Terms of service</p>
                <p className="text-sm text-fg-muted">
                  Fair play, community rules, and what to expect from the service.
                </p>
              </div>
              <span className="text-fg-subtle group-hover:text-fg transition-colors" aria-hidden>
                ›
              </span>
            </Link>
            <Link
              href="/privacy"
              className="group flex items-center justify-between gap-4 py-4"
            >
              <div className="min-w-0">
                <p className="font-semibold text-fg">Privacy policy</p>
                <p className="text-sm text-fg-muted">How your data is handled, on web and mobile.</p>
              </div>
              <span className="text-fg-subtle group-hover:text-fg transition-colors" aria-hidden>
                ›
              </span>
            </Link>
            <Link
              href="/licenses"
              className="group flex items-center justify-between gap-4 py-4"
            >
              <div className="min-w-0">
                <p className="font-semibold text-fg">Open source &amp; licenses</p>
                <p className="text-sm text-fg-muted">
                  The engines and open-source software Finesse is built on.
                </p>
              </div>
              <span className="text-fg-subtle group-hover:text-fg transition-colors" aria-hidden>
                ›
              </span>
            </Link>
          </div>
        </Card>

        {/* Danger zone — only renders for signed-in users */}
        <DeleteAccountCard />
      </div>
    </div>
  );
}
