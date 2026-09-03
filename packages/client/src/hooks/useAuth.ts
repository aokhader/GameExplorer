import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';

export function useAuth() {
  // Field-level selectors — useAuth is mounted by nearly every screen, so a
  // whole-store subscription would fan any auth-store write out to all of them.
  const user       = useAuthStore(s => s.user);
  const loading    = useAuthStore(s => s.loading);
  const setUser    = useAuthStore(s => s.setUser);
  const setLoading = useAuthStore(s => s.setLoading);

  useEffect(() => {
    // Supabase is loaded dynamically so @supabase/* stays out of the initial
    // bundle of every screen that renders auth state (web nav, mobile shell).
    // Consumers already gate on `loading`, which stays true until this resolves.
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    // Any failure here (e.g. the Supabase client throwing because build-time
    // env is missing) must still clear `loading`, or every loading-gated
    // screen hangs forever with no way to reach sign-in. Degrade to guest.
    const bail = (err: unknown) => {
      console.warn('[useAuth] auth bootstrap failed; continuing as guest:', err);
      if (cancelled) return;
      setUser(null);
      setLoading(false);
    };

    import('@finesse/db').then(({ supabase }) => {
      if (cancelled) return;

      // getSession() resolves from local storage — no network. getUser() here
      // added a Supabase Auth round-trip to every screen's `loading` state
      // (and gated the home→/welcome redirect for brand-new visitors). This
      // only drives UI state; anything sensitive is still RLS-checked
      // server-side on every query.
      supabase.auth.getSession().then(({ data }: { data: { session: { user: { id: string; email?: string } } | null } }) => {
        if (cancelled) return;
        const u = data.session?.user;
        setUser(u ? { id: u.id, email: u.email! } : null);
        setLoading(false);
      }).catch(bail);

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: unknown, session: { user: { id: string; email?: string } | null } | null) => {
        setUser(session?.user ? { id: session.user.id, email: session.user.email! } : null);
        setLoading(false);
      });
      unsubscribe = () => subscription.unsubscribe();
    }).catch(bail);

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { user, loading };
}
