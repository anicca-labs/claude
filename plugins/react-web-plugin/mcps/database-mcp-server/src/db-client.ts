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
