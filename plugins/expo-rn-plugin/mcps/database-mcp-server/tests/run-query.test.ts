// run_query must be read-only at the database level, not just by description.
//
// Needs a disposable Postgres. Run:
//   TEST_DATABASE_URL=postgres://user:pass@localhost:5432/db yarn test
// Skipped when TEST_DATABASE_URL is unset.
import { test, after } from "node:test";
import assert from "node:assert/strict";

const url = process.env.TEST_DATABASE_URL;
const skip = url ? false : "TEST_DATABASE_URL not set";
if (url) process.env.DATABASE_URL = url;

// Imported lazily so db-client sees DATABASE_URL.
const load = () => import("../src/db-client");

after(async () => {
  if (url) (await load()).closePool();
});

test("SELECT works", { skip }, async () => {
  const { runReadOnly } = await load();
  const rows = await runReadOnly("SELECT 1 AS one");
  assert.deepEqual(rows, [{ one: 1 }]);
});

for (const [name, sql] of [
  ["CREATE TABLE", "CREATE TABLE mcp_ro_probe (x int)"],
  ["multiple statements", "WITH t AS (SELECT 1) SELECT * FROM t; CREATE TABLE mcp_ro_probe (x int)"],
  ["COMMIT then write", "COMMIT; CREATE TABLE mcp_ro_probe (x int)"],
  ["SET TRANSACTION READ WRITE", "SET TRANSACTION READ WRITE"],
  ["nextval on a sequence", "SELECT nextval('mcp_ro_probe_seq')"],
] as const) {
  test(`rejects: ${name}`, { skip }, async () => {
    const { runReadOnly } = await load();
    await assert.rejects(runReadOnly(sql));
  });
}

test("writes from rejected queries never land", { skip }, async () => {
  const { runReadOnly } = await load();
  const rows = await runReadOnly(
    "SELECT to_regclass('public.mcp_ro_probe') IS NULL AS absent",
  );
  assert.deepEqual(rows, [{ absent: true }]);
});

test("long queries time out", { skip }, async () => {
  const { runReadOnly } = await load();
  await assert.rejects(runReadOnly("SELECT pg_sleep(30)"), /statement timeout/);
});

test("Supabase REST mode refuses run_query", { skip }, async () => {
  const { assertReadOnlyCapable } = await load();
  assert.throws(() => assertReadOnlyCapable(false), /DATABASE_URL/);
});
