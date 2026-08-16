/**
 * 국가 다이얼코드 표를 만든다 → src/lib/collect-country.ts
 *
 * **왜 생성해서 커밋하나.** 이 표는 임베드 번들(공개 등록 폼)에 들어간다. 런타임에서
 * libphonenumber-js 를 부르면 국가 메타데이터가 통째로 딸려와 번들이 수백 KB 커진다
 * (collect-phone.ts 가 같은 이유로 서버 전용이다). 그래서 **이름과 번호만** 뽑아 둔다.
 *
 * 다시 만들 때: node scripts/build-country-table.mjs
 */
import { writeFileSync } from "node:fs";
import { getCountries, getCountryCallingCode } from "libphonenumber-js";

const names = new Intl.DisplayNames(["en"], { type: "region" });
const rows = getCountries()
  .map((c) => [c, getCountryCallingCode(c), names.of(c) || c])
  .sort((a, b) => a[2].localeCompare(b[2], "en"));

const packed = rows.map(([c, d, n]) => `${c}${d}:${n}`).join("|");

writeFileSync(
  "src/lib/collect-country.ts",
  `/**
 * 국가 다이얼코드 — 공개 등록 폼의 국가 선택(설계 §6.3 \`[🇺🇸 United States +1 ▾]\`).
 *
 * **생성 파일이다. 손으로 고치지 마라** — \`node scripts/build-country-table.mjs\`.
 *
 * 왜 libphonenumber 를 안 부르나: 이 모듈은 임베드 번들에 들어가고, 거기서 그 라이브러리를
 * 부르면 국가 메타데이터가 통째로 따라와 번들이 수백 KB 커진다. 화면에 필요한 것은
 * **이름과 번호뿐**이라 그 둘만 뽑아 둔다. 실제 번호 파싱·유효성은 서버가 한다.
 *
 * 국기는 데이터가 아니라 ISO 두 글자에서 계산한다(지역 표시 기호) — 표에 넣을 이유가 없다.
 */

/** \`{ISO2}{dial}:{영문 국가명}\` 을 \`|\` 로 이은 것. 영문 이름 오름차순. */
const PACKED =
  ${JSON.stringify(packed)};

export interface CountryDial {
  /** ISO 3166-1 alpha-2 */
  code: string;
  /** 국가번호 — \`+\` 없이 숫자만 */
  dial: string;
  name: string;
}

/** 선택 목록. 이름 오름차순이라 그대로 \`<option>\` 으로 쓴다. */
export const COUNTRY_DIALS: readonly CountryDial[] = PACKED.split("|").map((row) => {
  const colon = row.indexOf(":");
  return { code: row.slice(0, 2), dial: row.slice(2, colon), name: row.slice(colon + 1) };
});

const BY_CODE = new Map(COUNTRY_DIALS.map((c) => [c.code, c]));

/** 아는 국가 코드인가 — 제출로 들어온 값을 그대로 믿지 않기 위한 판정. */
export function isKnownCountry(code: unknown): boolean {
  return typeof code === "string" && BY_CODE.has(code.toUpperCase());
}

export function dialFor(code: string): string | null {
  return BY_CODE.get(code.toUpperCase())?.dial ?? null;
}

/**
 * 국기 이모지 — ISO 두 글자를 지역 표시 기호로 옮긴다.
 * 이모지를 못 그리는 환경에서는 두 글자가 그대로 보이므로 정보가 사라지지 않는다.
 */
export function flagEmoji(code: string): string {
  const c = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "";
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
`,
);

console.log(`collect-country: ${rows.length}개국 · ${Buffer.byteLength(packed)}B`);
