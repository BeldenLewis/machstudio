import { createHash } from "node:crypto";
import { normalizeExpoPage } from "@/lib/expo/config";

/** JSON object keys are unordered; arrays remain ordered because section order is content. */
export function stableJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
}

/** Full normalized content identity. This must never reuse the preview custom-code digest. */
export function snapshotDigest(raw: unknown): string {
  return createHash("sha256").update(stableJson(normalizeExpoPage(raw))).digest("hex");
}
