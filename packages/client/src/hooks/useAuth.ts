import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';

export function useAuth() {
  const { user, loading, setUser, setLoading } = useAuthStore();

  useEffect(() => {
    // Supabase is loaded dynamically so @supabase/* stays out of the initial
    // bundle of every screen that renders auth state (web nav, mobile shell).
    // Consumers already gate on `loading`, which stays true until this resolves.
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    import('@gameexplorer/db').then(({ supabase }) => {
      if (cancelled) return;

      supabase.auth.getUser().then(({ data }: { data: { user: { id: string; email?: string } | null } }) => {
        if (cancelled) return;
        setUser(data.user ? { id: data.user.id, email: data.user.email! } : null);
        setLoading(false);
      });

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: unknown, session: { user: { id: string; email?: string } | null } | null) => {
        setUser(session?.user ? { id: session.user.id, email: session.user.email! } : null);
        setLoading(false);
      });
      unsubscribe = () => subscription.unsubscribe();
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { user, loading };
}
