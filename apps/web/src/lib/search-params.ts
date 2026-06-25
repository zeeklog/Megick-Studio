export type SearchValue = string | number | boolean | null | undefined;
export type SearchRecord = Record<string, SearchValue | SearchValue[]>;

export function asSearchRecord(value: unknown): SearchRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as SearchRecord;
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function optionalEnum<T extends readonly string[]>(
  value: unknown,
  values: T,
): T[number] | undefined {
  return typeof value === "string" && values.includes(value) ? value : undefined;
}

export function optionalBooleanString(value: unknown): boolean | string | undefined {
  if (typeof value === "boolean" || typeof value === "string") return value;
  return undefined;
}

export function optionalPositiveInteger(value: unknown): number | undefined {
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : Number.NaN;
  if (!Number.isInteger(numberValue) || numberValue < 1) return undefined;
  return numberValue;
}
