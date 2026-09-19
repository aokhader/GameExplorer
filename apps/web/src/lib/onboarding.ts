// First-run onboarding state, tracked per browser in localStorage.
//
// The keys and their semantics live in `@gameexplorer/shared` alongside the
// tour's difficulty ladder, so web and native cannot document them differently
// — see ONBOARDING_KEYS there for what each flag means and why the two
// platforms deliberately use different prefixes.
//
// Nothing redirects on this flag any more: a stranger's `/` is the landing
// page, which asks its one first-run question itself (ux-fix-ideas.md §4.4).
// The tour still sets it.
import { ONBOARDING_KEYS } from '@gameexplorer/shared';

export const ONBOARDED_KEY = ONBOARDING_KEYS.web.onboarded;
export const SAVE_PROGRESS_PENDING_KEY = ONBOARDING_KEYS.web.saveProgressPending;
