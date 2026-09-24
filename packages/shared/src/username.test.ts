import { describe, expect, it } from 'vitest';
import {
  RESERVED_USERNAMES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
  USERNAME_PATTERN_SQL,
  isReservedUsername,
  usernameReasonMessage,
  validateUsername,
  type UsernameReason,
} from './username';

describe('validateUsername', () => {
  const cases: Array<[string, UsernameReason]> = [
    ['bob', 'ok'],
    ['Bob_42', 'ok'],
    ['___', 'ok'],
    ['a'.repeat(20), 'ok'],
    ['', 'too-short'],
    ['ab', 'too-short'],
    ['a'.repeat(21), 'too-long'],
    ['b*b', 'invalid-chars'],
    ['b%b', 'invalid-chars'],
    ['bob smith', 'invalid-chars'],
    ['first.last', 'invalid-chars'],
    ['user+tag', 'invalid-chars'],
    ['josé', 'invalid-chars'],
    ['日本語', 'invalid-chars'],
    // A trailing newline must not slip past a `$` anchor on either side.
    ['abc\n', 'invalid-chars'],
    [' bob', 'invalid-chars'],
    // Characters are judged before length, so this says what is really wrong.
    ['a!', 'invalid-chars'],
    ['admin', 'reserved'],
  ];

  it.each(cases)('%j → %s', (name, reason) => {
    expect(validateUsername(name)).toBe(reason);
  });

  it('does not trim — that is the form’s job, and the CHECK does not trim either', () => {
    expect(validateUsername('bob ')).toBe('invalid-chars');
  });

  it('checks the reserved list case-insensitively', () => {
    expect(validateUsername('ADMIN')).toBe('reserved');
    expect(validateUsername('StockFish')).toBe('reserved');
  });

  it('checks the reserved list only after the format', () => {
    // "admin!" is not a reserved name; it is not a name at all.
    expect(validateUsername('admin!')).toBe('invalid-chars');
  });

  it('reserves exact names, never prefixes — the trigger’s fallback is player + 6 hex', () => {
    expect(validateUsername('player')).toBe('reserved');
    expect(validateUsername('player3fa2b1')).toBe('ok');
    expect(validateUsername('admin1')).toBe('ok');
  });
});

describe('the mirrors of the database', () => {
  it('pins USERNAME_PATTERN_SQL to profiles_username_format', () => {
    // Must equal the CHECK in project-docs/sql-queries/supabase-security-wave1b.sql
    // (PART 3), character for character. If this fails, change both or neither.
    expect(USERNAME_PATTERN_SQL).toBe('^[A-Za-z0-9_]{3,20}$');
    expect(USERNAME_PATTERN.source).toBe(USERNAME_PATTERN_SQL);
  });

  it('keeps the length constants in step with the pattern', () => {
    expect(USERNAME_PATTERN_SQL).toContain(`{${USERNAME_MIN_LENGTH},${USERNAME_MAX_LENGTH}}`);
  });

  it('pins RESERVED_USERNAMES to public.username_is_reserved()', () => {
    // Must equal the array in public.username_is_reserved(), in
    // project-docs/sql-queries/supabase-username-claim-part1.sql. The database
    // enforces the SQL copy; this one only lets the forms explain a refusal.
    expect([...RESERVED_USERNAMES].sort()).toEqual([
      'abuse', 'account', 'accounts', 'admin', 'administration', 'administrator',
      'anon', 'anonymous', 'arasan', 'billing', 'bot', 'bots', 'computer', 'contact',
      'deleted', 'deleted_user', 'deleteduser', 'engine', 'error', 'everyone', 'false',
      'feedback', 'game_explorer', 'gameexplorer', 'gameexplorer_team', 'gameexplorerteam',
      'guest', 'help', 'hostmaster', 'info', 'legal', 'mailerdaemon', 'member', 'members',
      'mod', 'moderator', 'mods', 'nil', 'nobody', 'none', 'noreply', 'null', 'official',
      'opponent', 'owner', 'player', 'players', 'postmaster', 'privacy', 'root', 'rootuser',
      'security', 'staff', 'stockfish', 'sudo', 'superuser', 'support', 'sysadmin', 'system',
      'team', 'true', 'undefined', 'user', 'username', 'users', 'void', 'webmaster', 'you',
      'yourname', 'yourusername',
    ]);
  });

  it('only reserves names the format would otherwise allow, all lower case, no duplicates', () => {
    // A reserved entry the CHECK already rejects is dead weight; an upper-case
    // one would never match, because the lookup lower-cases the input.
    for (const name of RESERVED_USERNAMES) {
      expect(name).toMatch(USERNAME_PATTERN);
      expect(name).toBe(name.toLowerCase());
    }
    expect(new Set(RESERVED_USERNAMES).size).toBe(RESERVED_USERNAMES.length);
  });

  it('never reserves a prefix of the trigger fallback', () => {
    // The trigger falls back to 'player' || six hex characters of the user id.
    expect(RESERVED_USERNAMES.filter((n) => /^player[0-9a-f]{6}$/.test(n))).toEqual([]);
    expect(isReservedUsername('player3fa2b1')).toBe(false);
  });
});

describe('usernameReasonMessage', () => {
  it('has words for every refusal and none for ok', () => {
    const refusals: UsernameReason[] = [
      'too-short', 'too-long', 'invalid-chars', 'invalid-format', 'reserved', 'taken',
    ];
    for (const reason of refusals) expect(usernameReasonMessage(reason)).not.toBe('');
    expect(usernameReasonMessage('ok')).toBe('');
  });
});
