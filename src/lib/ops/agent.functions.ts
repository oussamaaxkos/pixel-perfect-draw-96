import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ------------------------- Run the agent ------------------------- */

const RunInput = z.object({
  request: z.string().min(4).max(2000),
  actor: z.string().max(80).optional(),
  actorRole: z.enum(["viewer", "operator", "manager", "admin"]).optional(),
  sourceId: z.string().uuid().optional(),
});

export const runInvestigation = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RunInput.parse(input))
  .handler(async ({ data }) => {
    const { runAgent } = await import("./agent.server");
    const result = await runAgent({
      request: data.request,
      actor: data.actor ?? "demo.operator",
      actorRole: data.actorRole ?? "operator",
      sourceId: data.sourceId,
    });
    return { run_id: result.run_id, error: result.error ?? null };
  });

export const runCompanyInvestigation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RunInput.extend({ sourceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { requireAdmin } = await import("./source.server");
    await requireAdmin(context);
    const { runAgent } = await import("./agent.server");
    const result = await runAgent({ request: data.request, actor: context.userId, actorRole: "admin", sourceId: data.sourceId });
    return { run_id: result.run_id, error: result.error ?? null };
  });

/* ------------------------- Approvals ------------------------- */

const DecisionInput = z.object({
  approvalId: z.string().uuid(),
  decision: z.enum(["approved", "rejected", "changes_requested"]),
  note: z.string().max(1000).optional(),
  decidedBy: z.string().max(80).optional(),
});

export const decideApproval = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DecisionInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: approval } = await supabaseAdmin
      .from("approvals")
      .select("*")
      .eq("id", data.approvalId)
      .maybeSingle();
    if (!approval) throw new Error("Approval request not found.");
    if (approval.status !== "pending") throw new Error("This request has already been decided.");

    const decidedBy = data.decidedBy ?? "demo.manager";
    await supabaseAdmin
      .from("approvals")
      .update({
        status: data.decision,
        decided_by: decidedBy,
        decision_note: data.note ?? null,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.approvalId);

    let executed = false;
    let executionNote = "No action executed.";
    if (data.decision === "approved") {
      // Action execution layer. Externally visible effects are simulated in this
      // demo environment but recorded exactly as a real execution would be.
      if (approval.action_type === "issue_refund") {
        executionNote = `Refund of ${approval.amount ?? 0} ${approval.currency ?? "EUR"} booked against the order.`;
        executed = true;
      } else if (approval.action_type === "create_email_draft") {
        executionNote = "Customer email released to the outbound queue.";
        executed = true;
      } else {
        executionNote = `Action ${approval.action_type} executed.`;
        executed = true;
      }
    }

    const { data: pending } = await supabaseAdmin
      .from("approvals")
      .select("id")
      .eq("run_id", approval.run_id)
      .eq("status", "pending");

    await supabaseAdmin
      .from("agent_runs")
      .update({ approval_status: (pending?.length ?? 0) > 0 ? "pending" : data.decision })
      .eq("id", approval.run_id);

    await supabaseAdmin.from("audit_logs").insert({
      run_id: approval.run_id,
      actor: decidedBy,
      actor_role: "manager",
      event_type: "approval_decision",
      agent: "human",
      action: `${approval.action_type}:${data.decision}`,
      status: executed ? "success" : "recorded",
      risk_level: approval.risk_level,
      metadata: { note: data.note ?? null, execution: executionNote, amount: approval.amount } as any,
    });

    return { ok: true, executed, executionNote };
  });

/* ------------------------- Governance ------------------------- */

export const activatePromptVersion = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin
      .from("prompt_versions")
      .select("id, name, version")
      .eq("id", data.id)
      .maybeSingle();
    if (!target) throw new Error("Prompt version not found.");
    await supabaseAdmin.from("prompt_versions").update({ is_active: false }).eq("name", target.name);
    await supabaseAdmin.from("prompt_versions").update({ is_active: true }).eq("id", data.id);
    await supabaseAdmin.from("audit_logs").insert({
      actor: "demo.admin",
      actor_role: "admin",
      event_type: "prompt_activated",
      action: `${target.name} ${target.version}`,
      status: "success",
      prompt_version: target.version,
    });
    return { ok: true };
  });

export const activateModel = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin
      .from("model_configs")
      .select("id, model_id, available")
      .eq("id", data.id)
      .maybeSingle();
    if (!target) throw new Error("Model not found.");
    if (!target.available) throw new Error("This model has no provider credentials in this environment.");
    await supabaseAdmin.from("model_configs").update({ is_active: false }).neq("id", data.id);
    await supabaseAdmin.from("model_configs").update({ is_active: true }).eq("id", data.id);
    await supabaseAdmin.from("audit_logs").insert({
      actor: "demo.admin",
      actor_role: "admin",
      event_type: "model_activated",
      action: target.model_id,
      status: "success",
      model: target.model_id,
    });
    return { ok: true };
  });

/* ------------------------- Ingestion ------------------------- */

const IngestInput = z.object({
  title: z.string().min(3).max(160),
  department: z.string().min(2).max(60),
  document_type: z.string().min(2).max(40),
  version: z.string().max(20).default("v1.0"),
  author: z.string().max(80).default("Operations"),
  tags: z.string().max(200).optional(),
  content: z.string().min(40).max(60000),
  source_format: z.string().max(10).default("txt"),
});

export const ingestDocument = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => IngestInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Validate -> parse -> clean -> chunk -> metadata -> index
    const cleaned = data.content.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
    const paragraphs = cleaned.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
    const chunks: { section: string; content: string }[] = [];
    let buffer = "";
    let heading = "Section 1";
    for (const p of paragraphs) {
      const headingMatch = p.match(/^(#+\s*)?((Section|Chapter|Part)\s+[\w.]+[^\n]{0,80})$/i);
      if (headingMatch) {
        if (buffer.trim()) chunks.push({ section: heading, content: buffer.trim() });
        heading = headingMatch[2]!.trim();
        buffer = "";
        continue;
      }
      if ((buffer + p).length > 900) {
        chunks.push({ section: heading, content: buffer.trim() });
        buffer = p;
      } else {
        buffer += (buffer ? "\n\n" : "") + p;
      }
    }
    if (buffer.trim()) chunks.push({ section: heading, content: buffer.trim() });
    if (!chunks.length) throw new Error("The document produced no indexable content.");

    const { data: doc, error } = await supabaseAdmin
      .from("documents")
      .insert({
        title: data.title,
        department: data.department,
        document_type: data.document_type,
        version: data.version,
        author: data.author,
        tags: data.tags ? data.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        source_format: data.source_format,
        status: "indexed",
        chunk_count: chunks.length,
      })
      .select("id")
      .single();
    if (error || !doc) throw new Error(error?.message ?? "Could not store the document.");

    await supabaseAdmin.from("document_chunks").insert(
      chunks.map((c, i) => ({
        document_id: doc.id,
        chunk_index: i + 1,
        section: c.section,
        content: c.content,
        token_estimate: Math.round(c.content.length / 4),
      })),
    );

    await supabaseAdmin.from("audit_logs").insert({
      actor: "demo.admin",
      actor_role: "admin",
      event_type: "document_ingested",
      action: data.title,
      status: "success",
      metadata: { chunks: chunks.length } as any,
    });

    return { ok: true, document_id: doc.id, chunks: chunks.length };
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("documents").delete().eq("id", data.id);
    return { ok: true };
  });
