// In-memory fake of the tiny @supabase/supabase-js query-builder surface that
// persistence.service + account.service use, backed by plain arrays. Mock
// `../config/supabase` with the module this factory returns, then seed/inspect
// via `__tables` and reset with `__reset()`:
//
//   vi.mock('../config/supabase', async () => {
//     const { createSupabaseFakeModule } = await import('./helpers/supabase-fake');
//     return createSupabaseFakeModule();
//   });
//
// Supported chains:
//   from(t).select(cols).eq(...).eq(...).single()
//   from(t).select(cols).eq(...).order(col, { ascending })   ← awaitable
//   from(t).select(cols).eq(...).limit(n)                    ← awaitable
//   from(t).select(cols, { count: 'exact', head: true }).eq(...)  ← count only
//   from(t).upsert(row, { onConflict: 'a,b' })
//   from(t).insert(rows)
//   from(t).delete().in(col, values)                         ← awaitable
//   from(t).delete().eq(col, val).eq(...)                    ← awaitable
//   auth.admin.deleteUser(id)
//
// Every executed delete + deleteUser is appended to `__ops` (e.g.
// 'delete:user_blocks', 'auth.deleteUser') so tests can assert ordering.

type Row = Record<string, unknown>;
type SupaError = { code?: string; status?: number; message: string } | null;

export function createSupabaseFakeModule() {
  const tables: Record<string, Row[]> = {
    user_ratings: [],
    games:        [],
    user_blocks:  [],
    user_reports: [],
    profiles:     [],
  };

  const ops: string[] = [];
  // Test hooks: force a table's delete to error, or make deleteUser return an error.
  const failDeleteOn = new Set<string>();
  let deleteUserError: SupaError = null;

  function from(table: string) {
    const rows = tables[table] ?? (tables[table] = []);

    return {
      select(_cols: string, selectOpts?: { count?: string; head?: boolean }) {
        const filters: Array<(r: Row) => boolean> = [];
        const matches = () => rows.filter(r => filters.every(f => f(r)));
        const chain = {
          eq(col: string, val: unknown) { filters.push(r => r[col] === val); return chain; },
          async order(col: string, opts?: { ascending?: boolean }) {
            const asc = opts?.ascending !== false;
            const data = [...matches()].sort((a, b) =>
              String(a[col]) < String(b[col]) ? (asc ? -1 : 1) : String(a[col]) > String(b[col]) ? (asc ? 1 : -1) : 0);
            return { data, error: null };
          },
          async single() {
            const data = matches()[0] ?? null;
            return { data, error: data ? null : { code: 'PGRST116', message: 'No rows found' } };
          },
          async limit(n: number) {
            return { data: matches().slice(0, n), error: null };
          },
          // Awaiting the chain directly (no .single()/.order()/.limit()) resolves
          // to all matching rows — e.g. block.service's `select(...).eq(...)` —
          // plus a `count` for head/count queries like countBlocked.
          then(resolve: (v: { data: Row[]; count: number; error: null }) => void) {
            resolve({ data: selectOpts?.head ? [] : matches(), count: matches().length, error: null });
          },
        };
        return chain;
      },

      async upsert(row: Row, opts?: { onConflict?: string }) {
        const keys = (opts?.onConflict ?? '').split(',').map(s => s.trim()).filter(Boolean);
        const idx = keys.length
          ? rows.findIndex(r => keys.every(k => r[k] === row[k]))
          : -1;
        if (idx >= 0) rows[idx] = { ...rows[idx], ...row };
        else rows.push({ ...row });
        return { data: null, error: null };
      },

      async insert(newRows: Row | Row[]) {
        for (const r of Array.isArray(newRows) ? newRows : [newRows]) {
          rows.push({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...r });
        }
        return { data: null, error: null };
      },

      delete() {
        const filters: Array<(r: Row) => boolean> = [];
        const exec = (): { data: null; error: SupaError } => {
          ops.push(`delete:${table}`);
          if (failDeleteOn.has(table)) {
            return { data: null, error: { message: `simulated delete failure on ${table}` } };
          }
          for (let i = rows.length - 1; i >= 0; i--) {
            if (filters.every(f => f(rows[i]))) rows.splice(i, 1);
          }
          return { data: null, error: null };
        };
        const chain = {
          eq(col: string, val: unknown) { filters.push(r => r[col] === val); return chain; },
          async in(col: string, values: unknown[]) {
            filters.push(r => values.includes(r[col]));
            return exec();
          },
          // Awaiting the chain (e.g. `.delete().eq(...)`) runs the delete.
          then(resolve: (v: { data: null; error: SupaError }) => void) {
            resolve(exec());
          },
        };
        return chain;
      },
    };
  }

  const auth = {
    admin: {
      async deleteUser(_userId: string) {
        ops.push('auth.deleteUser');
        return { data: { user: null }, error: deleteUserError };
      },
    },
  };

  return {
    supabaseAdmin: { from, auth } as unknown,
    /** Test-only: direct access to the backing arrays for seeding/assertions. */
    __tables: tables,
    /** Test-only: ordered log of executed deletes + deleteUser. */
    __ops: ops,
    /** Test-only: force `.delete()` on a table to resolve with an error. */
    __failDeleteOn(table: string) { failDeleteOn.add(table); },
    /** Test-only: make `auth.admin.deleteUser` resolve with this error. */
    __setDeleteUserError(err: SupaError) { deleteUserError = err; },
    /** Test-only: clears all tables + hooks. */
    __reset() {
      for (const t of Object.values(tables)) t.length = 0;
      ops.length = 0;
      failDeleteOn.clear();
      deleteUserError = null;
    },
  };
}
