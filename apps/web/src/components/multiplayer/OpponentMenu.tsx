'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/apiFetch';

const REPORT_REASONS = [
  { value: 'harassment',         label: 'Harassment' },
  { value: 'cheating',           label: 'Cheating' },
  { value: 'spam',               label: 'Spam' },
  { value: 'offensive_language', label: 'Offensive language' },
  { value: 'other',              label: 'Other' },
] as const;

interface OpponentMenuProps {
  opponentId:   string;
  opponentName: string;
  gameId:       string;
}

/**
 * Per-opponent moderation menu (block / report) shown in multiplayer games.
 * Blocking excludes the user from future matchmaking + invites (server-side);
 * reporting files a record for later moderation. Shared by all three play pages.
 */
export function OpponentMenu({ opponentId, opponentName, gameId }: OpponentMenuProps) {
  const [open, setOpen]             = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [reason, setReason]         = useState<string>(REPORT_REASONS[0].value);
  const [context, setContext]       = useState('');
  const [busy, setBusy]             = useState(false);
  const [toast, setToast]           = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const handleBlock = async () => {
    setBusy(true);
    try {
      await apiFetch('/users/blocks', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: opponentId, targetUsername: opponentName }),
      });
      flash(`Blocked ${opponentName}. You won't be matched again.`);
    } catch {
      flash('Could not block — please try again.');
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  const handleReport = async () => {
    setBusy(true);
    try {
      await apiFetch('/users/reports', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: opponentId, reason, context: context.trim() || undefined, gameId }),
      });
      flash('Report submitted. Thank you.');
      setShowReport(false);
      setContext('');
    } catch {
      flash('Could not submit report — please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button onClick={() => setOpen(o => !o)}
        className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm"
        aria-label="Opponent options" title="Opponent options">
        ⋯
      </button>

      {open && (
        <div className="absolute right-0 bottom-full mb-2 w-44 bg-slate-800 rounded-lg shadow-xl ring-1 ring-white/10 py-1 z-50">
          <button onClick={() => { setShowReport(true); setOpen(false); }}
            className="w-full text-left px-4 py-2 text-sm hover:bg-slate-700">🚩 Report player</button>
          <button onClick={handleBlock} disabled={busy}
            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-slate-700 disabled:opacity-50">🚫 Block player</button>
        </div>
      )}

      {showReport && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-bold mb-1">Report {opponentName}</h3>
            <p className="text-sm text-slate-400 mb-4">Help us keep games fair and friendly.</p>

            <label className="block text-sm text-slate-300 mb-1">Reason</label>
            <select value={reason} onChange={e => setReason(e.target.value)}
              className="w-full bg-slate-700 rounded px-3 py-2 mb-4 outline-none text-sm">
              {REPORT_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>

            <label className="block text-sm text-slate-300 mb-1">Details (optional)</label>
            <textarea value={context} onChange={e => setContext(e.target.value)} maxLength={1000} rows={3}
              placeholder="What happened?"
              className="w-full bg-slate-700 rounded px-3 py-2 mb-4 outline-none text-sm resize-none" />

            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowReport(false)} disabled={busy}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm">Cancel</button>
              <button onClick={handleReport} disabled={busy}
                className="px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 rounded-lg text-sm font-semibold">
                {busy ? 'Submitting…' : 'Submit report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 ring-1 ring-white/10 rounded-lg px-4 py-2 text-sm shadow-xl z-[70]">
          {toast}
        </div>
      )}
    </div>
  );
}
