import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowUp, BarChart3, FileText, Loader2, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/ops/app-shell";
import {
  EmptyState,
  Metric,
  PageHeader,
  Panel,
  RiskBadge,
  StatusBadge,
  fmtNumber,
} from "@/components/ops/primitives";
import { runCompanyInvestigation, runInvestigation } from "@/lib/ops/agent.functions";
import { supabase } from "@/integrations/supabase/client";
import { runQuery } from "@/lib/ops/client-queries";
import { chartableFromToolCalls } from "@/lib/ops/chartable";
import { ResultChart } from "@/components/ops/result-chart";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";

export const Route = createFileRoute("/copilot")({
  head: () => ({
    meta: [
      { title: "AI Copilot | OpsMind AI" },
      {
        name: "description",
        content:
          "Ask the operations agent to investigate orders, shipments, invoices and policies with cited evidence and risk-aware actions.",
      },
      { property: "og:title", content: "AI Copilot | OpsMind AI" },
      {
        property: "og:description",
        content:
          "Agentic investigation with live tool tracing, citations and human approval routing.",
      },
    ],
  }),
  component: Copilot,
});

const EXAMPLES = [
  "Why is order #40291 delayed and what compensation is the customer entitled to?",
  "Customer CUS-00042 is asking for a refund on a late delivery. What should we do?",
  "Summarise the refund eligibility rules for damaged goods.",
  "How many orders are currently delayed and which segments are most affected?",
];

interface Turn {
  role: "user" | "agent";
  text: string;
  runId?: string;
}

function Copilot() {
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const invoke = useServerFn(runInvestigation);
  const invokeCompany = useServerFn(runCompanyInvestigation);
  const qc = useQueryClient();

  const [showChartFor, setShowChartFor] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<{ id: string; name: string } | null>(null);

  useState(() => {
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: source } = await supabase.from("data_sources").select("id, name").eq("status", "active").maybeSingle();
      if (source) setActiveSource(source);
    });
    return null;
  });

  const detail = useQuery({ ...runQuery(activeRunId ?? ""), enabled: Boolean(activeRunId) });
  const run = detail.data?.run;
  const citations = (run?.citations ?? []) as any[];
  const chartSeries = chartableFromToolCalls((detail.data?.tools ?? []) as any[]);

  async function submit(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setTurns((t) => [...t, { role: "user", text }]);
    setInput("");
    try {
      const result = activeSource
        ? await invokeCompany({ data: { request: text, actor: "admin", actorRole: "admin", sourceId: activeSource.id } })
        : await invoke({ data: { request: text, actor: "marta.rossi", actorRole: "operator" } });
      setActiveRunId(result.run_id);
      const fresh = await qc.fetchQuery(runQuery(result.run_id));
      setTurns((t) => [
        ...t,
        {
          role: "agent",
          text: fresh.run?.final_response ?? result.error ?? "The run did not return a response.",
          runId: result.run_id,
        },
      ]);
      qc.invalidateQueries({ queryKey: ["agent_runs"] });
      qc.invalidateQueries({ queryKey: ["run_metrics"] });
      qc.invalidateQueries({ queryKey: ["approvals"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The investigation failed.");
      setTurns((t) => [...t, { role: "agent", text: "The investigation could not be completed." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="AI Copilot"
        subtitle={activeSource ? `Using reviewed read-only data from ${activeSource.name}.` : "The agent plans, queries operational records, retrieves policy evidence, verifies its own claims and routes sensitive actions to a human."}
      />

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Panel
          className="flex min-h-[560px] flex-col"
          title="Investigation"
          description="Operations conversation"
        >
          <div className="flex-1 space-y-4">
            {turns.length === 0 ? (
              <div className="space-y-3">
                <EmptyState
                  title="Start an investigation"
                  hint="The agent only answers from retrieved records and indexed policy."
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  {EXAMPLES.map((e) => (
                    <button
                      key={e}
                      onClick={() => submit(e)}
                      className="rounded-md border border-border bg-surface-2 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              turns.map((t, i) => (
                <Message key={i} from={t.role === "agent" ? "assistant" : "user"}>
                  <MessageContent
                    className={
                      t.role === "user"
                        ? "max-w-[85%] bg-primary px-3 py-2 text-primary-foreground"
                        : "w-full max-w-[92%]"
                    }
                  >
                    {t.role === "agent" ? (
                      <MessageResponse className="text-sm leading-6">{t.text}</MessageResponse>
                    ) : (
                      <p className="whitespace-pre-wrap">{t.text}</p>
                    )}
                    {t.runId && t.runId === activeRunId && chartSeries.length ? (
                      <div className="mt-3 space-y-3">
                        <button
                          onClick={() =>
                            setShowChartFor(showChartFor === t.runId ? null : (t.runId ?? null))
                          }
                          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:border-primary/50 hover:text-primary"
                        >
                          <BarChart3 className="h-3.5 w-3.5" />
                          {showChartFor === t.runId ? "Hide visualisation" : "Visualise results"}
                        </button>
                        {showChartFor === t.runId
                          ? chartSeries.map((s, idx) => <ResultChart key={idx} series={s} />)
                          : null}
                      </div>
                    ) : null}
                    {t.runId ? (
                      <Link
                        to="/runs/$runId"
                        params={{ runId: t.runId }}
                        className="mt-2 inline-block text-xs text-primary hover:underline"
                      >
                        Open full trace
                      </Link>
                    ) : null}
                  </MessageContent>
                </Message>
              ))
            )}
            {busy ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Investigating: planning, tools,
                verification…
              </div>
            ) : null}
          </div>

          <form
            className="mt-4 flex items-end gap-2 border-t border-border pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit(input);
                }
              }}
              rows={2}
              placeholder="Ask about an order, invoice, ticket or policy…"
              className="min-h-[52px] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              aria-label="Send request"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </form>
        </Panel>

        <div className="space-y-4">
          <Panel title="Agent activity" description="Live state machine trace">
            {detail.data?.steps.length ? (
              <ol className="space-y-2">
                {detail.data.steps.map((s: any) => (
                  <li
                    key={s.id}
                    className="flex items-start gap-2 rounded-md border border-border bg-surface-2 px-3 py-2"
                  >
                    <span
                      className={
                        s.status === "failed"
                          ? "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-destructive"
                          : s.status === "pending"
                            ? "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-warning"
                            : "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-success"
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium">{s.label}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {s.node} · {fmtNumber(s.duration_ms)} ms
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState title="No active run" hint="Steps appear here as the agent works." />
            )}
          </Panel>

          {run ? (
            <Panel title="Run summary">
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Confidence" value={`${Math.round((run.confidence ?? 0) * 100)}%`} />
                <Metric label="Latency" value={`${fmtNumber(run.latency_ms)} ms`} />
                <Metric label="Tool calls" value={fmtNumber(run.tool_call_count)} />
                <Metric
                  label="Tokens"
                  value={fmtNumber((run.input_tokens ?? 0) + (run.output_tokens ?? 0))}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <RiskBadge risk={run.risk_level} />
                <StatusBadge status={run.verification_status ?? "unknown"} />
                {run.approval_required ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs text-warning">
                    <ShieldAlert className="h-3 w-3" /> Awaiting human approval
                  </span>
                ) : null}
              </div>
              {run.reasoning_summary ? (
                <p className="mt-3 text-xs text-muted-foreground">{run.reasoning_summary}</p>
              ) : null}
            </Panel>
          ) : null}

          <Panel title="Sources" description="Policy evidence used in this answer">
            {citations.length ? (
              <ul className="space-y-2">
                {citations.map((c, i) => (
                  <li key={i} className="rounded-md border border-border bg-surface-2 p-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      <p className="text-xs font-medium">{c.document}</p>
                    </div>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {c.section} · {c.version} · score {c.score}
                    </p>
                    <p className="mt-2 line-clamp-4 text-xs text-muted-foreground">{c.excerpt}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No sources yet"
                hint="Policy questions retrieve indexed document chunks."
              />
            )}
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}
