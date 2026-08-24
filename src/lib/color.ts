/**
 * 색 계산의 **공용 계약** — 브라우저·서버·임베드 번들 어디서나 쓴다.
 *
 * ── 왜 모으나 ─────────────────────────────────────────────────────────
 * 같은 계산이 저장소에 세 벌 있다: 라이브 시청 화면(`LiveContentStk.onAccentColor`),
 * 랜딩 런타임(`landing/mount` 의 paperFor), 대회 공고(`notice/mount` 의 paperFor — 주석에
 * "랜딩과 같은 계산" 이라고 적혀 있다). 홈페이지 빌더가 **네 번째**를 만들기 전에 한 곳으로 모은다.
 *
 * ── 지금은 새 코드만 쓴다 ──────────────────────────────────────────────
 * 기존 세 곳은 아직 그대로 둔다. 그중 하나가 라이브 시청 화면이라 방송 중 위험이 있고,
 * 교체는 방송 없는 주간에 별도로 한다(W1 계획 Task 20). 그때 화면 색이 바뀌지 않는다는 것은
 * `__tests__/color.test.ts` 의 값 표가 증명한다 — 그 표는 기존 구현에서 그대로 옮긴 것이다.
 *
 * React 를 쓰지 않고 DOM 도 만지지 않는다 — 임베드 번들에 들어갈 수 있어야 한다.
 */

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * `#rrggbb` 소문자로 편다. hex 가 아니면 null — 저장된 값은 무엇이든 올 수 있으므로 던지지 않는다.
 */
export function normalizeHexColor(value: string): string | null {
  if (typeof value !== "string") return null;
  const m = HEX.exec(value.trim());
  if (!m) return null;
  const hex = m[1].toLowerCase();
  return "#" + (hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex);
}

export function isHexColor(value: string): boolean {
  return normalizeHexColor(value) !== null;
}

/**
 * 키컬러 **위에 얹을 글자색**.
 *
 * 흰색이 기본이다(브랜드 결정). 진한 글자는 흰 글자가 형태조차 안 보이는 아주 밝은
 * 키컬러(노랑·연회색)에서만 쓰는 안전장치다.
 *
 * 임계값 0.78 은 실사고에서 나왔다: 0.6 이었을 때 주황(#ff8500)이 0.605 로 **간신히 넘어**
 * 검은 글자를 받았고, 오픈채팅·등록·입장 버튼이 전부 그랬다. 0.78 로 올려 주황·중간 초록·
 * 시안이 흰 글자를 받는다.
 *
 * 이 값은 대비비가 아니라 YIQ 체감밝기다. 흰 글자의 실제 대비는 주황에서 2.44:1 로 AA(4.5:1)에
 * 못 미친다 — 흰색을 쓰기로 한 브랜드 판단을 따르되, 대비를 올리려면 글자색이 아니라
 * **버튼 배경을 키컬러의 66% 쯤으로 낮추는** 쪽이 맞다(그때 흰 글자가 4.58:1 이 된다).
 */
export function onAccentColor(accent: string): string {
  const normalized = normalizeHexColor(accent);
  if (!normalized) return "#ffffff"; // hex 가 아니면(rgb·named) 기존 동작 유지
  const hex = normalized.slice(1);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum >= 0.78 ? "#1a1a1f" : "#ffffff";
}

/**
 * 배경 위에서 읽히는 **본문 글자색**.
 *
 * 상수로 두지 않는 이유: 편집 UI 가 "글자색은 배경에서 자동으로 따라옵니다" 라고 안내하는데,
 * 운영자가 다크 배경에 흰색을 고르면 상수로는 대비 1.06:1 백지가 된다.
 * 순백/순검 대신 배경 계열로 살짝 눕힌다.
 *
 * hex 가 아니면 **종이색**으로 떨어진다 — 기존 두 구현이 파싱 실패 시 NaN 비교로 그렇게
 * 동작했고(`luminance > 0.45` 가 false), 다크 배경 기본값이라 무해한 쪽이라 그대로 둔다.
 */
export function paperFor(bg: string): string {
  const normalized = normalizeHexColor(bg);
  if (!normalized) return "#f6f8ff";
  const hex = normalized.slice(1);
  const channels = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return luminance > 0.45 ? "#101828" : "#f6f8ff";
}

/**
 * 같은 색을 **흐리게** 쓴다 — 보조 문구용.
 *
 * 별도의 회색을 상수로 두지 않는 이유: 다크 배경에서는 회색이 안 읽히고, 밝은 배경에서는
 * 너무 튄다. 본문 색에 알파를 얹으면 어느 배경에서든 같은 관계가 유지된다.
 * hex 가 아니면 원래 값을 그대로 돌려준다 — 색을 지어내지 않는다.
 */
export function withAlpha(color: string, alpha: number): string {
  const normalized = normalizeHexColor(color);
  if (!normalized) return color;
  const hex = normalized.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
