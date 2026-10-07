import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { TableDiscovery } from "./source.server";

export const getDataSourceSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { requireAdmin } = await import("./source.server");
    const { data: identity, error: identityError } = await context.supabase.auth.getUser();
    const allowedEmail = process.env["OPSMIND_ADMIN_EMAIL"];
    if (!identityError && identity.user?.email?.toLowerCase() === allowedEmail?.toLowerCase() && identity.user?.email_confirmed_at) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("user_roles").upsert({ user_id: context.userId, role: "admin" }, { onConflict: "user_id,role" });
      if (error) throw new Error("Could not verify administrator access.");
    }
    const claimed = false;
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
    const { requireAdmin, discoverPostgres, encryptCredential, validateConnectionUrl, persistDiscovery, decryptCredential } = await import("./source.server");
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
    const { requireAdmin, discoverPostgres, encryptCredential, validateConnectionUrl, persistDiscovery, decryptCredential } = await import("./source.server");
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
    const { requireAdmin, discoverPostgres, encryptCredential, validateConnectionUrl, persistDiscovery, decryptCredential } = await import("./source.server");
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
    const { requireAdmin, discoverPostgres, encryptCredential, validateConnectionUrl, persistDiscovery, decryptCredential } = await import("./source.server");
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
    const { requireAdmin, discoverPostgres, encryptCredential, validateConnectionUrl, persistDiscovery, decryptCredential } = await import("./source.server");
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: source } = await supabaseAdmin.from("data_sources").select("id, encrypted_credentials, credential_iv, source_type").eq("id", data.sourceId).maybeSingle();
    if (!source) throw new Error("Data source not found.");
    const { data: snapshot } = await supabaseAdmin.from("schema_snapshots").select("id, version").eq("source_id", source.id).order("version", { ascending: false }).limit(1).maybeSingle();
    const { data: topics } = await supabaseAdmin.from("source_topics").select("id, source_schema, source_table, display_name, description").eq("source_id", source.id).eq("snapshot_id", snapshot?.id ?? "00000000-0000-0000-0000-000000000000").eq("enabled", true);
    if (!snapshot || !topics?.length) throw new Error("Enable at least one topic before activation.");
    const topicIds = topics.map((topic) => topic.id);
    const { data: fields } = await supabaseAdmin.from("source_fields").select("topic_id, source_column, display_name, data_type, semantic_type, access_level").in("topic_id", topicIds).neq("access_level", "excluded");
    if (!fields?.length) throw new Error("Approve at least one field before activation.");
    if (source.encrypted_credentials && source.credential_iv) {
      const connectionString = await decryptCredential(source.encrypted_credentials, source.credential_iv);
      await discoverPostgres(connectionString, ["public"]);
    }
    const manifest = { version: snapshot.version, topics, fields };
    const { error: activationError } = await context.supabase.rpc("activate_reviewed_source", { _source_id: source.id, _snapshot_id: snapshot.id, _manifest: manifest });
    if (activationError) throw new Error(activationError.message);
    await supabaseAdmin.from("audit_logs").insert({ actor: context.userId, actor_role: "admin", event_type: "source_activated", action: source.id, status: "success", metadata: { snapshot_version: snapshot.version, topics: topics.length, fields: fields.length } });
    return { ok: true };
  });

export const refreshDataSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sourceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { requireAdmin, discoverPostgres, encryptCredential, validateConnectionUrl, persistDiscovery, decryptCredential } = await import("./source.server");
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: source } = await supabaseAdmin.from("data_sources").select("encrypted_credentials, credential_iv, connection_config").eq("id", data.sourceId).maybeSingle();
    if (!source?.encrypted_credentials || !source.credential_iv) throw new Error("File imports cannot be refreshed; upload a new version instead.");
    const config = source.connection_config as { schemas?: string[] };
    const tables = await discoverPostgres(await decryptCredential(source.encrypted_credentials, source.credential_iv), config.schemas ?? ["public"]);
    return persistDiscovery(data.sourceId, tables, context.userId);
  });