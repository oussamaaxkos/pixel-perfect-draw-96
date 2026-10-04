# OpsMind AI — Roadmap

## Phase 1 — Data layer
- [x] Business schema (customers, companies, products, orders, order_items, shipments, tickets, invoices, payments, employees)
- [x] Knowledge schema (documents, document_chunks with full-text index)
- [x] Ops schema (agent_runs, agent_steps, tool_calls, approvals, audit_logs, evaluation_*, model_configs, prompt_versions, tool_registry)
- [x] Seed synthetic data (500 customers, 1500 orders, 620 tickets, 120 products, 260 invoices, 9 policies, 32 eval cases)

## Phase 2 — Agent backend (server functions)
- [x] Tool registry + 14 tools (SQL/RAG/API/logic/write) with schemas, risk, permission
- [x] State machine: intent -> plan -> tools -> reason -> verify -> risk -> approval -> audit
- [x] Run/step/tool-call persistence, latency, tokens, cost
- [x] Approval execution + audit logging
- [x] Evaluation engine (retrieval + agent + system metrics)

## Phase 3 — Frontend
- [x] Design system + app shell (dark/light)
- [x] Dashboard, Copilot, Runs, Run detail, Approvals, Knowledge, Ingestion, Customers, Orders, Evaluation, Observability, Prompts, Models, Tools & MCP, Audit, Settings
- [x] SEO head metadata per route

## Phase 4 — Docs
- [x] README covering architecture, MCP exposure, Docker/CI notes

## Phase 5 — Adaptable company data
- [ ] Connect or import a company database
- [ ] Inspect and map each source schema without changing the source
- [ ] Configure company-specific topics, terminology, permissions, and policies
- [ ] Generate safe read-only tools for approved tables and fields
- [ ] Add connection management, schema refresh, and validation screens
