import { z } from "zod";

export const CompanyQuery = z.object({
  topic: z.string().min(1).max(200),
  operation: z.enum(["rows", "count", "sum", "average"]),
  group_by: z.string().nullable().optional(),
  measure: z.string().nullable().optional(),
  filter_field: z.string().nullable().optional(),
  filter_value: z.union([z.string(), z.number(), z.boolean()]).nullable().optional(),
  limit: z.number().int().min(1).max(50).default(25),
});

export type ApprovedField = { source_column: string; access_level: string; semantic_type: string };

export function validateApprovedQuery(input: unknown, fields: ApprovedField[]) {
  const query = CompanyQuery.parse(input);
  const permitted = new Map(
    fields
      .filter((field) => field.access_level === "safe")
      .map((field) => [field.source_column, field]),
  );
  for (const field of [query.group_by, query.measure, query.filter_field]) {
    if (field && !permitted.has(field))
      throw new Error(`Field ${field} is not approved for this operation.`);
  }
  if (
    ["sum", "average"].includes(query.operation) &&
    (!query.measure || permitted.get(query.measure)?.semantic_type !== "measure")
  ) {
    throw new Error("Choose an approved numeric measure for this calculation.");
  }
  return query;
}

export function queryImportedRows(
  rows: Record<string, unknown>[],
  input: unknown,
  fields: ApprovedField[],
) {
  const query = validateApprovedQuery(input, fields);
  const filtered = rows.filter(
    (row) =>
      !query.filter_field ||
      String(row[query.filter_field] ?? "") === String(query.filter_value ?? ""),
  );
  if (query.operation === "rows")
    return filtered
      .slice(0, query.limit)
      .map((row) =>
        Object.fromEntries(
          fields
            .filter((field) => field.access_level !== "excluded")
            .map((field) => [
              field.source_column,
              field.access_level === "masked" ? "[masked]" : (row[field.source_column] ?? null),
            ]),
        ),
      );
  const groups = new Map<string, { count: number; sum: number }>();
  for (const row of filtered) {
    const label = query.group_by ? String(row[query.group_by] ?? "Unknown") : "All records";
    const group = groups.get(label) ?? { count: 0, sum: 0 };
    group.count++;
    if (query.measure) {
      const value = Number(row[query.measure]);
      if (!Number.isFinite(value))
        throw new Error("The selected measure contains non-numeric values.");
      group.sum += value;
    }
    groups.set(label, group);
  }
  if (!filtered.length && !query.group_by) groups.set("All records", { count: 0, sum: 0 });
  return [...groups.entries()].slice(0, query.limit).map(([category, group]) => ({
    category,
    value:
      query.operation === "count"
        ? group.count
        : query.operation === "sum"
          ? group.sum
          : group.count
            ? group.sum / group.count
            : null,
  }));
}
