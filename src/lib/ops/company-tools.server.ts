import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptCredential, validateConnectionUrl } from "./source.server";
import { queryImportedRows, validateApprovedQuery, type ApprovedField } from "./source-query";
import type { ToolDefinition } from "./tools.server";

type Topic = {
  id: string;
  source_schema: string;
  source_table: string;
  display_name: string;
  description: string;
};
type Field = ApprovedField & { topic_id: string; display_name: string; data_type: string };
type Manifest = { version: number; topics: Topic[]; fields: Field[] };

export async function loadCompanyTools(sourceId: string) {
  const { data: source, error } = await supabaseAdmin
    .from("data_sources")
    .select("id, name, workspace_id, status, source_type, encrypted_credentials, credential_iv")
    .eq("id", sourceId)
    .eq("status", "active")
    .maybeSingle();
  if (error || !source) throw new Error("No active approved company source is available.");
  const { data: activation } = await supabaseAdmin
    .from("source_activations")
    .select("mapping_manifest")
    .eq("source_id", source.id)
    .order("activated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!activation) throw new Error("This source has not been approved.");
  const manifest = activation.mapping_manifest as unknown as Manifest;
  const { data: workspace } = await supabaseAdmin
    .from("company_workspaces")
    .select("name, business_context")
    .eq("id", source.workspace_id)
    .single();
  const tools: ToolDefinition[] = [
    {
      name: "query_company_data",
      description: `Read-only queries over approved company topics. Topics and fields: ${JSON.stringify(manifest.topics.map((topic) => ({ topic: topic.source_table, description: topic.description, fields: manifest.fields.filter((field) => field.topic_id === topic.id).map((field) => ({ name: field.source_column, meaning: field.semantic_type, access: field.access_level })) })))}`,
      category: "sql",
      permission_level: "operator",
      risk_level: "LOW",
      requires_approval: false,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          topic: { type: "string", description: "Approved topic table name" },
          operation: { type: "string", enum: ["rows", "count", "sum", "average"] },
          group_by: { type: ["string", "null"] },
          measure: { type: ["string", "null"] },
          filter_field: { type: ["string", "null"] },
          filter_value: { type: ["string", "number", "boolean", "null"] },
          limit: { type: "integer", minimum: 1, maximum: 50 },
        },
        required: [
          "topic",
          "operation",
          "group_by",
          "measure",
          "filter_field",
          "filter_value",
          "limit",
        ],
      },
      execute: async (input: unknown) => {
        const initial = input as { topic?: string };
        const topic = manifest.topics.find(
          (candidate) => candidate.source_table === initial.topic || candidate.id === initial.topic,
        );
        if (!topic) throw new Error("This topic is not approved.");
        const fields = manifest.fields.filter((field) => field.topic_id === topic.id);
        const query = validateApprovedQuery(input, fields);
        let rows: Record<string, unknown>[];
        if (["csv", "xlsx"].includes(source.source_type)) {
          const allRows: Record<string, unknown>[] = [];
          for (let offset = 0; offset < 5000; offset += 1000) {
            const { data, error: rowsError } = await supabaseAdmin
              .from("imported_rows")
              .select("row_data")
              .eq("source_id", source.id)
              .eq("topic_name", topic.source_table)
              .order("row_index")
              .range(offset, offset + 999);
            if (rowsError) throw new Error(rowsError.message);
            allRows.push(...(data ?? []).map((row) => row.row_data as Record<string, unknown>));
            if ((data?.length ?? 0) < 1000) break;
          }
          rows = queryImportedRows(allRows, query, fields);
        } else {
          if (!source.encrypted_credentials || !source.credential_iv)
            throw new Error("Connection credentials are unavailable.");
          const connectionString = await decryptCredential(
            source.encrypted_credentials,
            source.credential_iv,
          );
          validateConnectionUrl(connectionString);
          const { default: postgres } = await import("postgres");
          const sql = postgres(connectionString, {
            max: 1,
            prepare: false,
            ssl: "require",
            connect_timeout: 10,
            idle_timeout: 5,
          });
          try {
            rows = await sql.begin("read only", async (tx) => {
              await tx`SET LOCAL statement_timeout = '8000ms'`;
              const table = tx(`${topic.source_schema}.${topic.source_table}`);
              const where = query.filter_field
                ? tx`WHERE ${tx(query.filter_field)} = ${query.filter_value ?? null}`
                : tx``;
              if (query.operation === "rows") {
                const columns = fields
                  .filter((field) => field.access_level === "safe")
                  .map((field) => field.source_column);
                if (!columns.length) throw new Error("No readable fields are approved.");
                const result =
                  await tx`SELECT ${tx(columns)} FROM ${table} ${where} LIMIT ${query.limit}`;
                return result.map((row) => ({
                  ...row,
                  ...Object.fromEntries(
                    fields
                      .filter((field) => field.access_level === "masked")
                      .map((field) => [field.source_column, "[masked]"]),
                  ),
                }));
              }
              const metric =
                query.operation === "count"
                  ? tx`count(*)`
                  : query.operation === "sum"
                    ? tx`sum(${tx(query.measure ?? "")})`
                    : tx`avg(${tx(query.measure ?? "")})`;
              const group = query.group_by ? tx(query.group_by) : tx`'All records'`;
              const groupClause = query.group_by
                ? tx`GROUP BY ${tx(query.group_by)} ORDER BY value DESC`
                : tx``;
              const result =
                await tx`SELECT ${group} AS category, ${metric} AS value FROM ${table} ${where} ${groupClause} LIMIT ${query.limit}`;
              return result.map((row) => ({
                category: String(row["category"]),
                value: row["value"] === null ? null : Number(row["value"]),
              }));
            });
          } finally {
            await sql.end({ timeout: 2 });
          }
        }
        return {
          source_id: source.id,
          source: source.name,
          mapping_version: manifest.version,
          topic: topic.source_table,
          rows,
        };
      },
    },
  ];
  return {
    tools,
    context: `Active company: ${workspace?.name ?? source.name}. ${workspace?.business_context ?? ""}\nUse ONLY approved company topics. Do not apply synthetic demo policies, compensation rules, customer codes, or write actions. All source queries are read-only. Company-specific policies must be supplied in the business context; never substitute demo policy evidence. Mapping version: ${manifest.version}.`,
  };
}
