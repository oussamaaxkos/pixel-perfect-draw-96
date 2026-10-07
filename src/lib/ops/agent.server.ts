// Agent orchestration: an explicit state machine (LangGraph-equivalent) with
// deterministic nodes. Every node writes a step record, every tool invocation
// writes a tool_call record, and every run writes audit entries.
//
//   intent -> planner -> tool loop (sql | rag | api) -> reasoning
//          -> verification -> risk engine -> approval | auto action -> audit
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { chatCompletion, GatewayError, type ChatMessage } from "./gateway.server";
import { TOOLS, canExecute } from "./tools.server";
import type { Citation, EvidenceItem, PermissionLevel, ProposedAction, RiskLevel } from "./types";

const RISK_RANK: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };
const MAX_TOOL_ITERATIONS = 6;

interface ModelConfig {
  model_id: string;
  temperature: number;
  max_output_tokens: number;
  input_cost_per_1k: number;
  output_cost_per_1k: number;
}

interface StepRecord {
  node: string;
  label: string;
  status: string;
  detail: Record<string, unknown>;
  started_offset_ms: number;
  duration_ms: number;
  error?: string | null;
}

function safeJson(text: string | null): any | null {
  if (!text) return null;
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function loadConfig() {
  const [{ data: model }, { data: prompt }] = await Promise.all([
    supabaseAdmin
      .from("model_configs")
      .select("model_id, temperature, max_output_tokens, input_cost_per_1k, output_cost_per_1k")
      .eq("is_active", true)
      .eq("available", true)
      .maybeSingle(),
    supabaseAdmin
      .from("prompt_versions")
      .select("name, version, content")
      .eq("name", "Customer Investigation")
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  const modelConfig: ModelConfig = model ?? {
    model_id: "google/gemini-3.8-flash",
    temperature: 0.2,
    max_output_tokens: 2000,
    input_cost_per_1k: 0.00015,
    output_cost_per_1k: 0.0006,
  };
  return {
    model: modelConfig,
    promptVersion: prompt?.version ?? "v3",
    systemPrompt:
      prompt?.content ??
      "You are OpsMind, an enterprise operations agent. Use only the provided tools for evidence.",
  };
}

const OUTPUT_CONTRACT = `
Return ONLY a JSON object with this exact shape:
{
  "final_response": "a concise Markdown answer for the operations employee, or a customer-ready draft when asked",
  "reasoning_summary": "2-4 sentences describing which evidence drove the conclusion. No hidden chain-of-thought.",
  "confidence": 0.0,
  "insufficient_evidence": false,
  "citations": [{"document":"", "section":"", "version":"", "effective_date":"", "excerpt":""}],
  "proposed_actions": [{"action_type":"issue_refund|create_email_draft|create_ticket|none","summary":"","justification":"","risk_level":"LOW|MEDIUM|HIGH|CRITICAL","amount":null}]
}
Rules: cite only documents returned by search_knowledge_base. Never invent policy text, amounts, delivery dates or section numbers.
Format final_response as readable Markdown. Use short headings and bullet lists for multi-part answers, and a Markdown table when comparing categories or reporting a useful breakdown. Do not add a heading for a one-sentence answer.
Use insufficient_evidence ONLY when the tools returned no usable data at all. If the tools returned numbers or records,
you MUST report them, even partially: state what the data shows and name explicitly what could not be determined.
Analytics questions (counts, breakdowns, rankings) do not require policy citations; report the figures from query_database.`;

export interface RunAgentInput {
  request: string;
  actor?: string;
  actorRole?: PermissionLevel;
  evalRunId?: string | null;
  sourceId?: string | undefined;
}

export async function runAgent(input: RunAgentInput) {
  const started = Date.now();
  const actor = input.actor ?? "demo.operator";
  const actorRole: PermissionLevel = input.actorRole ?? "operator";
  const { model, promptVersion, systemPrompt } = await loadConfig();
  const company = input.sourceId ? await (await import("./company-tools.server")).loadCompanyTools(input.sourceId) : null;
  const activeTools = company?.tools ?? TOOLS;
  const activeToolMap = new Map(activeTools.map((tool) => [tool.name, tool]));
  const schemasForModel = () => activeTools.map((tool) => ({ type: "function" as const, function: { name: tool.name, description: `${tool.description} [risk: ${tool.risk_level}]`, parameters: tool.parameters } }));

  const { data: run, error: runError } = await supabaseAdmin
    .from("agent_runs")
    .insert({
      request: input.request,
      actor,
      actor_role: actorRole,
      status: "running",
      model: model.model_id,
      prompt_version: promptVersion,
      eval_run_id: input.evalRunId ?? null,
      source_id: input.sourceId ?? null,
    })
    .select("id, run_number")
    .single();
  if (runError || !run) throw new Error(runError?.message ?? "Could not start the run.");

  const steps: StepRecord[] = [];
  const toolCallRows: any[] = [];
  const citations: Citation[] = [];
  const evidence: EvidenceItem[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let documentsRetrieved = 0;
  const usedTools: string[] = [];
  const mark = () => Date.now() - started;

  const finish = async (patch: Record<string, unknown>) => {
    if (steps.length) {
      await supabaseAdmin
        .from("agent_steps")
        .insert(steps.map((s, i) => ({ run_id: run.id, step_index: i, ...s, detail: s.detail as any })));
    }
    if (toolCallRows.length) {
      await supabaseAdmin.from("tool_calls").insert(toolCallRows.map((t) => ({ run_id: run.id, ...t })));
    }
    const cost =
      (inputTokens / 1000) * Number(model.input_cost_per_1k) +
      (outputTokens / 1000) * Number(model.output_cost_per_1k);
    const { data: updated } = await supabaseAdmin
      .from("agent_runs")
      .update({
        ...patch,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        estimated_cost: Number(cost.toFixed(5)),
        tool_call_count: toolCallRows.length,
        documents_retrieved: documentsRetrieved,
        citations: citations as unknown as any,
        evidence: evidence as unknown as any,
        latency_ms: Date.now() - started,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id)
      .select("*")
      .single();
    return updated;
  };

  try {
    /* ---------------- Node 1: intent classification + planning ---------------- */
    const planStart = mark();
    const planner = await chatCompletion({
      model: model.model_id,
      temperature: 0,
      maxTokens: 500,
      messages: [
        {
          role: "system",
          content:
            "You classify enterprise operations requests and plan the investigation. Respond with JSON only: " +
            '{"intent":"snake_case_intent","entities":{"order_number":null,"customer_code":null,"invoice_number":null,"ticket_number":null},"plan":["step 1","step 2"]}. ' +
            `Available tools: ${activeTools.map((t) => t.name).join(", ")}.`,
        },
        { role: "user", content: input.request },
      ],
    });
    inputTokens += planner.usage.prompt_tokens;
    outputTokens += planner.usage.completion_tokens;
    const planJson = safeJson(planner.message.content) ?? {};
    const intent: string = planJson.intent ?? "general_request";
    const entities = planJson.entities ?? {};
    const plan: string[] = Array.isArray(planJson.plan) ? planJson.plan.slice(0, 8) : [];

    steps.push({
      node: "intent_classifier",
      label: "Intent classification",
      status: "completed",
      detail: { intent, entities },
      started_offset_ms: planStart,
      duration_ms: mark() - planStart,
    });
    steps.push({
      node: "planner",
      label: "Planner",
      status: "completed",
      detail: { plan },
      started_offset_ms: mark(),
      duration_ms: 0,
    });

    /* ---------------- Node 2: tool loop ---------------- */
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: `${systemPrompt}\n${company?.context ?? ""}

Detected intent: ${intent}
Investigation plan: ${plan.join(" -> ") || "not specified"}

Investigation order (operations runbook): order record, shipment record, ticket history, then policy.
Use search_knowledge_base before stating any policy rule. Use calculate_compensation for any monetary amount.
You may only set insufficient_evidence to true after you have actually called search_knowledge_base and the
returned chunks do not cover the question. Never declare insufficient evidence without having searched policy.
If the records show the situation does not qualify (for example a shipment delivered with zero delay days),
that is a grounded answer: state it with citations instead of declaring insufficient evidence.
HIGH and CRITICAL tools (create_email_draft, issue_refund) never execute: calling them only records a proposed action for human approval.
When the investigation is complete, stop calling tools and reply with the JSON contract below.
${OUTPUT_CONTRACT}`,
      },
      { role: "user", content: input.request },
    ];

    let finalContent: string | null = null;
    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const completion = await chatCompletion({
        model: model.model_id,
        messages,
        tools: schemasForModel(),
        temperature: Number(model.temperature),
        maxTokens: model.max_output_tokens,
      });
      inputTokens += completion.usage.prompt_tokens;
      outputTokens += completion.usage.completion_tokens;

      const calls = completion.message.tool_calls ?? [];
      if (!calls.length) {
        finalContent = completion.message.content;
        break;
      }

      messages.push({ role: "assistant", content: completion.message.content, tool_calls: calls });

      for (const call of calls) {
        const toolStart = mark();
        const tool = activeToolMap.get(call.function.name);
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = {};
        }

        let output: unknown;
        let status = "success";
        let error: string | null = null;

        if (!tool) {
          status = "failed";
          error = `Unknown tool ${call.function.name}`;
          output = { error };
        } else if (!canExecute(tool, actorRole)) {
          status = "denied";
          error = `Role ${actorRole} is not permitted to run ${tool.name} (requires ${tool.permission_level}).`;
          output = { error, permission_denied: true };
        } else if (tool.requires_approval) {
          status = "queued_for_approval";
          output = { queued_for_approval: true, note: "Recorded as a proposed action for human approval." };
        } else {
          try {
            output = await tool.execute(args as any);
          } catch (e) {
            status = "failed";
            error = e instanceof Error ? e.message : String(e);
            output = { error };
          }
        }

        if (tool?.name === "search_knowledge_base" && (output as any)?.chunks) {
          for (const chunk of (output as any).chunks as Citation[] & any[]) {
            documentsRetrieved += 1;
            if (!citations.find((c) => c.document === chunk.document && c.section === chunk.section)) {
              citations.push({
                document: chunk.document,
                section: chunk.section,
                version: chunk.version,
                effective_date: chunk.effective_date,
                excerpt: chunk.excerpt,
                score: chunk.score,
              });
            }
          }
        }
        if (status === "success" && tool && tool.category !== "rag") {
          evidence.push({
            kind: tool.category === "logic" ? "computation" : "record",
            label: `${tool.name}(${Object.values(args).filter(Boolean).slice(0, 2).join(", ")})`,
            source: tool.category,
            detail: JSON.stringify(output).slice(0, 400),
          });
        }

        usedTools.push(call.function.name);
        toolCallRows.push({
          tool_name: call.function.name,
          input: args,
          output: output as any,
          status,
          risk_level: tool?.risk_level ?? "LOW",
          permission_level: tool?.permission_level ?? "operator",
          error,
          duration_ms: mark() - toolStart,
        });
        steps.push({
          node: tool?.category === "rag" ? "rag_agent" : tool?.category === "sql" ? "sql_agent" : "api_agent",
          label: `Tool: ${call.function.name}`,
          status: status === "success" ? "completed" : status,
          detail: { input: args, output_preview: JSON.stringify(output).slice(0, 600) },
          started_offset_ms: toolStart,
          duration_ms: mark() - toolStart,
          error,
        });

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.function.name,
          content: JSON.stringify(output).slice(0, 6000),
        });
      }
    }

    /* ------ Guard: never answer a policy question without retrieval ------ */
    if (documentsRetrieved === 0) {
      const ragTool = activeToolMap.get("search_knowledge_base");
      if (ragTool) {
        const ragStart = mark();
        let ragOutput: unknown;
        let ragStatus = "success";
        let ragError: string | null = null;
        const ragArgs = { query: input.request, department: null, top_k: 6 };
        try {
          ragOutput = await ragTool.execute(ragArgs as any);
        } catch (e) {
          ragStatus = "failed";
          ragError = e instanceof Error ? e.message : String(e);
          ragOutput = { error: ragError };
        }

        for (const chunk of ((ragOutput as any)?.chunks ?? []) as Citation[]) {
          documentsRetrieved += 1;
          if (!citations.find((c) => c.document === chunk.document && c.section === chunk.section)) {
            citations.push(chunk);
          }
        }

        usedTools.push("search_knowledge_base");
        toolCallRows.push({
          tool_name: "search_knowledge_base",
          input: ragArgs,
          output: ragOutput as any,
          status: ragStatus,
          risk_level: ragTool.risk_level,
          permission_level: ragTool.permission_level,
          error: ragError,
          duration_ms: mark() - ragStart,
        });
        steps.push({
          node: "rag_agent",
          label: "Mandatory policy retrieval",
          status: ragStatus === "success" ? "completed" : ragStatus,
          detail: { input: ragArgs, output_preview: JSON.stringify(ragOutput).slice(0, 600) },
          started_offset_ms: ragStart,
          duration_ms: mark() - ragStart,
          error: ragError,
        });

        if (documentsRetrieved > 0) {
          // Force a fresh answer that takes the retrieved policy into account.
          finalContent = null;
          messages.push({
            role: "user",
            content: `Policy evidence retrieved on your behalf (you did not search it):\n${JSON.stringify(
              ragOutput,
            ).slice(0, 6000)}\n\nAnswer now using the records you already gathered plus this policy evidence. ${OUTPUT_CONTRACT}`,
          });
        }
      }
    }



    /* ---------------- Node 3: reasoning output ---------------- */
    if (!finalContent) {
      const wrap = await chatCompletion({
        model: model.model_id,
        messages: [...messages, { role: "user", content: `Stop investigating and answer now. ${OUTPUT_CONTRACT}` }],
        temperature: 0,
        maxTokens: model.max_output_tokens,
      });
      inputTokens += wrap.usage.prompt_tokens;
      outputTokens += wrap.usage.completion_tokens;
      finalContent = wrap.message.content;
    }

    const reasonStart = mark();
    const parsed = safeJson(finalContent) ?? {};
    const insufficient = parsed.insufficient_evidence === true;
    const finalResponse: string = insufficient
      ? "Insufficient evidence to determine this."
      : (parsed.final_response ?? finalContent ?? "Insufficient evidence to determine this.");
    const reasoningSummary: string = parsed.reasoning_summary ?? "";
    let confidence = Number(parsed.confidence);
    if (!Number.isFinite(confidence)) confidence = 0.5;
    confidence = Math.max(0, Math.min(1, confidence));

    steps.push({
      node: "reasoning",
      label: "Reasoning over evidence",
      status: "completed",
      detail: { tools_used: usedTools, documents_retrieved: documentsRetrieved },
      started_offset_ms: reasonStart,
      duration_ms: mark() - reasonStart,
    });

    /* ---------------- Node 4: verification ---------------- */
    const verifyStart = mark();
    const modelCitations: Citation[] = Array.isArray(parsed.citations) ? parsed.citations : [];
    const retrievedKeys = new Set(citations.map((c) => `${c.document}|${c.section}`.toLowerCase()));
    const unsupported = modelCitations.filter(
      (c) => !retrievedKeys.has(`${c.document}|${c.section}`.toLowerCase()),
    );
    const policyClaim = /polic|section|clause|entitle|qualif/i.test(finalResponse);
    let verificationStatus = "passed";
    const notes: string[] = [];
    if (unsupported.length) {
      verificationStatus = "failed";
      notes.push(`${unsupported.length} citation(s) do not match retrieved evidence and were removed.`);
    }
    if (policyClaim && citations.length === 0 && !insufficient) {
      verificationStatus = "failed";
      notes.push("A policy claim was made without any retrieved policy evidence.");
    }
    if (insufficient) {
      verificationStatus = "passed";
      notes.push("Agent correctly declared insufficient evidence.");
    }
    if (verificationStatus === "failed") confidence = Math.min(confidence, 0.4);

    steps.push({
      node: "verification",
      label: "Evidence verification",
      status: verificationStatus === "passed" ? "completed" : "failed",
      detail: { grounded_citations: citations.length, unsupported_citations: unsupported.length, notes },
      started_offset_ms: verifyStart,
      duration_ms: mark() - verifyStart,
    });

    /* ---------------- Node 5: risk engine ---------------- */
    const riskStart = mark();
    const rawActions: ProposedAction[] = Array.isArray(parsed.proposed_actions)
      ? parsed.proposed_actions.filter((a: any) => a && a.action_type && a.action_type !== "none")
      : [];
    const proposedActions: ProposedAction[] = rawActions.map((a) => {
      const tool = activeToolMap.get(a.action_type);
      let risk: RiskLevel = (["LOW", "MEDIUM", "HIGH", "CRITICAL"] as RiskLevel[]).includes(a.risk_level)
        ? a.risk_level
        : "MEDIUM";
      if (tool && RISK_RANK[tool.risk_level] > RISK_RANK[risk]) risk = tool.risk_level;
      const amount = typeof a.amount === "number" ? a.amount : null;
      if (amount !== null && amount > 1000) risk = "CRITICAL";
      else if (amount !== null && amount > 250 && RISK_RANK[risk] < RISK_RANK.HIGH) risk = "HIGH";
      return { ...a, risk_level: risk, amount };
    });

    let runRisk: RiskLevel = "LOW";
    for (const a of proposedActions) if (RISK_RANK[a.risk_level] > RISK_RANK[runRisk]) runRisk = a.risk_level;
    for (const name of usedTools) {
      const t = activeToolMap.get(name);
      if (t && RISK_RANK[t.risk_level] > RISK_RANK[runRisk]) runRisk = t.risk_level;
    }
    if (verificationStatus === "failed" && RISK_RANK[runRisk] < RISK_RANK.MEDIUM) runRisk = "MEDIUM";

    const approvalRequired = proposedActions.some((a) => RISK_RANK[a.risk_level] >= RISK_RANK.HIGH);
    steps.push({
      node: "risk_engine",
      label: "Risk assessment",
      status: "completed",
      detail: { risk_level: runRisk, approval_required: approvalRequired, actions: proposedActions.length },
      started_offset_ms: riskStart,
      duration_ms: mark() - riskStart,
    });

    /* ---------------- Node 6: approval routing / auto action ---------------- */
    const approvalStart = mark();
    if (approvalRequired) {
      const rows = proposedActions
        .filter((a) => RISK_RANK[a.risk_level] >= RISK_RANK.HIGH)
        .map((a) => ({
          run_id: run.id,
          action_type: a.action_type,
          action_payload: (a.payload ?? {}) as any,
          summary: a.summary,
          justification: a.justification,
          evidence: citations as unknown as any,
          risk_level: a.risk_level,
          amount: a.amount ?? null,
          status: "pending",
        }));
      if (rows.length) await supabaseAdmin.from("approvals").insert(rows);
    }
    steps.push({
      node: approvalRequired ? "human_approval" : "auto_action",
      label: approvalRequired ? "Routed for human approval" : "Auto-completed (low risk)",
      status: approvalRequired ? "pending" : "completed",
      detail: { actions: proposedActions },
      started_offset_ms: approvalStart,
      duration_ms: mark() - approvalStart,
    });

    /* ---------------- Node 7: audit ---------------- */
    steps.push({
      node: "audit_log",
      label: "Audit log written",
      status: "completed",
      detail: { tools: usedTools, citations: citations.length },
      started_offset_ms: mark(),
      duration_ms: 0,
    });

    const updated = await finish({
      intent,
      entities: entities as any,
      plan: plan as any,
      reasoning_summary: reasoningSummary,
      final_response: finalResponse,
      confidence,
      risk_level: runRisk,
      verification_status: verificationStatus,
      verification_notes: notes.join(" "),
      approval_required: approvalRequired,
      approval_status: approvalRequired ? "pending" : "not_required",
      status: "completed",
    });

    await supabaseAdmin.from("audit_logs").insert({
      run_id: run.id,
      actor,
      actor_role: actorRole,
      event_type: "agent_run",
      agent: "investigation_agent",
      tool: usedTools.join(", ") || null,
      action: approvalRequired ? "approval_requested" : "response_prepared",
      status: verificationStatus === "passed" ? "success" : "flagged",
      risk_level: runRisk,
      model: model.model_id,
      prompt_version: promptVersion,
      latency_ms: Date.now() - started,
      metadata: { intent, documents_retrieved: documentsRetrieved, tool_calls: toolCallRows.length } as any,
    });

    return { run: updated, run_id: run.id };
  } catch (e) {
    const message =
      e instanceof GatewayError ? e.message : e instanceof Error ? e.message : "Unexpected agent failure.";
    steps.push({
      node: "error",
      label: "Run failed",
      status: "failed",
      detail: {},
      started_offset_ms: mark(),
      duration_ms: 0,
      error: message,
    });
    const updated = await finish({
      status: "failed",
      error: message,
      final_response: null,
      risk_level: "LOW",
      verification_status: "not_run",
    });
    await supabaseAdmin.from("audit_logs").insert({
      run_id: run.id,
      actor,
      actor_role: actorRole,
      event_type: "agent_run",
      agent: "investigation_agent",
      action: "run_failed",
      status: "failure",
      model: model.model_id,
      prompt_version: promptVersion,
      latency_ms: Date.now() - started,
      metadata: { error: message } as any,
    });
    return { run: updated, run_id: run.id, error: message };
  }
}
