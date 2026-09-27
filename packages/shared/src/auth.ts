// Actions that need a recent sign-in, not just a valid session (security audit
// v2, GX-19). A session token stays valid for as long as the session is kept
// alive, so a stolen or borrowed one would otherwise be enough to delete an
// account for good.

/** The `code` the API answers with when the sign-in behind a token is too old. */
export const REAUTH_REQUIRED = 'REAUTH_REQUIRED';

/** How recent that sign-in must be, in seconds. */
export const REAUTH_WINDOW_SECONDS = 10 * 60;
