import { runSql } from "../db-client.js";

interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

interface TableInfo {
  table_name: string;
  columns: ColumnInfo[];
}

interface ViewInfo {
  view_name: string;
  definition: string;
}

interface FunctionInfo {
  function_name: string;
  return_type: string;
  argument_types: string;
}

interface EnumInfo {
  enum_name: string;
  values: string[];
}

export interface FullSchema {
  tables: TableInfo[];
  views: ViewInfo[];
  functions: FunctionInfo[];
  enums: EnumInfo[];
}

export async function getSchema(): Promise<FullSchema> {
  const [tablesRows, viewsRows, funcsRows, enumsRows] = await Promise.all([
    runSql(`
      SELECT c.table_name, c.column_name, c.data_type, c.is_nullable, c.column_default
      FROM information_schema.columns c
      WHERE c.table_schema = 'api'
      ORDER BY c.table_name, c.ordinal_position
    `),
    runSql(`
      SELECT table_name AS view_name, view_definition AS definition
      FROM information_schema.views
      WHERE table_schema = 'api'
      ORDER BY table_name
    `),
    runSql(`
      SELECT DISTINCT r.routine_name AS function_name,
        r.data_type AS return_type,
        pg_get_function_arguments(p.oid) AS argument_types
      FROM information_schema.routines r
      JOIN pg_proc p ON p.proname = r.routine_name
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE r.routine_schema = 'api' AND n.nspname = 'api'
      ORDER BY r.routine_name
    `),
    runSql(`
      SELECT t.typname AS enum_name,
        array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'api'
      GROUP BY t.typname
      ORDER BY t.typname
    `),
  ]);

  const tablesMap: Record<string, ColumnInfo[]> = {};
  for (const row of tablesRows as Array<Record<string, unknown>>) {
    const name = row.table_name as string;
    if (!tablesMap[name]) tablesMap[name] = [];
    tablesMap[name].push({
      column_name: row.column_name as string,
      data_type: row.data_type as string,
      is_nullable: row.is_nullable as string,
      column_default: row.column_default as string | null,
    });
  }

  return {
    tables: Object.entries(tablesMap).map(([table_name, columns]) => ({ table_name, columns })),
    views: (viewsRows as Array<Record<string, unknown>>).map((r) => ({
      view_name: r.view_name as string,
      definition: r.definition as string,
    })),
    functions: (funcsRows as Array<Record<string, unknown>>).map((r) => ({
      function_name: r.function_name as string,
      return_type: r.return_type as string,
      argument_types: r.argument_types as string,
    })),
    enums: (enumsRows as Array<Record<string, unknown>>).map((r) => ({
      enum_name: r.enum_name as string,
      values: r.values as string[],
    })),
  };
}

export function formatSchema(schema: FullSchema): string {
  const lines = ["# Database Schema (api schema)"];

  lines.push(`\n## Tables (${schema.tables.length})`);
  for (const t of schema.tables) {
    lines.push(`\n### ${t.table_name}`);
    for (const c of t.columns) {
      const nullable = c.is_nullable === "YES" ? "?" : "";
      const def = c.column_default ? ` = ${c.column_default}` : "";
      lines.push(`  ${c.column_name}${nullable}: ${c.data_type}${def}`);
    }
  }

  if (schema.views.length > 0) {
    lines.push(`\n## Views (${schema.views.length})`);
    for (const v of schema.views) {
      lines.push(`\n### ${v.view_name}`, "```sql", v.definition?.trim() ?? "", "```");
    }
  }

  if (schema.functions.length > 0) {
    lines.push(`\n## Functions (${schema.functions.length})`);
    for (const f of schema.functions) {
      lines.push(`- \`${f.function_name}(${f.argument_types})\` → ${f.return_type}`);
    }
  }

  if (schema.enums.length > 0) {
    lines.push(`\n## Enums (${schema.enums.length})`);
    for (const e of schema.enums) {
      lines.push(`- \`${e.enum_name}\`: ${e.values.join(", ")}`);
    }
  }

  return lines.join("\n");
}
