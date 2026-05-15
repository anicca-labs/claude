import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

interface MigrationResult {
  path: string;
  fileName: string;
  content: string;
}

const CREATE_TABLE_RE = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(\w+)\.)?(\w+)/gi;

function appendGrantBoilerplate(sql: string): string {
  const tables: Array<{ schema: string; table: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = CREATE_TABLE_RE.exec(sql)) !== null) {
    tables.push({ schema: match[1] ?? "api", table: match[2] });
  }
  if (tables.length === 0) return sql;

  const grants = tables
    .map(
      ({ schema, table }) => `
-- Supabase Data API access: explicit grants required for all tables
grant select
  on ${schema}.${table}
  to anon;

grant select, insert, update, delete
  on ${schema}.${table}
  to authenticated;

grant select, insert, update, delete
  on ${schema}.${table}
  to service_role;

alter table ${schema}.${table}
  enable row level security;`,
    )
    .join("\n");

  return sql + "\n" + grants;
}

function migrationTimestamp(): string {
  return new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
}

export async function generateMigration(
  projectRoot: string,
  name: string,
  sql?: string,
): Promise<MigrationResult> {
  const migrationsDir = join(projectRoot, "supabase", "migrations");
  await mkdir(migrationsDir, { recursive: true });

  const safeName = name.trim().replace(/\s+/g, "_").toLowerCase();
  const fileName = `${migrationTimestamp()}_${safeName}.sql`;
  const filePath = join(migrationsDir, fileName);

  const content = sql?.trim()
    ? appendGrantBoilerplate(sql.trim()) + "\n"
    : `-- Migration: ${name}\n-- Created: ${new Date().toISOString()}\n\n-- Add your SQL here\n`;

  await writeFile(filePath, content, "utf-8");

  return { path: filePath, fileName, content };
}

export function formatMigrationResult(result: MigrationResult): string {
  return [
    "## Migration created",
    `File: ${result.path}`,
    "",
    "```sql",
    result.content.trim(),
    "```",
  ].join("\n");
}
