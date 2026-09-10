import type { CollectFormConfig } from "@/lib/collect-form-config";

export interface VisitorBadgePalette {
  background: string;
  foreground: string;
}

function comparableBadgeValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(comparableBadgeValue).filter(Boolean).join("\n");
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim().toLocaleLowerCase();
  }
  return "";
}

/** 첫 번째 일치 규칙의 문구를 쓰고, 없으면 기존 참가자 유형을 그대로 유지한다. */
export function resolveVisitorBadgeLabel(
  config: Pick<CollectFormConfig, "badgeRules">,
  data: Record<string, unknown>,
  fallback: string,
): string {
  for (const rule of config.badgeRules) {
    const actual = comparableBadgeValue(data[rule.fieldKey]);
    const expected = comparableBadgeValue(rule.value);
    if (!actual || !expected) continue;
    const matches = rule.operator === "equals" ? actual === expected : actual.includes(expected);
    if (matches) return rule.label;
  }
  return fallback;
}

const KNOWN_BADGE_PALETTES: Record<string, VisitorBadgePalette> = {
  general: { background: "#F28C18", foreground: "#FFFFFF" },
  buyer: { background: "#2563EB", foreground: "#FFFFFF" },
  press: { background: "#C026D3", foreground: "#FFFFFF" },
};

const FALLBACK_PALETTES: VisitorBadgePalette[] = [
  { background: "#0F766E", foreground: "#FFFFFF" },
  { background: "#7C3AED", foreground: "#FFFFFF" },
  { background: "#BE123C", foreground: "#FFFFFF" },
  { background: "#0369A1", foreground: "#FFFFFF" },
];

/** 분기 기능과 무관한 표시 전용 색상이다. 새 유형도 이름을 기준으로 항상 같은 색을 받는다. */
export function visitorBadgePalette(value: string): VisitorBadgePalette {
  const normalized = value.trim().toLowerCase();
  const known = KNOWN_BADGE_PALETTES[normalized];
  if (known) return known;
  let hash = 0;
  for (const char of normalized) hash = ((hash * 31) + char.codePointAt(0)!) >>> 0;
  return FALLBACK_PALETTES[hash % FALLBACK_PALETTES.length];
}

export function visitorBadgeCssVars(value: string): Record<string, string> {
  const palette = visitorBadgePalette(value);
  return { "--msf-badge-bg": palette.background, "--msf-badge-fg": palette.foreground };
}
