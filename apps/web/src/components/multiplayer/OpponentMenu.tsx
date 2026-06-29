'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/apiFetch';
import { Button, IconButton, Modal, Select, useToast } from '@/components/ui';

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
  const menuRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const handleBlock = async () => {
    setBusy(true);
    try {
      await apiFetch('/users/blocks', {
        method: 'POST',
        body: JSON.stringify({ targetUserId: opponentId, targetUsername: opponentName }),
      });
      toast(`Blocked ${opponentName}. You won't be matched again.`, 'success');
    } catch {
      toast('Could not block — please try again.', 'danger');
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
      toast('Report submitted. Thank you.', 'success');
      setShowReport(false);
      setContext('');
    } catch {
      toast('Could not submit report — please try again.', 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <IconButton
        variant="secondary"
        size="md"
        onClick={() => setOpen((o) => !o)}
        aria-label="Opponent options"
        title="Opponent options"
      >
        <span className="text-lg leading-none">⋯</span>
      </IconButton>

      {open && (
        <div className="absolute right-0 bottom-full mb-2 w-48 bg-surface-alt border border-border rounded-lg shadow-xl py-1 z-50">
          <button
            onClick={() => { setShowReport(true); setOpen(false); }}
            className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors"
          >
            🚩 Report player
          </button>
          <button
            onClick={handleBlock}
            disabled={busy}
            className="w-full text-left px-4 py-2.5 text-sm text-danger-hover hover:bg-surface-hover disabled:opacity-50 transition-colors"
          >
            🚫 Block player
          </button>
        </div>
      )}

      <Modal
        open={showReport}
        onClose={() => setShowReport(false)}
        title={`Report ${opponentName}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowReport(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleReport} loading={busy}>
              Submit report
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted mb-4">Help us keep games fair and friendly.</p>
        <Select
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mb-4"
        >
          {REPORT_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
        <label className="block text-sm font-medium text-fg-muted mb-1.5">Details (optional)</label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="What happened?"
          className="w-full px-3 py-2 rounded-lg bg-surface-muted text-fg placeholder:text-fg-subtle text-sm border border-border focus:outline-none focus:ring-2 focus:ring-focus focus:border-transparent resize-none"
        />
      </Modal>
    </div>
  );
}
