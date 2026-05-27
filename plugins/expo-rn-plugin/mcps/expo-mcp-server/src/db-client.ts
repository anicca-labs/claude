import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join } from "path";

export function loadProjectEnv(projectRoot: string): void {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  const envPath = join(projectRoot, ".env");
  let raw: string;
  try {
    raw = readFileSync(envPath, "utf-8");
  } catch {
    return;
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
}

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
