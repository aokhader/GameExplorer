// First-run onboarding state, tracked per browser in localStorage.
//
// ONBOARDED_KEY — set the moment the /welcome tour is seen (or the visitor is
// already signed in). Gates the home-page redirect so it fires exactly once.
//
// SAVE_PROGRESS_PENDING_KEY — set when a signed-out visitor launches their
// first game from the tour. The game-result screen consumes it to show the
// one-time "save your progress" sign-up ask, per the Arcade Glow onboarding
// design: the account ask comes *after* they've played, and only once.

export const ONBOARDED_KEY = 'ge:onboarded';
export const SAVE_PROGRESS_PENDING_KEY = 'ge:save-progress-pending';
