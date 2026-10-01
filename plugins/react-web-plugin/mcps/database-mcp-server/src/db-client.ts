import { Pool } from "pg";

// Two connection modes, picked by env:
//   1. DATABASE_URL — any Postgres (RDS, Neon, Vercel Postgres, local, Supabase's
//      direct connection string). Preferred for this plugin.
//   2. SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — legacy mode via the Supabase
//      REST `run_sql` RPC (requires that function to exist in the project).
// DB_SCHEMA sets which schema the introspection tools read (default: public).

const databaseUrl = process.env.DATABASE_URL;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const DB_SCHEMA = process.env.DB_SCHEMA || "public";

if (!databaseUrl && !(supabaseUrl && supabaseKey)) {
  throw new Error(
    "Missing database env vars: set DATABASE_URL (any Postgres), or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY",
  );
}

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      max: 3,
      ssl: /localhost|127\.0\.0\.1/.test(databaseUrl)
        ? undefined
        : { rejectUnauthorized: false },
    })
  : null;

const READ_ONLY_TIMEOUT = "15s";

// Throws unless the current connection mode can enforce read-only. The
// Supabase REST `run_sql` RPC executes whatever it's given, so it can't.
export function assertReadOnlyCapable(hasPool: boolean = pool !== null): void {
  if (!hasPool) {
    throw new Error(
      "run_query needs DATABASE_URL: the Supabase REST fallback can't enforce read-only queries.",
    );
  }
}

// Runs caller-supplied SQL so the database itself refuses any write:
//   - inside BEGIN TRANSACTION READ ONLY, always rolled back;
//   - a throwaway SELECT first, so SET TRANSACTION READ WRITE can no longer
//     switch the mode ("must be set before any query");
//   - extended query protocol, which accepts exactly one statement, so
//     "COMMIT; DROP ..." can't step outside the transaction;
//   - a statement timeout so a runaway query can't hold the connection.
export async function runReadOnly(
  query: string,
): Promise<Record<string, unknown>[]> {
  assertReadOnlyCapable();
  const client = await pool!.connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query(`SET LOCAL statement_timeout = '${READ_ONLY_TIMEOUT}'`);
    await client.query("SELECT 1");
    // queryMode isn't in @types/pg yet; pg >= 8.13 honours it.
    const result = await client.query({ text: query, queryMode: "extended" } as never);
    return (result as { rows: Record<string, unknown>[] }).rows;
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

export function closePool(): Promise<void> | undefined {
  return pool?.end();
}

// For the server's own fixed introspection queries only — never for SQL that
// comes from the model or the user (use runReadOnly for that).
export async function runSql(
  query: string,
): Promise<Record<string, unknown>[]> {
  if (pool) {
    const result = await pool.query(query);
    return result.rows as Record<string, unknown>[];
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/run_sql`, {
    method: "POST",
    headers: {
      apikey: supabaseKey!,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`run_sql failed: ${err}`);
  }

  return response.json();
}
