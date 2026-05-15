"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateMigration = generateMigration;
exports.formatMigrationResult = formatMigrationResult;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const CREATE_TABLE_RE = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(\w+)\.)?(\w+)/gi;
function appendGrantBoilerplate(sql) {
    const tables = [];
    let match;
    while ((match = CREATE_TABLE_RE.exec(sql)) !== null) {
        tables.push({ schema: match[1] ?? "api", table: match[2] });
    }
    if (tables.length === 0)
        return sql;
    const grants = tables
        .map(({ schema, table }) => `
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
  enable row level security;`)
        .join("\n");
    return sql + "\n" + grants;
}
function migrationTimestamp() {
    return new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
}
async function generateMigration(projectRoot, name, sql) {
    const migrationsDir = (0, path_1.join)(projectRoot, "supabase", "migrations");
    await (0, promises_1.mkdir)(migrationsDir, { recursive: true });
    const safeName = name.trim().replace(/\s+/g, "_").toLowerCase();
    const fileName = `${migrationTimestamp()}_${safeName}.sql`;
    const filePath = (0, path_1.join)(migrationsDir, fileName);
    const content = sql?.trim()
        ? appendGrantBoilerplate(sql.trim()) + "\n"
        : `-- Migration: ${name}\n-- Created: ${new Date().toISOString()}\n\n-- Add your SQL here\n`;
    await (0, promises_1.writeFile)(filePath, content, "utf-8");
    return { path: filePath, fileName, content };
}
function formatMigrationResult(result) {
    return [
        "## Migration created",
        `File: ${result.path}`,
        "",
        "```sql",
        result.content.trim(),
        "```",
    ].join("\n");
}
