import { runSql } from "../db-client";

interface RlsPolicy {
  table_name: string;
  policy_name: string;
  command: string;
  permissive: string;
  roles: string[];
  qual: string | null;
  with_check: string | null;
}

function pgIdent(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: "${name}"`);
  }
  return name;
}

export async function getRlsPolicies(tableName?: string): Promise<RlsPolicy[]> {
  const tableFilter = tableName ? `AND tablename = '${pgIdent(tableName)}'` : "";

  const rows = await runSql(`
    SELECT tablename, policyname, cmd, permissive, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'api'
    ${tableFilter}
    ORDER BY tablename, policyname
  `);

  return rows.map((row) => ({
    table_name: row.tablename as string,
    policy_name: row.policyname as string,
    command: row.cmd as string,
    permissive: row.permissive as string,
    roles: row.roles as string[],
    qual: row.qual as string | null,
    with_check: row.with_check as string | null,
  }));
}
