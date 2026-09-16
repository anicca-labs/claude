import { runSql } from "../db-client";

export async function runQuery(
  query: string,
): Promise<Record<string, unknown>[]> {
  return runSql(query);
}
