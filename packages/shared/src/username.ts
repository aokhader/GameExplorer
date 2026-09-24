// Username rules — the one copy the sign-up forms, the choose-username screens
// and the API all read, so every surface refuses the same names in the same
// words.
//
// The DATABASE owns the truth; this file mirrors it so a form can explain a
// refusal before the round trip:
//   - format   → profiles_username_format CHECK
//                (project-docs/sql-queries/supabase-security-wave1b.sql, PART 3)
//   - reserved → public.username_is_reserved() behind the
//                profiles_username_reserved CHECK
//                (project-docs/sql-queries/supabase-username-claim-part1.sql)
// There is no database in CI, so username.test.ts pins both mirrors to the
// literal SQL. Change one side and that test tells you to change the other.
//
// Profanity is deliberately NOT here: `obscenity` runs in apps/api only, so its
// word list never ships inside the web or mobile bundle.

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

/**
 * The profiles_username_format CHECK, character for character. A POSIX `~` in
 * Postgres and a JavaScript RegExp agree on this pattern: neither lets `$`
 * match before a trailing newline, so `'abc\n'` is invalid on both sides.
 */
export const USERNAME_PATTERN_SQL = '^[A-Za-z0-9_]{3,20}$';

/** Built from the SQL string rather than retyped, so the two cannot drift. */
export const USERNAME_PATTERN = new RegExp(USERNAME_PATTERN_SQL);

/** What the username field says while nothing is wrong. */
export const USERNAME_HINT = '3–20 letters, numbers or _';

/**
 * Names no one may hold. Exact matches only, compared case-insensitively.
 *
 * Usernames appear in no URL, so this list is about impersonation — of staff,
 * of the system, of the bot — not about route collisions. That is why it is a
 * short curated list and not a full web-app blocklist: it ships to the mobile
 * bundle, and generic route names ("css", "sitemap") protect nothing here.
 *
 * Entries marked "blocklist" are selected from The Big Username Blocklist,
 * Copyright (c) 2015-2021 Martin Sandström, MIT License
 * (https://github.com/marteinn/The-Big-Username-Blocklist; the full notice is
 * in LICENSES/big-username-blocklist-MIT.txt). The rest are this product's own.
 *
 * Never reserve a PREFIX of the database trigger's fallback name: it generates
 * `player` + 6 hex characters, so `player` itself is reserved but nothing that
 * would match `player3fa2b1` may be.
 *
 * Adding a word later grandfathers anyone who already holds it — the CHECK is
 * not re-validated when the function behind it changes — which is intended.
 */
export const RESERVED_USERNAMES: readonly string[] = [
  // blocklist — authority and system identities
  'abuse',
  'account',
  'accounts',
  'admin',
  'administration',
  'administrator',
  'billing',
  'contact',
  'feedback',
  'guest',
  'help',
  'hostmaster',
  'info',
  'legal',
  'mailerdaemon',
  'member',
  'members',
  'moderator',
  'noreply',
  'owner',
  'postmaster',
  'privacy',
  'root',
  'rootuser',
  'security',
  'sudo',
  'superuser',
  'support',
  'sysadmin',
  'system',
  'team',
  'user',
  'username',
  'users',
  'webmaster',
  'yourname',
  'yourusername',
  // blocklist — values that read as "no one" or as a rendering bug
  'error',
  'false',
  'nil',
  'nobody',
  'none',
  'null',
  'true',
  'undefined',
  'void',
  'you',
  // this product — staff, the brand, and the names games already use for
  // non-humans (games.opponent stores 'bot' and 'stockfish' for bot games)
  'anon',
  'anonymous',
  'arasan',
  'bot',
  'bots',
  'computer',
  'deleted',
  'deleted_user',
  'deleteduser',
  'engine',
  'everyone',
  'game_explorer',
  'gameexplorer',
  'gameexplorer_team',
  'gameexplorerteam',
  'mod',
  'mods',
  'official',
  'opponent',
  'player',
  'players',
  'staff',
  'stockfish',
];

const RESERVED = new Set(RESERVED_USERNAMES);

/** Case-insensitive exact match against RESERVED_USERNAMES. */
export function isReservedUsername(name: string): boolean {
  return RESERVED.has(name.toLowerCase());
}

/**
 * Why a name can or cannot be used.
 *
 * The first four come from local validation, which can say precisely what is
 * wrong. `invalid-format` is the API's word for any of them — the server does
 * not repeat the diagnosis the form already made. `taken` only ever comes from
 * the server.
 */
export type UsernameReason =
  | 'ok'
  | 'too-short'
  | 'too-long'
  | 'invalid-chars'
  | 'invalid-format'
  | 'reserved'
  | 'taken';

/**
 * Check a name against the database's rules, without the database.
 *
 * Does NOT trim: the forms trim what the user typed, and this stays a pure
 * mirror of the CHECK, which does not trim either. Characters are judged before
 * length so "a!" says what is actually wrong, and the reserved list is consulted
 * only for a name that is otherwise legal.
 */
export function validateUsername(name: string): UsernameReason {
  if (/[^A-Za-z0-9_]/.test(name)) return 'invalid-chars';
  if (name.length < USERNAME_MIN_LENGTH) return 'too-short';
  if (name.length > USERNAME_MAX_LENGTH) return 'too-long';
  // Unreachable while the checks above cover the pattern; kept so this can
  // never pass a name the CHECK would refuse if the pattern alone changes.
  if (!USERNAME_PATTERN.test(name)) return 'invalid-format';
  if (isReservedUsername(name)) return 'reserved';
  return 'ok';
}

/** The words both platforms show for a reason. `ok` has none. */
export function usernameReasonMessage(reason: UsernameReason): string {
  switch (reason) {
    case 'ok':
      return '';
    case 'too-short':
      return `Use at least ${USERNAME_MIN_LENGTH} characters.`;
    case 'too-long':
      return `Use at most ${USERNAME_MAX_LENGTH} characters.`;
    case 'invalid-chars':
      return 'Use only letters, numbers and _.';
    case 'invalid-format':
      return `Use ${USERNAME_HINT}.`;
    case 'reserved':
      return 'That username is reserved. Try another.';
    case 'taken':
      return 'That username is taken. Try another.';
  }
}

/**
 * Shown when sign-up fails and a fresh check says the name is now taken: two
 * people submitted the same free name at once and the database let one win.
 */
export const USERNAME_LOST_RACE_MESSAGE =
  'Someone took that username a moment ago. Choose another.';
