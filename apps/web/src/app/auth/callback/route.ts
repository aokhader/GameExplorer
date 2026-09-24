// Handles the OAuth redirect from Google/Facebook after successful login.
// Supabase exchanges the code for a session and sets the auth cookie.

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { safeReturnPath } from '@/lib/returnPath';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // Checked here as well as on the sign-in page: this URL can be hand-made, and
  // `${origin}${next}` with a `next` of `.evil.example` or `@evil.example` is
  // another host.
  const next = safeReturnPath(searchParams.get('next')) ?? '/profile';

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

  // The profile row is NOT created here. The `on_auth_user_created` database
  // trigger is its single writer, and it has already run by the time a session
  // exists. (This route used to insert one too — a duplicate that, once the
  // profiles_username_format CHECK went live, failed silently for any display
  // name with a dot or an accent.)
  //
  // What this route does decide is whether to ask for a username first. The
  // trigger builds one from the provider's display name or email; it becomes a
  // public handle only once the user has seen and confirmed it. `maybeSingle`,
  // so a missing row reads as "no profile" rather than as an error: the chooser
  // recovers that case, because its claim endpoint creates the row.
  //
  // Any read FAILURE goes straight on to `next` — the prompt is a courtesy and
  // must never stand between someone and a sign-in that worked.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('username_status')
    .eq('id', data.user.id)
    .maybeSingle();

  const needsUsername = !profileError && profile?.username_status !== 'chosen';

  // `next` has been through safeReturnPath above, and the chooser path is a
  // literal — so the one value that came from the URL stays same-site. The
  // chooser reads `next` with the same guard again.
  const destination = needsUsername
    ? `/auth/choose-username?next=${encodeURIComponent(next)}`
    : next;

  return NextResponse.redirect(`${origin}${destination}`);
}