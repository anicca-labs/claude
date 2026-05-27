import { readFile } from "fs/promises";
import { join } from "path";
import { createSign } from "crypto";
import { runSql, loadProjectEnv } from "../db-client.js";
import { loadConfig } from "./load-config.js";
import type { BackendKind } from "./load-config.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ServiceAccount {
  project_id: string;
  private_key: string;
  client_email: string;
}

interface FcmSuccessResponse {
  name: string;
}

interface FcmErrorResponse {
  error: { message: string };
}

type FcmResponse = FcmSuccessResponse | FcmErrorResponse;

// ─── JWT / OAuth2 helpers ──────────────────────────────────────────────────────

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URI = "https://oauth2.googleapis.com/token";
const JWT_GRANT_TYPE = "urn:ietf:params:oauth2:grant-type:jwt-bearer";

function toBase64url(input: string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = toBase64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: FCM_SCOPE,
      aud: TOKEN_URI,
      iat: now,
      exp: now + 3600,
    }),
  );

  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(sa.private_key, "base64url");
  const jwt = `${header}.${payload}.${signature}`;

  const res = await fetch(TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: JWT_GRANT_TYPE, assertion: jwt }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get Google access token: ${err}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function loadServiceAccount(
  projectRoot: string,
  pathFromConfig: string,
): Promise<ServiceAccount> {
  const resolved = pathFromConfig.startsWith("/")
    ? pathFromConfig
    : join(projectRoot, pathFromConfig);
  const raw = await readFile(resolved, "utf-8");
  return JSON.parse(raw) as ServiceAccount;
}

function maskToken(token: string): string {
  return `${token.slice(0, 20)}...${token.slice(-10)}`;
}

// ─── Inspect push tokens ───────────────────────────────────────────────────────

export interface InspectPushTokensOptions {
  projectRoot: string;
  tableName?: string;
  limit?: number;
}

export interface InspectPushTokensResult {
  tableExists: boolean;
  tableName: string;
  total: number;
  byPlatform: Record<string, number>;
  recentTokens: Array<{
    id: string;
    user_id: string;
    platform: string;
    token_preview: string;
    created_at: string;
  }>;
  suggestedMigration: string | null;
}

const DEFAULT_TOKENS_TABLE = "device_tokens";
const DEFAULT_TOKEN_LIMIT = 10;

async function inspectDatabaseTokens(
  tableName: string,
  limit: number,
): Promise<InspectPushTokensResult> {
  const existsRows = await runSql(`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'api'
      AND table_name = '${tableName}'
    LIMIT 1
  `);

  if (existsRows.length === 0) {
    return {
      tableExists: false,
      tableName,
      total: 0,
      byPlatform: {},
      recentTokens: [],
      suggestedMigration: generateMigration(tableName),
    };
  }

  const countRows = await runSql(`
    SELECT platform, COUNT(*) as count
    FROM api.${tableName}
    GROUP BY platform
  `);

  const byPlatform: Record<string, number> = {};
  let total = 0;
  for (const row of countRows) {
    const platform = typeof row.platform === "string" ? row.platform : "unknown";
    const count = typeof row.count === "string" ? parseInt(row.count, 10) : 0;
    byPlatform[platform] = count;
    total += count;
  }

  const recentRows = await runSql(`
    SELECT id, user_id, platform, token, created_at
    FROM api.${tableName}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `);

  const recentTokens = recentRows.map((row) => ({
    id: typeof row.id === "string" ? row.id : "",
    user_id: typeof row.user_id === "string" ? row.user_id : "",
    platform: typeof row.platform === "string" ? row.platform : "",
    token_preview:
      typeof row.token === "string" ? maskToken(row.token) : "(invalid)",
    created_at: typeof row.created_at === "string" ? row.created_at : "",
  }));

  return { tableExists: true, tableName, total, byPlatform, recentTokens, suggestedMigration: null };
}

function unsupportedInspectResult(
  tableName: string,
  backend: BackendKind,
): InspectPushTokensResult {
  return {
    tableExists: false,
    tableName,
    total: 0,
    byPlatform: {},
    recentTokens: [],
    suggestedMigration:
      backend === "firebase"
        ? `// Token inspection is not available server-side for Firebase.\n` +
          `// Query the "${tableName}" Firestore collection directly in the Firebase console,\n` +
          `// or use the Admin SDK in a Cloud Function to list documents.`
        : `// Token inspection is not available for REST backends.\n` +
          `// Use your API's admin interface or database tool to query stored tokens.\n` +
          `// Pass a token directly to send_test_push to test delivery.`,
  };
}

export async function inspectPushTokens(
  options: InspectPushTokensOptions,
): Promise<InspectPushTokensResult> {
  loadProjectEnv(options.projectRoot);
  const config = await loadConfig(options.projectRoot);
  const backend = config.backend;
  const tableName =
    options.tableName ??
    config.firebase?.deviceTokensTable ??
    DEFAULT_TOKENS_TABLE;
  const limit = options.limit ?? DEFAULT_TOKEN_LIMIT;

  if (backend !== "supabase") {
    return unsupportedInspectResult(tableName, backend);
  }

  return inspectDatabaseTokens(tableName, limit);
}

function generateMigration(tableName: string): string {
  return [
    `-- Migration: create api.${tableName}`,
    `CREATE TABLE IF NOT EXISTS api.${tableName} (`,
    `  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),`,
    `  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,`,
    `  token       text        NOT NULL,`,
    `  platform    text        NOT NULL CHECK (platform IN ('ios', 'android', 'web')),`,
    `  created_at  timestamptz NOT NULL DEFAULT now(),`,
    `  updated_at  timestamptz NOT NULL DEFAULT now(),`,
    `  UNIQUE (user_id, token)`,
    `);`,
    ``,
    `ALTER TABLE api.${tableName} ENABLE ROW LEVEL SECURITY;`,
    ``,
    `CREATE POLICY "${tableName}_owner" ON api.${tableName}`,
    `  USING (user_id = auth.uid())`,
    `  WITH CHECK (user_id = auth.uid());`,
    ``,
    `-- Keep updated_at current (requires moddatetime extension)`,
    `CREATE TRIGGER ${tableName}_updated_at`,
    `  BEFORE UPDATE ON api.${tableName}`,
    `  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);`,
  ].join("\n");
}

export function formatInspectResult(result: InspectPushTokensResult): string {
  const lines = [`# Push Tokens — \`${result.tableName}\``];

  if (!result.tableExists) {
    lines.push(
      "",
      "> Table not found. Run the migration below to create it.",
      "",
      "```sql",
      result.suggestedMigration!,
      "```",
    );
    return lines.join("\n");
  }

  lines.push("", `**Total:** ${result.total}`);

  if (Object.keys(result.byPlatform).length > 0) {
    lines.push("", "**By platform:**");
    for (const [platform, count] of Object.entries(result.byPlatform)) {
      lines.push(`  - ${platform}: ${count}`);
    }
  }

  if (result.recentTokens.length > 0) {
    lines.push("", `**${result.recentTokens.length} most recent:**`);
    for (const t of result.recentTokens) {
      lines.push(
        `  - user=${t.user_id}  platform=${t.platform}  token=${t.token_preview}  created=${t.created_at}`,
      );
    }
  }

  return lines.join("\n");
}

// ─── Send test push ────────────────────────────────────────────────────────────

export interface SendTestPushOptions {
  projectRoot: string;
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  serviceAccountPath?: string;
}

export interface SendTestPushResult {
  success: boolean;
  messageId: string | null;
  error: string | null;
  projectId: string;
  tokenPreview: string;
}

export async function sendTestPush(
  options: SendTestPushOptions,
): Promise<SendTestPushResult> {
  const config = await loadConfig(options.projectRoot);
  const saPath =
    options.serviceAccountPath ?? config.firebase?.serviceAccountPath;

  if (!saPath) {
    throw new Error(
      'No Firebase service account configured. Add "firebase": { "serviceAccountPath": "..." } to mcp.config.json or pass serviceAccountPath directly.',
    );
  }

  const sa = await loadServiceAccount(options.projectRoot, saPath);
  const accessToken = await getAccessToken(sa);

  const message: Record<string, unknown> = {
    token: options.token,
    notification: { title: options.title, body: options.body },
  };

  if (options.data && Object.keys(options.data).length > 0) {
    message.data = options.data;
  }

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    },
  );

  const json = (await res.json()) as FcmResponse;

  if (!res.ok) {
    const errorMessage =
      "error" in json ? json.error.message : `FCM HTTP ${res.status}`;
    return {
      success: false,
      messageId: null,
      error: errorMessage,
      projectId: sa.project_id,
      tokenPreview: maskToken(options.token),
    };
  }

  return {
    success: true,
    messageId: "name" in json ? json.name : null,
    error: null,
    projectId: sa.project_id,
    tokenPreview: maskToken(options.token),
  };
}

export function formatSendResult(result: SendTestPushResult): string {
  const status = result.success ? "✓ Delivered" : "✗ Failed";
  const lines = [
    `# Test Push — ${status}`,
    `**Project:** ${result.projectId}`,
    `**Token:** ${result.tokenPreview}`,
  ];

  if (result.success) {
    lines.push(`**Message ID:** ${result.messageId}`);
  } else {
    lines.push(`**Error:** ${result.error}`);
  }

  return lines.join("\n");
}
