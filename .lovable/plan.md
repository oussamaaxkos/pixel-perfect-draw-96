# Adaptable company data with administrator review

## Goal
Let one company at a time connect a Neon or Supabase PostgreSQL database, or upload CSV/Excel files. OpsMind will inspect the source, propose topics and field mappings, and keep every new field unavailable to the agent until an administrator reviews and activates it.

## Administrator access
- Add managed Google sign-in and a protected administrator area.
- Store roles in a dedicated `user_roles` table and verify the admin role on the server for every connection, review, activation, refresh, and removal action.
- Replace the demo user badge with the signed-in administrator and provide sign-out.
- Keep the existing operational screens public for now; all source credentials and company setup screens are protected.

## Company data model
- Add records for the active company, data sources, schema snapshots, topic mappings, field governance, imported datasets, and activation history.
- Use lifecycle states: `draft → discovered → review_required → active`, with `failed` and `disconnected` states.
- Store source credentials encrypted with an app-managed server secret; never return them to the browser or logs.
- Keep previous approved snapshots so schema changes can be compared and audited.

## Connection and import flow
- Add a **Data Sources** screen under Data with two setup paths:
  - **PostgreSQL link:** Neon or Supabase connection string, tested server-side with read-only metadata queries.
  - **File import:** CSV or Excel upload into private app storage, parsed into governed imported datasets.
- Discover schemas without changing the source: tables, views, columns, types, keys, row estimates, and small masked samples.
- Limit discovery to administrator-selected schemas/tables and reject unsafe or write-capable connection configurations.
- On refresh, show additions, removals, and type changes; all newly discovered fields remain excluded until reviewed.

## Review and activation
- Generate suggested business topics, display names, descriptions, identifiers, measures, dates, relationships, and terminology from metadata.
- Provide a review workspace where administrators can:
  - include or exclude each table and field;
  - classify fields as safe, masked, or excluded;
  - correct topics, terminology, joins, units, currency, and date semantics;
  - preview exactly what the agent will be allowed to see.
- Validate mappings and read-only access before activation. Activation is explicit, audited, and replaces the prior active company configuration atomically.

## Agent adaptation
- Introduce a source-agnostic query layer that loads only the active approved mapping.
- Generate read-only agent capabilities from approved topics and fields; use parameterized queries and a strict allowlist rather than accepting model-written SQL.
- Preserve the current built-in synthetic dataset as the default active source so existing dashboards and examples continue working.
- Normalize query output into the existing evidence, citation, trace, and chart formats. Charts remain optional only when returned data is chartable; narrative answers remain Markdown text.
- Add the active source and approved mapping version to run/tool evidence for auditability.

## Validation and safety
- Test connection, discovery, refresh diff, mapping validation, activation, masking, and denied-field behavior.
- Verify an unauthenticated or non-admin user cannot reach credentials or setup actions.
- Verify existing copilot answers, Markdown rendering, result visualization, run traces, approvals, and evaluations still work with the default source.
- Check desktop and mobile layouts, runtime logs, and a production build.

## Technical details
- Use TanStack protected routes and authenticated server functions; no browser-side database connections.
- Use a Worker-compatible PostgreSQL client and streaming/size limits for imports.
- Use private storage for uploaded source files and the Web Crypto API for credential encryption.
- Apply all new database tables with explicit grants, row-level security, and service-role-only access where appropriate.
- Record structural decisions in `AGENTS.md` and update the roadmap and documentation after implementation.
