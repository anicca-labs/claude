# database-mcp-server

MCP server for database operations. Provides schema introspection, RLS policy inspection, query generation, SQL execution, and migration scaffolding — all scoped to the `api` schema.

## Tools

### Schema inspection

| Tool | Description |
| --- | --- |
| `get_tables` | Returns all tables and their columns from the `api` schema. Use before writing queries or scaffolding. |
| `get_schema` | Returns the full schema: tables, views, functions, and enums. More thorough than `get_tables` alone. |
| `get_rls_policies` | Returns all RLS policies for the `api` schema. Optionally filter by table name. |

### Queries

| Tool | Description |
| --- | --- |
| `generate_query` | Takes a natural language description and returns a typed query based on the real schema. |
| `run_query` | Executes a raw SQL query and returns results. Intended for read-only inspection. |

### Migrations

| Tool | Description |
| --- | --- |
| `generate_migration` | Creates a timestamped SQL migration file in `supabase/migrations/`. Pass `sql` to pre-populate, or omit for an empty scaffold. |

## Setup

### Environment variables

```env
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

### Build

```bash
yarn install
yarn build
```

### .mcp.json entry

```json
"database": {
  "type": "stdio",
  "command": "node",
  "args": ["/path/to/database-mcp-server/dist/index.js"]
}
```

## Notes

- All tools operate on the `api` schema, not `public`.
- `run_query` uses the service role key — avoid DML unless you know what you are doing.
- `generate_query` uses simple heuristics; review the output before using in production.
