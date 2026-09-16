import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getTables } from "./tools/get-tables.js";
import { getRlsPolicies } from "./tools/get-rls-policies.js";
import { generateQuery } from "./tools/generate-query.js";
import { runQuery } from "./tools/run-query.js";
import { getSchema, formatSchema } from "./tools/get-schema.js";
import { generateMigration, formatMigrationResult } from "./tools/generate-migration.js";

const server = new McpServer({
  name: "database-mcp-server",
  version: "1.0.0",
});

server.registerTool(
  "get_tables",
  {
    description:
      "Returns all tables and their columns from your database api schema",
  },
  async () => {
    const tables = await getTables();
    const lines: string[] = [`# Tables (${tables.length})\n`];
    for (const t of tables) {
      lines.push(`## ${t.table_name}`);
      for (const c of t.columns) {
        const nullable = c.is_nullable === "YES" ? "?" : "";
        const def = c.column_default ? ` = ${c.column_default}` : "";
        lines.push(`- ${c.column_name}: ${c.data_type}${nullable}${def}`);
      }
      lines.push("");
    }
    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  },
);

server.registerTool(
  "get_rls_policies",
  {
    description:
      "Returns all Row Level Security (RLS) policies defined on your database tables",
    inputSchema: {
      tableName: z
        .string()
        .optional()
        .describe("Filter by table name. Omit to return policies for all tables."),
    },
  },
  async ({ tableName } = { tableName: undefined }) => {
    const policies = await getRlsPolicies(tableName);
    if (policies.length === 0) {
      return {
        content: [{ type: "text", text: tableName ? `No RLS policies for table "${tableName}".` : "No RLS policies found." }],
      };
    }
    const byTable: Record<string, typeof policies> = {};
    for (const p of policies) {
      (byTable[p.table_name] ??= []).push(p);
    }
    const lines: string[] = [`# RLS Policies (${policies.length})\n`];
    for (const [table, tPolicies] of Object.entries(byTable)) {
      lines.push(`## ${table}`);
      for (const p of tPolicies) {
        const roles = p.roles.length ? ` [${p.roles.join(", ")}]` : "";
        lines.push(`- **${p.policy_name}** ${p.command} (${p.permissive})${roles}`);
        if (p.qual) lines.push(`  USING: ${p.qual}`);
        if (p.with_check) lines.push(`  WITH CHECK: ${p.with_check}`);
      }
      lines.push("");
    }
    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  },
);

server.registerTool(
  "get_schema",
  {
    description:
      "Returns the full database api schema including tables, views, functions, and enums. Use this for a complete picture of the database — more thorough than get_tables alone.",
  },
  async () => {
    const schema = await getSchema();
    return {
      content: [{ type: "text", text: formatSchema(schema) }],
    };
  },
);

server.registerTool(
  "generate_query",
  {
    description:
      "Takes a natural language description and returns a typed query based on your real schema",
    inputSchema: {
      description: z
        .string()
        .describe(
          "Natural language description of the query you want, e.g. 'get all bookings for a user'",
        ),
    },
  },
  async ({ description }) => {
    const result = await generateQuery(description);
    return {
      content: [
        {
          type: "text",
          text: [
            `## Generated Query`,
            ``,
            `**Request:** ${result.description}`,
            ``,
            `\`\`\`typescript`,
            result.query,
            `\`\`\``,
            ``,
            `**Schema context used:**`,
            `\`\`\``,
            result.explanation,
            `\`\`\``,
          ].join("\n"),
        },
      ],
    };
  },
);

server.registerTool(
  "run_query",
  {
    description:
      "Executes a raw SQL query against your database and returns the results",
    inputSchema: {
      query: z
        .string()
        .describe(
          "The SQL query to execute, e.g. 'SELECT * FROM bookings LIMIT 10'",
        ),
    },
  },
  async ({ query }) => {
    const rows = await runQuery(query);
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
    };
  },
);

server.registerTool(
  "generate_migration",
  {
    description:
      "Creates a new timestamped SQL migration file in supabase/migrations/. Pass optional SQL to pre-populate it, or leave blank for an empty scaffold.",
    inputSchema: {
      projectRoot: z
        .string()
        .describe("Absolute path to the project root"),
      name: z
        .string()
        .describe(
          'Short description used as the file name suffix, e.g. "add_user_preferences_table"',
        ),
      sql: z
        .string()
        .optional()
        .describe("SQL to write into the migration file. Omit to create an empty scaffold."),
    },
  },
  async ({ projectRoot, name, sql }) => {
    const result = await generateMigration(projectRoot, name, sql);
    return {
      content: [{ type: "text", text: formatMigrationResult(result) }],
    };
  },
);

// ─── Start server ─────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Database MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
