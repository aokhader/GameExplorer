// Handles the OAuth redirect from Google/Facebook after successful login.
// Supabase exchanges the code for a session and sets the auth cookie.

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { encryptEmail, hashEmail } from '@gameexplorer/db';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/profile';

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/error`);
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  // Exchange the code for a session
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    console.error('OAuth callback error:', error);
    return NextResponse.redirect(`${origin}/auth/error`);
  }

  const user = data.user;

  // For OAuth users, create a profile if one doesn't exist yet
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single();

  if (!existingProfile && user.email) {
    // Profile creation is best-effort: the session is already established above,
    // so a failure here (e.g. a missing PROFILES_ENCRYPTION_KEY or a transient
    // Supabase error) must not 500 the whole login. Log and continue — the
    // profile can be created on a later request.
    try {
      const emailEncrypted = await encryptEmail(user.email);
      const emailHash = await hashEmail(user.email);

      // Derive a default username from the OAuth display name or email
      const defaultUsername =
        user.user_metadata?.full_name?.replace(/\s+/g, '').toLowerCase() ??
        user.email.split('@')[0];

      await supabase.from('profiles').insert({
        id: user.id,
        username: defaultUsername,
        email_encrypted: emailEncrypted,
        email_hash: emailHash,
      });
    } catch (profileError) {
      console.error('Failed to create profile on OAuth callback:', profileError);
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}