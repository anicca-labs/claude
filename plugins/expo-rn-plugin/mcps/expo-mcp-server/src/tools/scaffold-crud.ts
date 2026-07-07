import { getTableSchema } from "../schema-source.js";
import type { ColumnInfo } from "../schema-source.js";
import { loadConfig } from "./load-config.js";
import type { BackendKind } from "./load-config.js";

export interface ScaffoldCrudOptions {
  tableName: string;
  projectRoot: string;
  /** Skip id / created_at / updated_at / deleted_at in write types. Default: true */
  omitAutoFields?: boolean;
  /**
   * Generate form-based detail and create screens that import the {Pascal}Form
   * produced by scaffold_form. Default: false — detail screen is read-only,
   * no create screen is generated.
   */
  includeForm?: boolean;
  /** Override the backend from mcp.config.json */
  backend?: BackendKind;
}

interface RouteFile {
  path: string;
  code: string;
}

export interface ScaffoldCrudResult {
  tableName: string;
  pascalName: string;
  screensDir: string;
  routesDir: string;
  includeForm: boolean;
  typesCode: string;
  hooksCode: string;
  listScreenCode: string;
  detailScreenCode: string;
  createScreenCode: string | null;
  routeFiles: RouteFile[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const AUTO_FIELDS = new Set([
  "id",
  "created_at",
  "updated_at",
  "deleted_at",
  "inserted_at",
]);

const DISPLAY_FIELD_CANDIDATES = [
  "name",
  "title",
  "label",
  "description",
  "email",
  "slug",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toPascalCase(snake: string): string {
  return snake
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

function toCamelCase(snake: string): string {
  const pascal = toPascalCase(snake);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

type FieldKind =
  | "text"
  | "number"
  | "integer"
  | "boolean"
  | "date"
  | "uuid"
  | "json"
  | "enum"
  | "unknown";

function resolveKind(dataType: string, udtName: string): FieldKind {
  const t = dataType.toLowerCase();
  const u = udtName.toLowerCase();
  if (t === "uuid") return "uuid";
  if (t === "boolean") return "boolean";
  if (
    ["integer", "int2", "int4", "int8", "smallint", "bigint"].includes(t) ||
    ["int2", "int4", "int8"].includes(u)
  )
    return "integer";
  if (
    ["numeric", "decimal", "real", "double precision", "float4", "float8"].includes(t)
  )
    return "number";
  if (
    ["text", "character varying", "varchar", "char", "character", "citext", "name"].includes(t)
  )
    return "text";
  if (
    ["date", "timestamp", "timestamp with time zone", "timestamp without time zone", "timestamptz"].includes(t)
  )
    return "date";
  if (["json", "jsonb"].includes(t)) return "json";
  if (t === "user-defined" || t === "array") return "enum";
  return "unknown";
}

function tsType(
  kind: FieldKind,
  udtName: string,
  isNullable: boolean,
  enums: Map<string, string[]>,
): string {
  let base: string;
  if (kind === "uuid" || kind === "text") base = "string";
  else if (kind === "boolean") base = "boolean";
  else if (kind === "integer" || kind === "number") base = "number";
  else if (kind === "date") base = "string"; // ISO string from Supabase
  else if (kind === "json") base = "Record<string, unknown>";
  else if (kind === "enum") {
    const values = enums.get(udtName);
    base =
      values && values.length > 0
        ? values.map((v) => `"${v}"`).join(" | ")
        : "string";
  } else base = "unknown";
  return isNullable ? `${base} | null` : base;
}

function findDisplayField(columns: ColumnInfo[]): string {
  for (const candidate of DISPLAY_FIELD_CANDIDATES) {
    if (columns.some((c) => c.column_name === candidate)) return candidate;
  }
  const firstText = columns.find((c) => {
    const kind = resolveKind(c.data_type, c.udt_name);
    return kind === "text" && c.column_name !== "id";
  });
  return firstText?.column_name ?? "id";
}

// ─── Code generators ──────────────────────────────────────────────────────────

function generateTypesCode(
  tableName: string,
  pascalName: string,
  allColumns: ColumnInfo[],
  writeColumns: ColumnInfo[],
  enums: Map<string, string[]>,
): string {
  const rowFields = allColumns
    .map((col) => {
      const kind = resolveKind(col.data_type, col.udt_name);
      const nullable = col.is_nullable === "YES";
      return `  ${col.column_name}: ${tsType(kind, col.udt_name, nullable, enums)};`;
    })
    .join("\n");

  const createFields = writeColumns
    .map((col) => {
      const kind = resolveKind(col.data_type, col.udt_name);
      const nullable = col.is_nullable === "YES";
      const optional = nullable ? "?" : "";
      return `  ${col.column_name}${optional}: ${tsType(kind, col.udt_name, false, enums)};`;
    })
    .join("\n");

  return [
    `// Generated from \`${tableName}\``,
    ``,
    `export interface ${pascalName}Row {`,
    rowFields,
    `}`,
    ``,
    `/** Input for INSERT — auto-managed fields omitted, nullable fields optional */`,
    `export type Create${pascalName}Input = {`,
    createFields,
    `};`,
    ``,
    `/** Input for UPDATE — all fields optional */`,
    `export type Update${pascalName}Input = Partial<Create${pascalName}Input>;`,
  ].join("\n");
}

function generateDatabaseHooksCode(tableName: string, pascalName: string): string {
  const queryKeyConst = `${toCamelCase(tableName).toUpperCase()}_QUERY_KEY`;
  return [
    `import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";`,
    `import { supabase } from "@react-auth-client";`,
    `import type { ${pascalName}Row, Create${pascalName}Input, Update${pascalName}Input } from "./${pascalName}Types";`,
    ``,
    `const ${queryKeyConst} = ["${tableName}"] as const;`,
    ``,
    `export function useList${pascalName}() {`,
    `  return useQuery({`,
    `    queryKey: ${queryKeyConst},`,
    `    queryFn: async () => {`,
    `      const { data, error } = await supabase.from("${tableName}").select("*");`,
    `      if (error) throw error;`,
    `      return data as ${pascalName}Row[];`,
    `    },`,
    `  });`,
    `}`,
    ``,
    `export function useGet${pascalName}(id: string) {`,
    `  return useQuery({`,
    `    queryKey: [...${queryKeyConst}, id],`,
    `    queryFn: async () => {`,
    `      const { data, error } = await supabase`,
    `        .from("${tableName}")`,
    `        .select("*")`,
    `        .eq("id", id)`,
    `        .single();`,
    `      if (error) throw error;`,
    `      return data as ${pascalName}Row;`,
    `    },`,
    `    enabled: !!id,`,
    `  });`,
    `}`,
    ``,
    `export function useCreate${pascalName}() {`,
    `  const qc = useQueryClient();`,
    `  return useMutation({`,
    `    mutationFn: async (input: Create${pascalName}Input) => {`,
    `      const { data, error } = await supabase`,
    `        .from("${tableName}")`,
    `        .insert(input)`,
    `        .select()`,
    `        .single();`,
    `      if (error) throw error;`,
    `      return data as ${pascalName}Row;`,
    `    },`,
    `    onSuccess: () => qc.invalidateQueries({ queryKey: ${queryKeyConst} }),`,
    `  });`,
    `}`,
    ``,
    `export function useUpdate${pascalName}(id: string) {`,
    `  const qc = useQueryClient();`,
    `  return useMutation({`,
    `    mutationFn: async (input: Update${pascalName}Input) => {`,
    `      const { data, error } = await supabase`,
    `        .from("${tableName}")`,
    `        .update(input)`,
    `        .eq("id", id)`,
    `        .select()`,
    `        .single();`,
    `      if (error) throw error;`,
    `      return data as ${pascalName}Row;`,
    `    },`,
    `    onSuccess: () => {`,
    `      qc.invalidateQueries({ queryKey: ${queryKeyConst} });`,
    `      qc.invalidateQueries({ queryKey: [...${queryKeyConst}, id] });`,
    `    },`,
    `  });`,
    `}`,
    ``,
    `export function useDelete${pascalName}() {`,
    `  const qc = useQueryClient();`,
    `  return useMutation({`,
    `    mutationFn: async (id: string) => {`,
    `      const { error } = await supabase.from("${tableName}").delete().eq("id", id);`,
    `      if (error) throw error;`,
    `    },`,
    `    onSuccess: () => qc.invalidateQueries({ queryKey: ${queryKeyConst} }),`,
    `  });`,
    `}`,
  ].join("\n");
}

function generateFirebaseHooksCode(tableName: string, pascalName: string): string {
  const queryKeyConst = `${toCamelCase(tableName).toUpperCase()}_QUERY_KEY`;
  return [
    `import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";`,
    `import {`,
    `  collection,`,
    `  doc,`,
    `  getDocs,`,
    `  getDoc,`,
    `  addDoc,`,
    `  updateDoc,`,
    `  deleteDoc,`,
    `} from "firebase/firestore";`,
    `import { db } from "@react-auth-client";`,
    `import type { ${pascalName}Row, Create${pascalName}Input, Update${pascalName}Input } from "./${pascalName}Types";`,
    ``,
    `const ${queryKeyConst} = ["${tableName}"] as const;`,
    `const col = () => collection(db, "${tableName}");`,
    `const ref = (id: string) => doc(db, "${tableName}", id);`,
    ``,
    `export function useList${pascalName}() {`,
    `  return useQuery({`,
    `    queryKey: ${queryKeyConst},`,
    `    queryFn: async () => {`,
    `      const snap = await getDocs(col());`,
    `      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ${pascalName}Row));`,
    `    },`,
    `  });`,
    `}`,
    ``,
    `export function useGet${pascalName}(id: string) {`,
    `  return useQuery({`,
    `    queryKey: [...${queryKeyConst}, id],`,
    `    queryFn: async () => {`,
    `      const snap = await getDoc(ref(id));`,
    `      if (!snap.exists()) throw new Error("Not found");`,
    `      return { id: snap.id, ...snap.data() } as ${pascalName}Row;`,
    `    },`,
    `    enabled: !!id,`,
    `  });`,
    `}`,
    ``,
    `export function useCreate${pascalName}() {`,
    `  const qc = useQueryClient();`,
    `  return useMutation({`,
    `    mutationFn: async (input: Create${pascalName}Input) => {`,
    `      const docRef = await addDoc(col(), input);`,
    `      return { id: docRef.id, ...input } as ${pascalName}Row;`,
    `    },`,
    `    onSuccess: () => qc.invalidateQueries({ queryKey: ${queryKeyConst} }),`,
    `  });`,
    `}`,
    ``,
    `export function useUpdate${pascalName}(id: string) {`,
    `  const qc = useQueryClient();`,
    `  return useMutation({`,
    `    mutationFn: async (input: Update${pascalName}Input) => {`,
    `      await updateDoc(ref(id), input as Record<string, unknown>);`,
    `      return { id, ...input } as ${pascalName}Row;`,
    `    },`,
    `    onSuccess: () => {`,
    `      qc.invalidateQueries({ queryKey: ${queryKeyConst} });`,
    `      qc.invalidateQueries({ queryKey: [...${queryKeyConst}, id] });`,
    `    },`,
    `  });`,
    `}`,
    ``,
    `export function useDelete${pascalName}() {`,
    `  const qc = useQueryClient();`,
    `  return useMutation({`,
    `    mutationFn: async (id: string) => {`,
    `      await deleteDoc(ref(id));`,
    `    },`,
    `    onSuccess: () => qc.invalidateQueries({ queryKey: ${queryKeyConst} }),`,
    `  });`,
    `}`,
  ].join("\n");
}

function generateRestHooksCode(tableName: string, pascalName: string): string {
  const queryKeyConst = `${toCamelCase(tableName).toUpperCase()}_QUERY_KEY`;
  return [
    `import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";`,
    `import type { ${pascalName}Row, Create${pascalName}Input, Update${pascalName}Input } from "./${pascalName}Types";`,
    ``,
    `const API_BASE = process.env.EXPO_PUBLIC_OPEN_API_SERVER_URL ?? "";`,
    `const ${queryKeyConst} = ["${tableName}"] as const;`,
    ``,
    `async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {`,
    `  const res = await fetch(\`\${API_BASE}\${path}\`, {`,
    `    headers: { "Content-Type": "application/json", ...init?.headers },`,
    `    ...init,`,
    `  });`,
    `  if (!res.ok) throw new Error(\`API error \${res.status}: \${await res.text()}\`);`,
    `  return res.json() as Promise<T>;`,
    `}`,
    ``,
    `export function useList${pascalName}() {`,
    `  return useQuery({`,
    `    queryKey: ${queryKeyConst},`,
    `    queryFn: () => apiFetch<${pascalName}Row[]>("/${tableName}"),`,
    `  });`,
    `}`,
    ``,
    `export function useGet${pascalName}(id: string) {`,
    `  return useQuery({`,
    `    queryKey: [...${queryKeyConst}, id],`,
    `    queryFn: () => apiFetch<${pascalName}Row>("/${tableName}/\${id}"),`,
    `    enabled: !!id,`,
    `  });`,
    `}`,
    ``,
    `export function useCreate${pascalName}() {`,
    `  const qc = useQueryClient();`,
    `  return useMutation({`,
    `    mutationFn: (input: Create${pascalName}Input) =>`,
    `      apiFetch<${pascalName}Row>("/${tableName}", {`,
    `        method: "POST",`,
    `        body: JSON.stringify(input),`,
    `      }),`,
    `    onSuccess: () => qc.invalidateQueries({ queryKey: ${queryKeyConst} }),`,
    `  });`,
    `}`,
    ``,
    `export function useUpdate${pascalName}(id: string) {`,
    `  const qc = useQueryClient();`,
    `  return useMutation({`,
    `    mutationFn: (input: Update${pascalName}Input) =>`,
    `      apiFetch<${pascalName}Row>("/${tableName}/\${id}", {`,
    `        method: "PATCH",`,
    `        body: JSON.stringify(input),`,
    `      }),`,
    `    onSuccess: () => {`,
    `      qc.invalidateQueries({ queryKey: ${queryKeyConst} });`,
    `      qc.invalidateQueries({ queryKey: [...${queryKeyConst}, id] });`,
    `    },`,
    `  });`,
    `}`,
    ``,
    `export function useDelete${pascalName}() {`,
    `  const qc = useQueryClient();`,
    `  return useMutation({`,
    `    mutationFn: (id: string) =>`,
    `      apiFetch<void>("/${tableName}/\${id}", { method: "DELETE" }),`,
    `    onSuccess: () => qc.invalidateQueries({ queryKey: ${queryKeyConst} }),`,
    `  });`,
    `}`,
  ].join("\n");
}

function generateHooksCode(
  tableName: string,
  pascalName: string,
  backend: BackendKind,
): string {
  if (backend === "firebase") return generateFirebaseHooksCode(tableName, pascalName);
  if (backend === "rest") return generateRestHooksCode(tableName, pascalName);
  return generateDatabaseHooksCode(tableName, pascalName);
}

function generateListScreenCode(
  tableName: string,
  pascalName: string,
  displayField: string,
): string {
  return [
    `import { YStack, Text, Spinner } from "tamagui";`,
    `import { FlashList } from "@shopify/flash-list";`,
    `import { router } from "expo-router";`,
    `import type { Href } from "expo-router";`,
    `import { ThrottledButton } from "@anicca-labs/ui-touchables";`,
    `import { IconButton } from "@anicca-labs/ui-button";`,
    `import { useList${pascalName} } from "./${pascalName}Hooks";`,
    ``,
    `export function ${pascalName}ListScreen() {`,
    `  const { data, isLoading, isError } = useList${pascalName}();`,
    ``,
    `  if (isLoading) return <Spinner size="large" />;`,
    `  if (isError)`,
    `    return (`,
    `      <Text color="$color-danger" textAlign="center" marginTop="$2xl">`,
    `        Failed to load`,
    `      </Text>`,
    `    );`,
    ``,
    `  return (`,
    `    <YStack flex={1}>`,
    `      <FlashList`,
    `        data={data ?? []}`,
    `        estimatedItemSize={56}`,
    `        keyExtractor={(item) => item.id}`,
    `        renderItem={({ item }) => (`,
    `          <ThrottledButton`,
    `            onPress={() => router.push(\`/${tableName}/\${item.id}\` as Href)}`,
    `            padding="$md"`,
    `            borderBottomWidth={1}`,
    `            borderBottomColor="$border-default"`,
    `          >`,
    `            <Text>{item.${displayField}}</Text>`,
    `          </ThrottledButton>`,
    `        )}`,
    `        ListEmptyComponent={`,
    `          <Text color="$text-secondary" textAlign="center" marginTop="$2xl">`,
    `            No ${tableName.replace(/_/g, " ")} found`,
    `          </Text>`,
    `        }`,
    `      />`,
    `      <YStack position="absolute" bottom="$xl" right="$xl">`,
    `        <IconButton`,
    `          buttonType="cta"`,
    `          icon={<Text color="$text-action" fontSize={28}>+</Text>}`,
    `          onPress={() => router.push("/${tableName}/new" as Href)}`,
    `        />`,
    `      </YStack>`,
    `    </YStack>`,
    `  );`,
    `}`,
  ].join("\n");
}

function generateDetailScreenCode(
  tableName: string,
  pascalName: string,
  includeForm: boolean,
): string {
  if (includeForm) {
    return [
      `import { YStack, Text, Spinner } from "tamagui";`,
      `import { Alert, ScrollView } from "react-native";`,
      `import { router, useLocalSearchParams } from "expo-router";`,
      `import { useGet${pascalName}, useUpdate${pascalName}, useDelete${pascalName} } from "./${pascalName}Hooks";`,
      `import { ${pascalName}Form } from "./${pascalName}Form";`,
      `import type { ${pascalName}FormValues } from "./${pascalName}Schema";`,
      `import { CTAButton } from "@anicca-labs/ui-button";`,
      ``,
      `export function ${pascalName}DetailScreen() {`,
      `  const { id } = useLocalSearchParams<{ id: string }>();`,
      `  const { data, isLoading } = useGet${pascalName}(id);`,
      `  const update = useUpdate${pascalName}(id);`,
      `  const remove = useDelete${pascalName}();`,
      ``,
      `  if (isLoading || !data) return <Spinner size="large" />;`,
      ``,
      `  const handleSubmit = async (values: ${pascalName}FormValues) => {`,
      `    await update.mutateAsync(values);`,
      `    router.back();`,
      `  };`,
      ``,
      `  const handleDelete = () =>`,
      `    Alert.alert("Delete", "Are you sure?", [`,
      `      { text: "Cancel", style: "cancel" },`,
      `      {`,
      `        text: "Delete",`,
      `        style: "destructive",`,
      `        onPress: async () => {`,
      `          await remove.mutateAsync(id);`,
      `          router.back();`,
      `        },`,
      `      },`,
      `    ]);`,
      ``,
      `  return (`,
      `    <ScrollView>`,
      `      <YStack padding="$md" gap="$md">`,
      `        <${pascalName}Form onSubmit={handleSubmit} defaultValues={data} />`,
      `        <CTAButton onPress={handleDelete} loading={remove.isPending}>`,
      `          Delete`,
      `        </CTAButton>`,
      `      </YStack>`,
      `    </ScrollView>`,
      `  );`,
      `}`,
    ].join("\n");
  }

  // Read-only view — no form dependency
  return [
    `import { YStack, Text, Spinner } from "tamagui";`,
    `import { Alert, ScrollView } from "react-native";`,
    `import { router, useLocalSearchParams } from "expo-router";`,
    `import { useGet${pascalName}, useDelete${pascalName} } from "./${pascalName}Hooks";`,
    `import type { ${pascalName}Row } from "./${pascalName}Types";`,
    `import { CTAButton } from "@anicca-labs/ui-button";`,
    ``,
    `export function ${pascalName}DetailScreen() {`,
    `  const { id } = useLocalSearchParams<{ id: string }>();`,
    `  const { data, isLoading } = useGet${pascalName}(id);`,
    `  const remove = useDelete${pascalName}();`,
    ``,
    `  if (isLoading || !data) return <Spinner size="large" />;`,
    ``,
    `  const handleDelete = () =>`,
    `    Alert.alert("Delete", "Are you sure?", [`,
    `      { text: "Cancel", style: "cancel" },`,
    `      {`,
    `        text: "Delete",`,
    `        style: "destructive",`,
    `        onPress: async () => {`,
    `          await remove.mutateAsync(id);`,
    `          router.back();`,
    `        },`,
    `      },`,
    `    ]);`,
    ``,
    `  return (`,
    `    <ScrollView>`,
    `      <YStack padding="$md" gap="$sm">`,
    `        {/* Read-only field display — replace fields or add edit actions as needed */}`,
    `        {(Object.keys(data) as Array<keyof ${pascalName}Row>).map((key) => (`,
    `          <YStack key={key as string} gap="$xs">`,
    `            <Text fontSize="$xs" color="$text-secondary" textTransform="uppercase" fontWeight="600">`,
    `              {key as string}`,
    `            </Text>`,
    `            <Text fontSize="$md">{String(data[key] ?? "—")}</Text>`,
    `          </YStack>`,
    `        ))}`,
    `        <CTAButton onPress={handleDelete} loading={remove.isPending}>`,
    `          Delete`,
    `        </CTAButton>`,
    `      </YStack>`,
    `    </ScrollView>`,
    `  );`,
    `}`,
  ].join("\n");
}

function generateCreateScreenCode(
  tableName: string,
  pascalName: string,
): string {
  return [
    `import React from "react";`,
    `import { ScrollView } from "react-native";`,
    `import { router } from "expo-router";`,
    `import { useCreate${pascalName} } from "./${pascalName}Hooks";`,
    `import { ${pascalName}Form } from "./${pascalName}Form";`,
    `import type { ${pascalName}FormValues } from "./${pascalName}Schema";`,
    ``,
    `export function ${pascalName}CreateScreen() {`,
    `  const create = useCreate${pascalName}();`,
    ``,
    `  const handleSubmit = async (values: ${pascalName}FormValues) => {`,
    `    await create.mutateAsync(values);`,
    `    router.back();`,
    `  };`,
    ``,
    `  return (`,
    `    <ScrollView contentContainerStyle={{ padding: 16 }}>`,
    `      <${pascalName}Form onSubmit={handleSubmit} />`,
    `    </ScrollView>`,
    `  );`,
    `}`,
  ].join("\n");
}

function generateRouteFiles(
  tableName: string,
  pascalName: string,
  routesDir: string,
  includeForm: boolean,
): RouteFile[] {
  const base = `${routesDir}/(app)/${tableName}`;
  const screens = `@screens`;

  const files: RouteFile[] = [
    {
      path: `${base}/index.tsx`,
      code: [
        `import { ${pascalName}ListScreen } from "${screens}";`,
        ``,
        `export default ${pascalName}ListScreen;`,
      ].join("\n"),
    },
    {
      path: `${base}/[id].tsx`,
      code: [
        `import { ${pascalName}DetailScreen } from "${screens}";`,
        ``,
        `export default ${pascalName}DetailScreen;`,
      ].join("\n"),
    },
  ];

  if (includeForm) {
    files.push({
      path: `${base}/new.tsx`,
      code: [
        `import { ${pascalName}CreateScreen } from "${screens}";`,
        ``,
        `export default ${pascalName}CreateScreen;`,
      ].join("\n"),
    });
  }

  return files;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function scaffoldCrud(
  options: ScaffoldCrudOptions,
): Promise<ScaffoldCrudResult> {
  const { tableName, projectRoot, omitAutoFields = true, includeForm = false } = options;
  const pascalName = toPascalCase(tableName);
  const config = await loadConfig(projectRoot);
  const backend = options.backend ?? config.backend;
  const screensDir = config.components.screens ?? "src/screens";
  const routesDir = config.routesDir;

  const { columns: allColumns, enums } = await getTableSchema(
    tableName,
    backend,
    config.database.schema ?? "public",
    config.schemaPath,
    projectRoot,
  );

  const writeColumns = omitAutoFields
    ? allColumns.filter((c) => !AUTO_FIELDS.has(c.column_name))
    : allColumns;

  const displayField = findDisplayField(allColumns);

  return {
    tableName,
    pascalName,
    screensDir,
    routesDir,
    includeForm,
    typesCode: generateTypesCode(tableName, pascalName, allColumns, writeColumns, enums),
    hooksCode: generateHooksCode(tableName, pascalName, backend),
    listScreenCode: generateListScreenCode(tableName, pascalName, displayField),
    detailScreenCode: generateDetailScreenCode(tableName, pascalName, includeForm),
    createScreenCode: includeForm ? generateCreateScreenCode(tableName, pascalName) : null,
    routeFiles: generateRouteFiles(tableName, pascalName, routesDir, includeForm),
  };
}

export function formatScaffoldCrudResult(result: ScaffoldCrudResult): string {
  const {
    tableName,
    pascalName,
    screensDir,
    includeForm,
    typesCode,
    hooksCode,
    listScreenCode,
    detailScreenCode,
    createScreenCode,
    routeFiles,
  } = result;

  const screenPath = `${screensDir}/${pascalName}Screen`;

  const routeBlocks = routeFiles
    .map((f) =>
      [
        `### \`${f.path}\``,
        ``,
        "```typescript",
        f.code,
        "```",
      ].join("\n"),
    )
    .join("\n\n");

  const createSection =
    createScreenCode !== null
      ? [
          `---`,
          ``,
          `## \`${pascalName}CreateScreen.tsx\``,
          ``,
          "```typescript",
          createScreenCode,
          "```",
          ``,
        ].join("\n")
      : "";

  const nextSteps = includeForm
    ? [
        `1. Run \`scaffold_form\` for \`${tableName}\` to generate \`${pascalName}Schema.ts\`, \`use${pascalName}Form.ts\`, and \`${pascalName}Form.tsx\``,
        `2. Place all files in \`${screenPath}/\``,
        `3. Export screens from \`${screensDir}/index.ts\``,
        `4. Add route files at the paths listed above`,
        `5. Verify the client import alias in the hooks file matches your project`,
      ]
    : [
        `1. Place all files in \`${screenPath}/\``,
        `2. Export screens from \`${screensDir}/index.ts\``,
        `3. Add route files at the paths listed above`,
        `4. Verify the client import alias in the hooks file matches your project`,
        `5. The detail screen is read-only. To add editing, run \`scaffold_form\` and set \`includeForm: true\` on this tool, or wire in your own edit UI`,
      ];

  return [
    `# CRUD Scaffold — \`${tableName}\``,
    ``,
    `> Generated for \`${tableName}\`. Copy files into \`${screenPath}/\`.`,
    ``,
    `---`,
    ``,
    `## \`${pascalName}Types.ts\``,
    ``,
    "```typescript",
    typesCode,
    "```",
    ``,
    `---`,
    ``,
    `## \`${pascalName}Hooks.ts\``,
    ``,
    "```typescript",
    hooksCode,
    "```",
    ``,
    `---`,
    ``,
    `## \`${pascalName}ListScreen.tsx\``,
    ``,
    "```typescript",
    listScreenCode,
    "```",
    ``,
    `---`,
    ``,
    `## \`${pascalName}DetailScreen.tsx\``,
    ``,
    "```typescript",
    detailScreenCode,
    "```",
    ``,
    createSection,
    `## Route files`,
    ``,
    routeBlocks,
    ``,
    `---`,
    ``,
    `## Next steps`,
    ``,
    ...nextSteps,
  ].join("\n");
}
