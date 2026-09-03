function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 수집 응답의 다중 값을 분리한다. 빌더 선택지가 있으면 그 값을 먼저 원자 단위로 인식한다.
 * `Oct 24, 2026, Oct 23, 2026`처럼 선택지 자체에 쉼표가 들어간 값은 단순 split으로는
 * 복원할 수 없기 때문이다. 선택지와 맞지 않는 외부 연동 값만 기존 구분자 규칙을 쓴다.
 */
export function splitCollectValues(value: unknown, knownOptions: readonly string[] = []): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((item) => splitCollectValues(item, knownOptions));
  if (typeof value === "boolean") return value ? ["동의"] : [];

  const raw = String(value).trim();
  if (!raw) return [];
  const options = Array.from(new Set(knownOptions.map((option) => option.trim()).filter(Boolean)))
    .sort((a, b) => b.length - a.length);

  if (options.includes(raw)) return [raw];
  if (options.length > 0) {
    const optionPattern = new RegExp(options.map(escapeRegExp).join("|"), "g");
    const matches = Array.from(raw.matchAll(optionPattern), (match) => match[0]);
    const remainder = raw.replace(optionPattern, "").replace(/[,;/|、，\s]/g, "");
    if (matches.length > 0 && remainder.length === 0) return matches;
  }

  return raw.split(/[,;/|、，]/).map((item) => item.trim()).filter(Boolean);
}
