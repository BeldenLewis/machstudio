import { normalizeEmail } from "@/lib/collect-email";

export type CaptureDedupKey = {
  field: string;
  value: string;
  lockValue: string;
};

function normalizedFieldValue(field: string, value: unknown): string | null {
  if (/(^|[_-])e?mail($|[_-])/i.test(field) || /^e-?mail$/i.test(field)) {
    return normalizeEmail(value);
  }

  const normalized = value == null ? "" : String(value).trim().toLowerCase();
  return normalized || null;
}

/**
 * 연동형 가져오기와 같은 규칙: 설정된 필드를 순서대로 보고 값이 있는 첫 항목을
 * 중복 키로 사용한다. 설정이 없거나 모든 값이 비었으면 실시간 수집을 막지 않는다.
 */
export function captureDedupKey(
  data: Record<string, unknown>,
  configuredFields: unknown,
): CaptureDedupKey | null {
  if (!Array.isArray(configuredFields)) return null;

  for (const candidate of configuredFields) {
    if (typeof candidate !== "string") continue;
    const field = candidate.trim();
    if (!field) continue;
    const value = normalizedFieldValue(field, data[field]);
    if (!value) continue;
    return { field, value, lockValue: `${field}:${value}` };
  }

  return null;
}

export function captureEmailNormalized(data: Record<string, unknown>): string | null {
  for (const [field, value] of Object.entries(data)) {
    if (/(^|[_-])e?mail($|[_-])/i.test(field) || /^e-?mail$/i.test(field)) {
      const normalized = normalizeEmail(value);
      if (normalized) return normalized;
    }
  }
  return null;
}
