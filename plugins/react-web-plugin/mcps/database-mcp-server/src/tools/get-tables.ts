import { runSql } from "../db-client";

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

export async function getTables(): Promise<TableInfo[]> {
  const rows = await runSql(`
    SELECT
      c.table_name,
      c.column_name,
      c.data_type,
      c.is_nullable,
      c.column_default
    FROM information_schema.columns c
    WHERE c.table_schema = 'api'
    ORDER BY c.table_name, c.ordinal_position
  `);

  const tablesMap: Record<string, ColumnInfo[]> = {};

  for (const col of rows as Array<Record<string, unknown>>) {
    const tableName = col.table_name as string;
    if (!tablesMap[tableName]) tablesMap[tableName] = [];
    tablesMap[tableName].push({
      column_name: col.column_name as string,
      data_type: col.data_type as string,
      is_nullable: col.is_nullable as string,
      column_default: col.column_default as string | null,
    });
  }

  return Object.entries(tablesMap).map(([table_name, columns]) => ({
    table_name,
    columns,
  }));
}
