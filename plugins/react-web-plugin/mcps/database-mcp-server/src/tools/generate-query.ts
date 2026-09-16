import { getTables } from "./get-tables";

interface GenerateQueryResult {
  description: string;
  query: string;
  explanation: string;
}

function buildSchemaContext(
  tables: Awaited<ReturnType<typeof getTables>>
): string {
  return tables
    .map((t) => {
      const cols = t.columns
        .map(
          (c) =>
            `  ${c.column_name}: ${c.data_type}${c.is_nullable === "NO" ? " (required)" : ""}`
        )
        .join("\n");
      return `Table: ${t.table_name}\n${cols}`;
    })
    .join("\n\n");
}

export async function generateQuery(
  naturalLanguage: string
): Promise<GenerateQueryResult> {
  const tables = await getTables();
  const schemaContext = buildSchemaContext(tables);

  // Build a typed query template based on the description.
  // This gives Claude the schema + a best-effort generated query to refine.
  const queryTemplate = inferQueryFromDescription(naturalLanguage, tables);

  return {
    description: naturalLanguage,
    query: queryTemplate,
    explanation: `Schema used:\n\n${schemaContext}`,
  };
}

function inferQueryFromDescription(
  description: string,
  tables: Awaited<ReturnType<typeof getTables>>
): string {
  const lower = description.toLowerCase();

  // Find the most likely target table by matching words in the description
  const matched = tables.find((t) => lower.includes(t.table_name.replace(/_/g, " ").toLowerCase()) || lower.includes(t.table_name.toLowerCase()));

  if (!matched) {
    const tableList = tables.map((t) => t.table_name).join(", ");
    return `// Could not determine target table from: "${description}"\n// Available tables: ${tableList}\n\nconst { data, error } = await supabase\n  .from('<table_name>')\n  .select('*');`;
  }

  const isFiltered = lower.includes(" for ") || lower.includes(" by ") || lower.includes(" where ");
  const filterColumn = matched.columns.find(
    (c) =>
      lower.includes(c.column_name.replace(/_/g, " ")) ||
      lower.includes(c.column_name)
  );

  if (isFiltered && filterColumn) {
    return `const { data, error } = await supabase\n  .from('${matched.table_name}')\n  .select('*')\n  .eq('${filterColumn.column_name}', <value>);`;
  }

  return `const { data, error } = await supabase\n  .from('${matched.table_name}')\n  .select('*');`;
}
