import { createClient } from "@supabase/supabase-js";

function getSupabaseCredentials(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing required env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return { url, key };
}

export async function runSql(
  query: string,
): Promise<Record<string, unknown>[]> {
  const { url, key } = getSupabaseCredentials();

  const response = await fetch(`${url}/rest/v1/rpc/run_sql`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
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

export function getDatabaseClient() {
  const { url, key } = getSupabaseCredentials();
  return createClient(url, key);
}
