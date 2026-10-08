import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/ops/app-shell";
import { EmptyState, PageHeader, Panel } from "@/components/ops/primitives";
import { getEntityRows } from "@/lib/ops/entities.functions";

export const Route = createFileRoute("/_authenticated/entities/$topicId")({
  head: () => ({
    meta: [
      { title: "Company data | OpsMind AI" },
      { name: "description", content: "Browse approved records from your connected company data." },
      { property: "og:title", content: "Company data | OpsMind AI" },
      { property: "og:description", content: "Approved records from the active company source." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EntityPage,
});

function EntityPage() {
  const { topicId } = Route.useParams();
  const fetchRows = useServerFn(getEntityRows);
  const q = useQuery({
    queryKey: ["entity-rows", topicId],
    queryFn: () => fetchRows({ data: { topicId } }),
  });

  return (
    <AppShell>
      {q.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading records…
        </div>
      ) : q.error ? (
        <EmptyState title="Could not load this entity" hint={(q.error as Error).message} />
      ) : q.data ? (
        <>
          <PageHeader
            title={q.data.name}
            subtitle={`${q.data.sourceName} · ${q.data.count ?? "?"} records · showing up to 50. Masked fields are hidden.`}
          />
          <Panel>
            {q.data.rows.length === 0 ? (
              <EmptyState title="No records" />
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      {q.data.columns.map((c) => (
                        <th key={c.key} className="whitespace-nowrap px-3 py-2 font-medium">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {q.data.rows.map((row, i) => (
                      <tr key={i} className="border-b border-border/60 hover:bg-accent/40">
                        {q.data.columns.map((c) => (
                          <td key={c.key} className="max-w-xs truncate whitespace-nowrap px-3 py-2">
                            {row[c.key] ?? <span className="text-muted-foreground">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      ) : null}
    </AppShell>
  );
}
