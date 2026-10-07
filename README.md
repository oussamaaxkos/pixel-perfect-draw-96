# OpsMind AI — Agentic Enterprise Operations Platform

OpsMind AI turns a manual customer-operations investigation into an agentic, observable and
measurable workflow: the agent plans, queries operational records, retrieves policy evidence,
verifies its own claims, scores risk, and routes sensitive actions to a human before anything
is executed.

All customer, order, ticket and invoice data in this environment is **synthetic**.

## Adaptable company data

The protected **Data Sources** workspace accepts read-only Neon or Supabase PostgreSQL links and CSV/Excel imports. Discovery records tables and fields as a versioned snapshot; nothing is available to the agent until the configured Google administrator enables topics, classifies fields as safe, masked, or excluded, and activates that exact review version.

Company investigations use one generated `query_company_data` tool. It accepts only approved topic and field names and a small set of operations (rows, count, sum, average). Live databases run parameterized statements inside read-only transactions; imports use the same validation and output shape. Arbitrary model-written SQL is never accepted. Activation replaces the previous source atomically and every run records its source ID and mapping version.

## Architecture

```text
Browser (TanStack Start / React 19)
  └── server functions (typed RPC, server-only)
        ├── agent.server.ts     state machine orchestrator
        ├── tools.server.ts     tool registry (schema + permission + risk)
        ├── gateway.server.ts   provider-agnostic LLM interface
        └── evaluation.functions.ts  benchmark engine
              └── Postgres (business data, knowledge index, run telemetry, audit)
```

### Agent state machine

```text
request → intent classification → planning → tool loop (SQL | RAG | API | logic)
        → reasoning → evidence verification → risk engine
        → human approval (HIGH/CRITICAL) or auto action → audit log
```

Every node writes an `agent_steps` row; every tool invocation writes a `tool_calls` row with
input, output, status, duration, risk and permission level; every run records latency, tokens
and estimated cost. The run trace page replays all of it.

### Grounding rules

- Policy statements may only cite chunks actually returned by `search_knowledge_base`.
- The verification node strips citations that do not match retrieved evidence and fails the run
  when a policy claim has no supporting chunk; confidence is then capped.
- When a record or policy section is missing, the answer is exactly
  `Insufficient evidence to determine this.`

### Risk and human-in-the-loop

| Risk         | Handling                                       |
| ------------ | ---------------------------------------------- |
| LOW / MEDIUM | executed immediately, audited                  |
| HIGH         | approval required (emails, refunds above €250) |
| CRITICAL     | approval required (refunds above €1,000)       |

`issue_refund` and `create_email_draft` never execute inside the agent loop: calling them only
records a proposed action for a manager.

### RBAC

Roles are `viewer < operator < manager < admin`. Each tool declares the minimum role; the
registry refuses execution below it and records a `denied` tool call.

## MCP compatibility

Each tool is declared once as a named contract: JSON-schema input, typed result, category,
permission level, risk level and approval requirement. That is exactly the shape the Model
Context Protocol expects, so exposing the registry over an MCP server is a transport change —
`TOOLS` in `src/lib/ops/tools.server.ts` becomes the `tools/list` response and the existing
guarded `execute` entry point backs `tools/call`. Validation, permission checks, risk gating
and audit logging stay untouched. The **Tools & MCP** page renders the live contracts.

## Evaluation

A golden dataset of 32 cases spans retrieval, reasoning, refusal behaviour, risk routing and
tool selection. A benchmark run measures:

- retrieval: recall@5, precision@5, MRR, citation accuracy
- agent: task success, intent match, tool-selection accuracy, groundedness, unnecessary tool rate
- system: average and p95 latency, tokens, estimated cost

Runs execute in small batches so a long benchmark never exceeds one request budget; aggregates
are recomputed after each batch.

## Observability and audit

The observability page charts run volume, latency trend, cost per day, tool volume, approval
rate and grounding failures. The audit log records every run, tool execution and human decision
with actor, role, risk, status and latency, filterable by actor, risk and status.

## Model and prompt management

Models and system prompts are database rows, not code. Activating a different model or prompt
version takes effect on the next run with no deploy. The gateway layer is provider-agnostic, so
adding a provider means adding a row and, if needed, a request adapter.

## Local development

```bash
bun install
bun run dev     # http://localhost:8080
bunx tsgo --noEmit
```

Server-side environment variables: the AI gateway key and database credentials. Nothing secret
is exposed to the browser.

## Docker and CI notes

The app builds to a standard Node/edge server bundle, so a deployment image is a two-stage
build:

```dockerfile
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=build /app/.output ./.output
ENV PORT=8080
CMD ["bun", "run", ".output/server/index.mjs"]
```

A CI pipeline should run, in order: install → typecheck (`tsgo --noEmit`) → lint → build →
evaluation benchmark against the golden dataset, failing the build when task success or
groundedness regresses below the agreed threshold. Database changes ship as ordered SQL
migrations applied before the new image is promoted.
