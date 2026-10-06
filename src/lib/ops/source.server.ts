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

export async function requireAdmin(context: {
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

export async function encryptCredential(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(value),
  );
  return { encrypted: bytesToBase64(new Uint8Array(encrypted)), iv: bytesToBase64(iv) };
}

export async function decryptCredential(encrypted: string, iv: string) {
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(iv) },
    await encryptionKey(),
    base64ToBytes(encrypted),
  );
  return new TextDecoder().decode(decrypted);
}

export function validateConnectionUrl(value: string) {
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

export async function discoverPostgres(connectionString: string, schemas: string[]) {
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

export async function persistDiscovery(
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

