import { runReadOnly } from "../db-client";

// Caller-supplied SQL: always executed read-only (see runReadOnly).
export async function runQuery(
  query: string,
): Promise<Record<string, unknown>[]> {
  return runReadOnly(query);
}
