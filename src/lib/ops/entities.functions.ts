import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type ManifestTopic = { id: string; source_table: string; display_name: string; description: string };
type ManifestField = {
  topic_id: string;
  source_column: string;
  display_name: string;
  access_level: string;
};
type Manifest = { version: number; topics: ManifestTopic[]; fields: ManifestField[] };

async function loadActive(context: Parameters<typeof import("./source.server").requireAdmin>[0]) {
  const { requireAdmin } = await import("./source.server");
  try {
    await requireAdmin(context);
  } catch {
    return null;
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: source } = await supabaseAdmin
    .from("data_sources")
    .select("id, name")
    .eq("status", "active")
    .order("activated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!source) return null;
  const { data: activation } = await supabaseAdmin
    .from("source_activations")
    .select("mapping_manifest")
    .eq("source_id", source.id)
    .order("activated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!activation) return null;
  return { source, manifest: activation.mapping_manifest as unknown as Manifest };
}

/** Approved entities of the active company source (empty for non-admins). */
export const getActiveEntities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const active = await loadActive(context);
    if (!active) return null;
    return {
      sourceId: active.source.id,
      sourceName: active.source.name,
      entities: active.manifest.topics.map((t) => ({
        id: t.id,
        name: t.display_name || t.source_table,
        table: t.source_table,
      })),
    };
  });

export const getEntityRows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ topicId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const active = await loadActive(context);
    if (!active) throw new Error("Administrator access and an active data source are required.");
    const topic = active.manifest.topics.find((t) => t.id === data.topicId);
    if (!topic) throw new Error("This entity is not approved.");
    const columns = active.manifest.fields
      .filter((f) => f.topic_id === topic.id && f.access_level !== "excluded")
      .map((f) => ({ key: f.source_column, label: f.display_name || f.source_column }));
    const { loadCompanyTools } = await import("./company-tools.server");
    const { tools } = await loadCompanyTools(active.source.id);
    const tool = tools[0]!;
    const base = {
      topic: topic.source_table,
      group_by: null,
      measure: null,
      filter_field: null,
      filter_value: null,
    };
    const [rowsResult, countResult] = await Promise.all([
      tool.execute({ ...base, operation: "rows", limit: 50 }),
      tool.execute({ ...base, operation: "count", limit: 1 }),
    ]);
    const rows = (rowsResult as { rows: Record<string, unknown>[] }).rows;
    const count = (countResult as { rows: { value: number | null }[] }).rows[0]?.value ?? null;
    return {
      name: topic.display_name || topic.source_table,
      description: topic.description,
      sourceName: active.source.name,
      columns,
      count,
      rows: rows.map((r) =>
        Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? null : String(v)])),
      ),
    };
  });
