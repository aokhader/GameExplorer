'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/apiFetch';

interface BlockedUser {
  blockedId: string;
  username:  string | null;
  createdAt: string;
}

/**
 * Blocked-players management list for the profile page. Lists who the user has
 * blocked and lets them unblock. Backed by the API's /users/blocks endpoints.
 */
export function BlockedPlayers() {
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [busyId, setBusyId]   = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ blocked: BlockedUser[] }>('/users/blocks');
      setBlocked(data.blocked);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const unblock = async (id: string) => {
    setBusyId(id);
    try {
      await apiFetch(`/users/blocks/${id}`, { method: 'DELETE' });
      setBlocked(prev => prev.filter(b => b.blockedId !== id));
    } catch {
      /* leave the row in place on failure */
    } finally {
      setBusyId(null);
    }
  };

  // Hide the section entirely when there's nothing to manage (and no error).
  if (!loading && !error && blocked.length === 0) return null;

  return (
    <div className="mt-6 bg-white dark:bg-slate-800 rounded-xl shadow p-5">
      <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
        Blocked players
      </h2>

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-700">
          {blocked.map(b => (
            <li key={b.blockedId} className="flex items-center justify-between py-2">
              <span className="text-sm text-slate-700 dark:text-slate-200">
                {b.username ?? 'Unknown player'}
              </span>
              <button onClick={() => unblock(b.blockedId)} disabled={busyId === b.blockedId}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50">
                {busyId === b.blockedId ? 'Unblocking…' : 'Unblock'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
