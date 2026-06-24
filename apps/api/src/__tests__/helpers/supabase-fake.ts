// In-memory fake of the tiny @supabase/supabase-js query-builder surface that
// persistence.service uses, backed by plain arrays. Mock `../config/supabase`
// with the module this factory returns, then seed/inspect via `__tables` and
// reset with `__reset()`:
//
//   vi.mock('../config/supabase', async () => {
//     const { createSupabaseFakeModule } = await import('./helpers/supabase-fake');
//     return createSupabaseFakeModule();
//   });
//
// Supported chains (exactly what persistence.service calls):
//   from(t).select(cols).eq(...).eq(...).single()
//   from(t).select(cols).eq(...).order(col, { ascending })   ← awaitable
//   from(t).upsert(row, { onConflict: 'a,b' })
//   from(t).insert(rows)
//   from(t).delete().in(col, values)

type Row = Record<string, unknown>;

export function createSupabaseFakeModule() {
  const tables: Record<string, Row[]> = {
    user_ratings: [],
    games:        [],
  };

  function from(table: string) {
    const rows = tables[table] ?? (tables[table] = []);

    return {
      select(_cols: string) {
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
          // Awaiting the chain directly (no .single()/.order()) resolves to all
          // matching rows — e.g. block.service's `select(...).eq(...)`.
          then(resolve: (v: { data: Row[]; error: null }) => void) {
            resolve({ data: matches(), error: null });
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
        return {
          async in(col: string, values: unknown[]) {
            for (let i = rows.length - 1; i >= 0; i--) {
              if (values.includes(rows[i][col])) rows.splice(i, 1);
            }
            return { data: null, error: null };
          },
        };
      },
    };
  }

  return {
    supabaseAdmin: { from } as unknown,
    /** Test-only: direct access to the backing arrays for seeding/assertions. */
    __tables: tables,
    /** Test-only: clears all tables. */
    __reset() { for (const t of Object.values(tables)) t.length = 0; },
  };
}
