// First-run onboarding state, tracked per browser in localStorage.
//
// The keys and their semantics live in `@gameexplorer/shared` alongside the
// tour's difficulty ladder, so web and native cannot document them differently
// — see ONBOARDING_KEYS there for what each flag means and why the two
// platforms deliberately use different prefixes.
//
// The reads stay synchronous and inline at the call sites: the home page checks
// `ONBOARDED_KEY` in its mount effect and redirects, and routing that through a
// promise would show a brand-new visitor a frame of the home page before the
// tour replaced it.
import { ONBOARDING_KEYS } from '@gameexplorer/shared';

export const ONBOARDED_KEY = ONBOARDING_KEYS.web.onboarded;
export const SAVE_PROGRESS_PENDING_KEY = ONBOARDING_KEYS.web.saveProgressPending;
