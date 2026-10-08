import { useEffect, useMemo, useRef, useState } from "react";

type Topic = { id: string; source_table: string; source_schema: string };
type Field = { topic_id: string; source_column: string; data_type: string; access_level: string };

const safe = (value: string) => value.replace(/[^a-zA-Z0-9_]/g, "_") || "_";

function singular(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith("ies")) return lower.slice(0, -3) + "y";
  if (lower.endsWith("ses")) return lower.slice(0, -2);
  if (lower.endsWith("s")) return lower.slice(0, -1);
  return lower;
}

export function buildClassDiagram(topics: Topic[], fields: Field[]) {
  const lines = ["classDiagram", "direction LR"];
  const byName = new Map<string, string>();
  for (const topic of topics) {
    byName.set(topic.source_table.toLowerCase(), safe(topic.source_table));
    byName.set(singular(topic.source_table), safe(topic.source_table));
  }
  const relations = new Set<string>();
  for (const topic of topics) {
    const cls = safe(topic.source_table);
    const own = fields.filter((field) => field.topic_id === topic.id);
    lines.push(`class ${cls} {`);
    for (const field of own) {
      const vis = field.access_level === "excluded" ? "-" : field.access_level === "masked" ? "#" : "+";
      lines.push(`  ${vis}${safe(field.data_type)} ${safe(field.source_column)}`);
      const match = field.source_column.toLowerCase().match(/^(.+?)_?id$/);
      const target = match?.[1] ? byName.get(match[1]) ?? byName.get(singular(match[1])) : undefined;
      if (target && target !== cls) relations.add(`${target} "1" <-- "*" ${cls} : ${safe(field.source_column)}`);
    }
    lines.push("}");
  }
  lines.push(...relations);
  return lines.join("\n");
}

export function SchemaUml({ topics, fields }: { topics: Topic[]; fields: Field[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const source = useMemo(() => buildClassDiagram(topics, fields), [topics, fields]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        const dark = document.documentElement.classList.contains("dark");
        mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "default", securityLevel: "strict" });
        const { svg } = await mermaid.render(`uml-${Date.now()}`, source);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not draw diagram.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source]);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        + allowed · # masked · - excluded. Links are inferred from columns ending in “_id”.
      </p>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div ref={ref} className="overflow-auto rounded-md border border-border bg-surface-2 p-4 [&_svg]:mx-auto [&_svg]:max-w-none" />
    </div>
  );
}
