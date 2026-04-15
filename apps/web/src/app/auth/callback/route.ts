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
  }

  return NextResponse.redirect(`${origin}${next}`);
}