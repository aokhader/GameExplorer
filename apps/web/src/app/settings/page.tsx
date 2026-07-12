'use client';

import React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui';
import { GradientText } from '@/components/visual';
import { useSettings, type Settings } from '@/components/providers/SettingsProvider';
import { useGameSfx } from '@/hooks/useGameSfx';
import { DeleteAccountCard } from '@/components/settings/DeleteAccountCard';
import { SUPPORT_EMAIL } from '@/lib/support';
import { cn } from '@/lib/utils';

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'w-12 h-7 rounded-full transition-colors shrink-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus ring-offset-2 ring-offset-surface-alt',
        checked ? 'bg-accent' : 'bg-surface-muted',
      )}
    >
      <div
        className={cn(
          'w-5 h-5 bg-white rounded-full shadow mx-1 transition-transform',
          checked && 'translate-x-5',
        )}
      />
    </button>
  );
}

// ── Setting row ───────────────────────────────────────────────────────────────
function SettingRow({
  title,
  description,
  settingKey,
  onAfterChange,
}: {
  title: string;
  description: string;
  settingKey: keyof Settings;
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

export default function SettingsPage() {
  const sfx = useGameSfx();

  return (
    <div className="relative min-h-dvh pt-16">
      <div className="container mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
          <GradientText>Settings</GradientText>
        </h1>
        <p className="text-fg-muted mb-8">
          Preferences are saved on this device.
        </p>

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
              onAfterChange={(next) => next && sfx.play('move')}
            />
            <SettingRow
              title="Haptics"
              description="Vibrate on key moments (supported devices, e.g. mobile)."
              settingKey="haptics"
              onAfterChange={(next) => next && sfx.vibrate(12)}
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
          </div>
        </Card>

        {/* Help & support */}
        <Card elevation="raised" className="mt-6 px-5 py-1">
          <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wide pt-4 pb-1">
            Help &amp; support
          </h2>
          <div className="divide-y divide-border">
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('GameExplorer — Bug report / feedback')}`}
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
          </div>
        </Card>

        {/* Danger zone — only renders for signed-in users */}
        <DeleteAccountCard />
      </div>
    </div>
  );
}
