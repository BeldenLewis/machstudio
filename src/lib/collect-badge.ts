export interface VisitorBadgePalette {
  background: string;
  foreground: string;
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
