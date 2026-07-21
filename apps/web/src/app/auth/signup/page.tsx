'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@gameexplorer/db';
import { GradientText } from '@/components/visual';


export default function SignUpPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  const handleSignUp = async () => {
    setLoading(true);
    setError(null);

    // The username rides along in user metadata: the `on_auth_user_created`
    // trigger reads it to build the profile row (see
    // project-docs/sql-queries/supabase-profile-trigger.sql). We can't insert
    // the profile from here — with email confirmation on, signUp returns no
    // session, so RLS would see an anonymous caller and reject the row.
    const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { username: username.trim() } },
    });
    if (error || !data.user) {
        setError(error?.message ?? 'Sign up failed');
        setLoading(false);
        return;
    }

    // No session means Supabase is waiting on email confirmation.
    if (!data.session) {
        setConfirmSent(true);
        setLoading(false);
        return;
    }

    router.replace('/profile');
  };

  const handleOAuth = async (provider: 'google' | 'facebook' | 'apple') => {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError(error.message);
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 pt-16 page-glow-gold">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-center mb-8 tracking-tight">
          <GradientText>Create account</GradientText>
        </h1>

        <div className="glass rounded-2xl p-6 space-y-4">
          {/* OAuth buttons */}
          <button
            onClick={() => handleOAuth('apple')}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-black hover:bg-black/80 rounded-lg transition-colors text-sm font-medium text-white"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
            </svg>
            Continue with Apple
          </button>

          <button
            onClick={() => handleOAuth('google')}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-white/15 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium text-fg"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <button
            onClick={() => handleOAuth('facebook')}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-[#1877F2] hover:bg-[#166FE5] rounded-lg transition-colors text-sm font-medium text-white"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Continue with Facebook
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-fg-subtle">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Fields */}
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-white/15 bg-black/30 text-fg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-white/15 bg-black/30 text-fg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSignUp()}
              className="w-full px-3 py-2.5 rounded-lg border border-white/15 bg-black/30 text-fg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {confirmSent && (
            <p className="text-sm text-fg-muted">
              Check <span className="text-fg">{email.trim()}</span> for a confirmation
              link, then sign in.
            </p>
          )}

          {error && (
            <p className="text-sm text-danger-hover">{error}</p>
          )}

          <button
            onClick={handleSignUp}
            disabled={loading || !email || !password || !username}
            className="w-full py-2.5 rounded-lg bg-accent [background-image:var(--gradient-accent)] text-on-accent font-semibold [box-shadow:var(--shadow-glow-accent)] hover:brightness-110 disabled:opacity-50 transition-all text-sm"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>

          <p className="text-center text-sm text-fg-muted">
            Already have an account?{' '}
            <Link href="/auth/signin" className="text-accent hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}