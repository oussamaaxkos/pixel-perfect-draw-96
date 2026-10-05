import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type ColumnDiscovery = {
  name: string;
  data_type: string;
  nullable: boolean;
};

type TableDiscovery = {
  schema: string;
  name: string;
  kind: string;
  columns: ColumnDiscovery[];
};

async function requireAdmin(context: {
  userId: string;
  supabase: {
    rpc: (name: "has_role", args: { _user_id: string; _role: "admin" }) => PromiseLike<{ data: unknown; error: unknown }>;
  };
}) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || data !== true) throw new Error("Administrator access is required.");
}

function titleCase(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function semanticType(name: string, dataType: string) {
  const lower = name.toLowerCase();
  if (/(^id$|_id$|code$|number$|uuid)/.test(lower)) return "identifier";
  if (/(date|time|_at$)/.test(lower) || /date|time/.test(dataType)) return "date";
  if (/(amount|price|total|count|qty|quantity|value|score|rate)/.test(lower)) return "measure";
  if (/(status|state|stage|priority|category|type)/.test(lower)) return "status";
  return "attribute";
}

function suggestedAccess(name: string) {
  const lower = name.toLowerCase();
  if (/(password|secret|token|key|credential|ssn|national_id)/.test(lower)) return "excluded";
  if (/(email|phone|address|full_name|first_name|last_name|birth)/.test(lower)) return "masked";
  return "safe";
}

async function encryptionKey() {
  const raw = process.env["DATA_SOURCE_ENCRYPTION_KEY"];
  if (!raw) throw new Error("Data source encryption is not configured.");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(raw).slice(0, 32),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encryptCredential(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(value),
  );
  return { encrypted: bytesToBase64(new Uint8Array(encrypted)), iv: bytesToBase64(iv) };
}

async function decryptCredential(encrypted: string, iv: string) {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(iv) },
    await encryptionKey(),
    base64ToBytes(encrypted),
  );
  return new TextDecoder().decode(decrypted);
}

function validateConnectionUrl(value: string) {
  const url = new URL(value);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("Use a PostgreSQL connection string.");
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local") ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new Error("Private network database addresses are not supported.");
  }
  if (!url.username || !url.password) throw new Error("The connection string must include a user and password.");
  return url;
}

async function discoverPostgres(connectionString: string, schemas: string[]) {
  validateConnectionUrl(connectionString);
  const postgresModule = await import("postgres");
  const sql = postgresModule.default(connectionString, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
    prepare: false,
  });
  try {
    const [role] = await sql<{ rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean }[]>`
      SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user
    `;
    const writeGrants = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM information_schema.role_table_grants
      WHERE grantee = current_user
        AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER')
    `;
    if (role?.rolsuper || role?.rolcreatedb || role?.rolcreaterole || Number(writeGrants[0]?.count ?? 0) > 0) {
      throw new Error("Use a read-only database user without write or administration privileges.");
    }
    const rows = await sql<{
      table_schema: string;
      table_name: string;
      table_type: string;
      column_name: string;
      data_type: string;
      is_nullable: string;
    }[]>`
      SELECT t.table_schema, t.table_name, t.table_type, c.column_name, c.data_type, c.is_nullable
      FROM information_schema.tables t
      JOIN information_schema.columns c
        ON c.table_schema = t.table_schema AND c.table_name = t.table_name
      WHERE t.table_schema = ANY(${schemas})
        AND t.table_type IN ('BASE TABLE', 'VIEW')
      ORDER BY t.table_schema, t.table_name, c.ordinal_position
      LIMIT 5000
    `;
    const tables = new Map<string, TableDiscovery>();
    for (const row of rows) {
      const key = `${row.table_schema}.${row.table_name}`;
      const table = tables.get(key) ?? {
        schema: row.table_schema,
        name: row.table_name,
        kind: row.table_type,
        columns: [],
      };
      table.columns.push({
        name: row.column_name,
        data_type: row.data_type,
        nullable: row.is_nullable === "YES",
      });
      tables.set(key, table);
    }
    if (!tables.size) throw new Error("No readable tables were found in the selected schemas.");
    return [...tables.values()];
  } finally {
    await sql.end({ timeout: 2 });
  }
}

async function persistDiscovery(
  sourceId: string,
  tables: TableDiscovery[],
  adminId: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: prior } = await supabaseAdmin
    .from("schema_snapshots")
    .select("version, schema_data")
    .eq("source_id", sourceId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const previousTables = new Set(
    ((prior?.schema_data as { tables?: TableDiscovery[] } | null)?.tables ?? []).map(
      (table) => `${table.schema}.${table.name}`,
    ),
  );
  const nextTables = new Set(tables.map((table) => `${table.schema}.${table.name}`));
  const diff = {
    added: [...nextTables].filter((name) => !previousTables.has(name)),
    removed: [...previousTables].filter((name) => !nextTables.has(name)),
  };
  const { data: snapshot, error } = await supabaseAdmin
    .from("schema_snapshots")
    .insert({
      source_id: sourceId,
      version: (prior?.version ?? 0) + 1,
      schema_data: { tables },
      diff_summary: diff,
    })
    .select("id, version")
    .single();
  if (error || !snapshot) throw new Error(error?.message ?? "Could not save schema discovery.");

  const { data: topics, error: topicsError } = await supabaseAdmin
    .from("source_topics")
    .insert(
      tables.map((table) => ({
        source_id: sourceId,
        snapshot_id: snapshot.id,
        source_schema: table.schema,
        source_table: table.name,
        display_name: titleCase(table.name),
        description: `Records discovered in ${table.schema}.${table.name}`,
        enabled: false,
      })),
    )
    .select("id, source_schema, source_table");
  if (topicsError) throw new Error(topicsError.message);
  const topicMap = new Map((topics ?? []).map((topic) => [`${topic.source_schema}.${topic.source_table}`, topic.id]));
  const fields = tables.flatMap((table) => {
    const topicId = topicMap.get(`${table.schema}.${table.name}`);
    if (!topicId) return [];
    return table.columns.map((column) => ({
      topic_id: topicId,
      source_column: column.name,
      display_name: titleCase(column.name),
      data_type: column.data_type,
      semantic_type: semanticType(column.name, column.data_type),
      access_level: suggestedAccess(column.name),
      description: "",
    }));
  });
  if (fields.length) {
    const { error: fieldsError } = await supabaseAdmin.from("source_fields").insert(fields);
    if (fieldsError) throw new Error(fieldsError.message);
  }
  await supabaseAdmin
    .from("data_sources")
    .update({
      status: "review_required",
      last_discovered_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sourceId);
  await supabaseAdmin.from("audit_logs").insert({
    actor: adminId,
    actor_role: "admin",
    event_type: "source_discovered",
    action: sourceId,
    status: "success",
    metadata: { snapshot_version: snapshot.version, tables: tables.length, diff },
  });
  return { snapshotId: snapshot.id, version: snapshot.version, tableCount: tables.length };
}

export const getDataSourceSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: claimed } = await context.supabase.rpc("claim_first_admin");
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: workspaces }, { data: sources }, { data: snapshots }, { data: topics }, { data: fields }] =
      await Promise.all([
        supabaseAdmin.from("company_workspaces").select("*").order("created_at"),
        supabaseAdmin
          .from("data_sources")
          .select("id, workspace_id, name, source_type, status, connection_config, last_error, last_discovered_at, activated_at, created_at")
          .order("created_at", { ascending: false }),
        supabaseAdmin.from("schema_snapshots").select("id, source_id, version, diff_summary, created_at").order("version", { ascending: false }),
        supabaseAdmin.from("source_topics").select("*").order("display_name"),
        supabaseAdmin.from("source_fields").select("*").order("source_column"),
      ]);
    return {
      claimedFirstAdmin: claimed === true,
      userId: context.userId,
      workspaces: workspaces ?? [],
      sources: sources ?? [],
      snapshots: snapshots ?? [],
      topics: topics ?? [],
      fields: fields ?? [],
    };
  });

const ConnectInput = z.object({
  companyName: z.string().min(2).max(120),
  sourceName: z.string().min(2).max(120),
  sourceType: z.enum(["neon", "supabase"]),
  connectionString: z.string().min(20).max(2000),
  schemas: z.array(z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/)).min(1).max(10),
});

export const connectPostgresSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ConnectInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const tables = await discoverPostgres(data.connectionString, data.schemas);
    const credential = await encryptCredential(data.connectionString);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let { data: workspace } = await supabaseAdmin.from("company_workspaces").select("id").eq("status", "active").maybeSingle();
    if (!workspace) {
      const created = await supabaseAdmin
        .from("company_workspaces")
        .insert({ name: data.companyName, created_by: context.userId })
        .select("id")
        .single();
      if (created.error || !created.data) throw new Error(created.error?.message ?? "Could not create company workspace.");
      workspace = created.data;
    }
    const { data: source, error } = await supabaseAdmin
      .from("data_sources")
      .insert({
        workspace_id: workspace.id,
        name: data.sourceName,
        source_type: data.sourceType,
        status: "discovered",
        connection_config: { schemas: data.schemas, host: validateConnectionUrl(data.connectionString).hostname },
        encrypted_credentials: credential.encrypted,
        credential_iv: credential.iv,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !source) throw new Error(error?.message ?? "Could not save the data source.");
    return { sourceId: source.id, ...(await persistDiscovery(source.id, tables, context.userId)) };
  });

const ImportInput = z.object({
  companyName: z.string().min(2).max(120),
  sourceName: z.string().min(2).max(120),
  fileName: z.string().min(1).max(200),
  sheets: z.array(
    z.object({
      name: z.string().min(1).max(120),
      rows: z.array(z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]))).max(5000),
    }),
  ).min(1).max(20),
});

export const importFileSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ImportInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const extension = data.fileName.toLowerCase().endsWith(".csv") ? "csv" : "xlsx";
    const tables: TableDiscovery[] = data.sheets.map((sheet) => {
      const names = [...new Set(sheet.rows.flatMap((row) => Object.keys(row)))];
      return {
        schema: "import",
        name: sheet.name,
        kind: "IMPORTED FILE",
        columns: names.map((name) => {
          const sample = sheet.rows.map((row) => row[name]).find((value) => value !== null && value !== undefined);
          return { name, data_type: typeof sample, nullable: sheet.rows.some((row) => row[name] == null) };
        }),
      };
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let { data: workspace } = await supabaseAdmin.from("company_workspaces").select("id").eq("status", "active").maybeSingle();
    if (!workspace) {
      const created = await supabaseAdmin.from("company_workspaces").insert({ name: data.companyName, created_by: context.userId }).select("id").single();
      if (created.error || !created.data) throw new Error(created.error?.message ?? "Could not create company workspace.");
      workspace = created.data;
    }
    const totalRows = data.sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
    const { data: source, error } = await supabaseAdmin.from("data_sources").insert({
      workspace_id: workspace.id,
      name: data.sourceName,
      source_type: extension,
      status: "discovered",
      connection_config: { file_name: data.fileName, sheets: data.sheets.map((sheet) => sheet.name), row_count: totalRows },
      created_by: context.userId,
    }).select("id").single();
    if (error || !source) throw new Error(error?.message ?? "Could not save the imported source.");
    const rows = data.sheets.flatMap((sheet) => sheet.rows.map((row, index) => ({
      source_id: source.id,
      topic_name: sheet.name,
      row_index: index + 1,
      row_data: row,
    })));
    if (rows.length) {
      const { error: rowsError } = await supabaseAdmin.from("imported_rows").insert(rows);
      if (rowsError) throw new Error(rowsError.message);
    }
    return { sourceId: source.id, rows: totalRows, ...(await persistDiscovery(source.id, tables, context.userId)) };
  });

const FieldInput = z.object({
  fieldId: z.string().uuid(),
  accessLevel: z.enum(["safe", "masked", "excluded"]),
  semanticType: z.enum(["identifier", "attribute", "measure", "date", "status"]),
  displayName: z.string().min(1).max(120),
});

export const updateSourceField = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FieldInput.parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("source_fields").update({
      access_level: data.accessLevel,
      semantic_type: data.semanticType,
      display_name: data.displayName,
    }).eq("id", data.fieldId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateSourceTopic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ topicId: z.string().uuid(), enabled: z.boolean(), displayName: z.string().min(1).max(120), description: z.string().max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("source_topics").update({ enabled: data.enabled, display_name: data.displayName, description: data.description }).eq("id", data.topicId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const activateDataSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sourceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: source } = await supabaseAdmin.from("data_sources").select("id, encrypted_credentials, credential_iv, source_type").eq("id", data.sourceId).maybeSingle();
    if (!source) throw new Error("Data source not found.");
    const { data: snapshot } = await supabaseAdmin.from("schema_snapshots").select("id, version").eq("source_id", source.id).order("version", { ascending: false }).limit(1).maybeSingle();
    const { data: topics } = await supabaseAdmin.from("source_topics").select("id, source_schema, source_table, display_name, description").eq("source_id", source.id).eq("enabled", true);
    if (!snapshot || !topics?.length) throw new Error("Enable at least one topic before activation.");
    const topicIds = topics.map((topic) => topic.id);
    const { data: fields } = await supabaseAdmin.from("source_fields").select("topic_id, source_column, display_name, data_type, semantic_type, access_level").in("topic_id", topicIds).neq("access_level", "excluded");
    if (!fields?.length) throw new Error("Approve at least one field before activation.");
    if (source.encrypted_credentials && source.credential_iv) {
      const connectionString = await decryptCredential(source.encrypted_credentials, source.credential_iv);
      await discoverPostgres(connectionString, ["public"]);
    }
    const manifest = { version: snapshot.version, topics, fields };
    await supabaseAdmin.from("data_sources").update({ status: "review_required" }).eq("status", "active");
    await supabaseAdmin.from("data_sources").update({ status: "active", activated_at: new Date().toISOString() }).eq("id", source.id);
    await supabaseAdmin.from("source_activations").insert({ source_id: source.id, snapshot_id: snapshot.id, mapping_manifest: manifest, activated_by: context.userId });
    await supabaseAdmin.from("audit_logs").insert({ actor: context.userId, actor_role: "admin", event_type: "source_activated", action: source.id, status: "success", metadata: { snapshot_version: snapshot.version, topics: topics.length, fields: fields.length } });
    return { ok: true };
  });

export const refreshDataSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sourceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: source } = await supabaseAdmin.from("data_sources").select("encrypted_credentials, credential_iv, connection_config").eq("id", data.sourceId).maybeSingle();
    if (!source?.encrypted_credentials || !source.credential_iv) throw new Error("File imports cannot be refreshed; upload a new version instead.");
    const config = source.connection_config as { schemas?: string[] };
    const tables = await discoverPostgres(await decryptCredential(source.encrypted_credentials, source.credential_iv), config.schemas ?? ["public"]);
    return persistDiscovery(data.sourceId, tables, context.userId);
  });