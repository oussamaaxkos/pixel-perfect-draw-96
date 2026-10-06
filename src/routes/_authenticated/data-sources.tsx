import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Database, FileSpreadsheet, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/ops/app-shell";
import { EmptyState, PageHeader, Panel, StatusBadge, fmtDate } from "@/components/ops/primitives";
import { Button } from "@/components/ui/button";
import {
  activateDataSource,
  connectPostgresSource,
  getDataSourceSetup,
  importFileSource,
  refreshDataSource,
  updateSourceField,
  updateSourceTopic,
} from "@/lib/ops/source.functions";

export const Route = createFileRoute("/_authenticated/data-sources")({
  head: () => ({
    meta: [
      { title: "Data Sources | OpsMind AI" },
      { name: "description", content: "Connect, inspect, govern and activate company data sources for OpsMind AI." },
      { property: "og:title", content: "Data Sources | OpsMind AI" },
      { property: "og:description", content: "Reviewed company data connections and field governance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DataSourcesPage,
});

type SetupData = Awaited<ReturnType<typeof getDataSourceSetup>>;

function DataSourcesPage() {
  const qc = useQueryClient();
  const getSetup = useServerFn(getDataSourceSetup);
  const connect = useServerFn(connectPostgresSource);
  const importFile = useServerFn(importFileSource);
  const activate = useServerFn(activateDataSource);
  const refresh = useServerFn(refreshDataSource);
  const saveField = useServerFn(updateSourceField);
  const saveTopic = useServerFn(updateSourceTopic);
  const setup = useQuery({ queryKey: ["data-source-setup"], queryFn: () => getSetup() });
  const [mode, setMode] = useState<"database" | "file">("database");
  const [busy, setBusy] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [dbForm, setDbForm] = useState({
    companyName: "",
    sourceName: "",
    sourceType: "neon" as "neon" | "supabase",
    connectionString: "",
    schemas: "public",
  });
  const [fileForm, setFileForm] = useState({ companyName: "", sourceName: "" });

  const data = setup.data as SetupData | undefined;
  const selectedSource = data?.sources.find((source) => source.id === selectedSourceId) ?? data?.sources[0];
  const latestSnapshot = data?.snapshots.find((snapshot) => snapshot.source_id === selectedSource?.id);
  const topics = useMemo(
    () => data?.topics.filter((topic) => topic.source_id === selectedSource?.id && topic.snapshot_id === latestSnapshot?.id) ?? [],
    [data, latestSnapshot?.id, selectedSource?.id],
  );

  async function reload() {
    await qc.invalidateQueries({ queryKey: ["data-source-setup"] });
  }

  async function submitDatabase(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await connect({
        data: {
          ...dbForm,
          schemas: dbForm.schemas.split(",").map((schema) => schema.trim()).filter(Boolean),
        },
      });
      setSelectedSourceId(result.sourceId);
      setDbForm((form) => ({ ...form, sourceName: "", connectionString: "" }));
      await reload();
      toast.success(`Discovered ${result.tableCount} tables. Review them before activation.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not connect the database.");
    } finally {
      setBusy(false);
    }
  }

  async function submitFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !fileForm.companyName || !fileForm.sourceName) {
      toast.error("Enter the company and source names before choosing a file.");
      event.target.value = "";
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Choose a file smaller than 8 MB.");
      event.target.value = "";
      return;
    }
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const sheets = workbook.SheetNames.flatMap((name) => {
        const sheet = workbook.Sheets[name];
        if (!sheet) return [];
        return [{ name,
        rows: XLSX.utils.sheet_to_json<Record<string, string | number | boolean | null>>(sheet, {
          defval: null,
          raw: false,
        }),
      }]; });
      const result = await importFile({
        data: { ...fileForm, fileName: file.name, sheets },
      });
      setSelectedSourceId(result.sourceId);
      await reload();
      toast.success(`Imported ${result.rows} rows. Review the fields before activation.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not import this file.");
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  if (setup.isLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  if (setup.isError) {
    return (
      <AppShell>
        <EmptyState title="Administrator access required" hint="Sign in with the administrator account to manage company data." />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Data Sources"
        subtitle="Connect one company's operational data, inspect its structure, and approve exactly what the agent may query."
      />

      {data?.claimedFirstAdmin ? (
        <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          <ShieldCheck className="h-4 w-4" /> Your account is now the workspace administrator.
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Add company data" description="Credentials are encrypted and never returned to this screen">
          <div className="mb-4 inline-flex rounded-md border border-border bg-surface-2 p-1">
            <Button size="sm" variant={mode === "database" ? "secondary" : "ghost"} onClick={() => setMode("database")}>
              <Database /> PostgreSQL link
            </Button>
            <Button size="sm" variant={mode === "file" ? "secondary" : "ghost"} onClick={() => setMode("file")}>
              <FileSpreadsheet /> CSV / Excel
            </Button>
          </div>

          {mode === "database" ? (
            <form className="space-y-3" onSubmit={submitDatabase}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Company" value={dbForm.companyName} onChange={(value) => setDbForm({ ...dbForm, companyName: value })} />
                <Field label="Source name" value={dbForm.sourceName} onChange={(value) => setDbForm({ ...dbForm, sourceName: value })} />
              </div>
              <label className="block space-y-1 text-xs">
                <span className="text-muted-foreground">Database provider</span>
                <select value={dbForm.sourceType} onChange={(event) => setDbForm({ ...dbForm, sourceType: event.target.value as "neon" | "supabase" })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="neon">Neon</option>
                  <option value="supabase">Supabase PostgreSQL</option>
                </select>
              </label>
              <label className="block space-y-1 text-xs">
                <span className="text-muted-foreground">Read-only connection string</span>
                <input required type="password" autoComplete="off" value={dbForm.connectionString} onChange={(event) => setDbForm({ ...dbForm, connectionString: event.target.value })} placeholder="postgresql://readonly:••••@host/database?sslmode=require" className="h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-xs" />
              </label>
              <Field label="Schemas" value={dbForm.schemas} onChange={(value) => setDbForm({ ...dbForm, schemas: value })} />
              <p className="text-xs text-muted-foreground">The connection is rejected if its user has write or database administration privileges.</p>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Database />} Test and discover
              </Button>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Company" value={fileForm.companyName} onChange={(value) => setFileForm({ ...fileForm, companyName: value })} />
                <Field label="Source name" value={fileForm.sourceName} onChange={(value) => setFileForm({ ...fileForm, sourceName: value })} />
              </div>
              <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-border bg-surface-2 px-4 text-center hover:border-primary/60">
                {busy ? <Loader2 className="mb-2 h-5 w-5 animate-spin text-primary" /> : <FileSpreadsheet className="mb-2 h-5 w-5 text-primary" />}
                <span className="text-sm font-medium">Choose CSV or Excel</span>
                <span className="mt-1 text-xs text-muted-foreground">Up to 8 MB and 5,000 rows per sheet</span>
                <input className="sr-only" type="file" accept=".csv,.xlsx,.xls" disabled={busy} onChange={submitFile} />
              </label>
            </div>
          )}
        </Panel>

        <Panel title="Connected sources" description="Only one reviewed source can be active at a time">
          {data?.sources.length ? (
            <div className="space-y-2">
              {data.sources.map((source) => (
                <button key={source.id} onClick={() => setSelectedSourceId(source.id)} className={`flex w-full items-center gap-3 rounded-md border px-3 py-3 text-left transition-colors ${selectedSource?.id === source.id ? "border-primary bg-primary/5" : "border-border bg-surface-2 hover:border-primary/50"}`}>
                  <Database className="h-4 w-4 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{source.name}</p>
                    <p className="text-xs text-muted-foreground">{source.source_type.toUpperCase()} · {source.last_discovered_at ? `Inspected ${fmtDate(source.last_discovered_at)}` : "Not inspected"}</p>
                  </div>
                  <StatusBadge status={source.status} />
                </button>
              ))}
            </div>
          ) : <EmptyState title="No company data connected" hint="Add a read-only database or upload a file to begin." />}
        </Panel>
      </div>

      {selectedSource ? (
        <Panel
          title={`Review · ${selectedSource.name}`}
          description={latestSnapshot ? `Schema version ${latestSnapshot.version} · New fields remain excluded until reviewed` : "Waiting for discovery"}
          actions={
            <div className="flex gap-2">
              {selectedSource.source_type === "neon" || selectedSource.source_type === "supabase" ? (
                <Button size="sm" variant="outline" onClick={async () => { try { await refresh({ data: { sourceId: selectedSource.id } }); await reload(); toast.success("Schema refreshed. Changes require review."); } catch (error) { toast.error(error instanceof Error ? error.message : "Refresh failed."); } }}>
                  <RefreshCw /> Refresh
                </Button>
              ) : null}
              <Button size="sm" onClick={async () => { try { await activate({ data: { sourceId: selectedSource.id } }); await reload(); toast.success("Reviewed company data is active for the agent."); } catch (error) { toast.error(error instanceof Error ? error.message : "Activation failed."); } }}>
                <ShieldCheck /> Activate reviewed mapping
              </Button>
            </div>
          }
        >
          {topics.length ? (
            <div className="space-y-3">
              {topics.map((topic) => {
                const fields = data?.fields.filter((field) => field.topic_id === topic.id) ?? [];
                return (
                  <section key={topic.id} className="rounded-md border border-border bg-surface-2">
                    <div className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-3">
                      <input type="checkbox" checked={topic.enabled} onChange={async (event) => { await saveTopic({ data: { topicId: topic.id, enabled: event.target.checked, displayName: topic.display_name, description: topic.description } }); await reload(); }} className="h-4 w-4 accent-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{topic.display_name}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{topic.source_schema}.{topic.source_table}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{fields.length} fields</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="px-3 py-2 font-medium">Field</th><th className="px-3 py-2 font-medium">Type</th><th className="px-3 py-2 font-medium">Meaning</th><th className="px-3 py-2 font-medium">Agent access</th></tr></thead>
                        <tbody>
                          {fields.map((field) => (
                            <tr key={field.id} className="border-b border-border/60 last:border-0">
                              <td className="px-3 py-2"><p className="font-medium">{field.display_name}</p><p className="font-mono text-[11px] text-muted-foreground">{field.source_column}</p></td>
                              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{field.data_type}</td>
                              <td className="px-3 py-2"><select value={field.semantic_type} onChange={async (event) => { await saveField({ data: { fieldId: field.id, accessLevel: field.access_level as "safe" | "masked" | "excluded", semanticType: event.target.value as "identifier" | "attribute" | "measure" | "date" | "status", displayName: field.display_name } }); await reload(); }} className="h-8 rounded-md border border-input bg-background px-2 text-xs"><option value="identifier">Identifier</option><option value="attribute">Attribute</option><option value="measure">Measure</option><option value="date">Date</option><option value="status">Status</option></select></td>
                              <td className="px-3 py-2"><select value={field.access_level} onChange={async (event) => { await saveField({ data: { fieldId: field.id, accessLevel: event.target.value as "safe" | "masked" | "excluded", semanticType: field.semantic_type as "identifier" | "attribute" | "measure" | "date" | "status", displayName: field.display_name } }); await reload(); }} className="h-8 rounded-md border border-input bg-background px-2 text-xs"><option value="excluded">Excluded</option><option value="masked">Masked</option><option value="safe">Safe</option></select></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                );
              })}
            </div>
          ) : <EmptyState title="No schema available" />}
        </Panel>
      ) : null}
    </AppShell>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block space-y-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <input required value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm" />
    </label>
  );
}