/**
 * 브리프 자동 수집 — 소스 종류·설정·프리셋, 그리고 가져온 글을 **후보 한 줄**로 바꾸는 순수 로직.
 *
 * 네트워크·DB 는 collect.ts 에서 한다. 여기는 HTML·XML 문자열을 받아 후보를 돌려줄 뿐이라
 * 사이트 구조가 바뀌었을 때 테스트 한 파일로 바로 확인할 수 있다.
 *
 * ── 소스 셋 ─────────────────────────────────────────────────────────────
 *   bizinfo    기업마당 지원사업 공고 목록(분야별). 키 없이 공개 목록을 읽는다 — 마감일·수행기관이 같이 나온다.
 *   googlenews Google 뉴스 검색 RSS. 검색어 하나 = 소스 하나. 뉴스·행사 소식에 쓴다.
 *   rss        아무 RSS/Atom 피드. 기관 보도자료 피드 같은 걸 붙일 때.
 *
 * 들어온 건 전부 **채택 전 후보**다(adopted=false). 무엇을 내보낼지는 사람이 고른다.
 */
import { isBriefCategory, type BriefCategory } from "./model";

export const SOURCE_KINDS = [
  { key: "bizinfo", label: "기업마당 지원사업" },
  { key: "googlenews", label: "Google 뉴스 검색" },
  { key: "rss", label: "RSS 피드" },
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number]["key"];

export function isSourceKind(v: unknown): v is SourceKind {
  return SOURCE_KINDS.some((k) => k.key === v);
}

/** 기업마당 분야 코드 — 목록 페이지의 분야 버튼(fn_hashCode_Change)에서 옮겼다. */
export const BIZINFO_FIELDS = [
  { code: "07", label: "수출" },
  { code: "08", label: "내수" },
  { code: "01", label: "금융" },
  { code: "02", label: "기술" },
  { code: "03", label: "인력" },
  { code: "09", label: "창업" },
  { code: "10", label: "경영" },
  { code: "12", label: "기타" },
] as const;

/** 소스의 분류 — auto 면 제목으로 지원사업·행사를 가른다. */
export type SourceCategory = BriefCategory | "auto";

export interface SourceConfig {
  /** bizinfo: 분야 코드 */
  hashCode?: string;
  /** bizinfo: 몇 페이지(페이지당 15건)까지 읽을지 */
  pages?: number;
  /** googlenews: 검색어 */
  query?: string;
  /** googlenews: 최근 며칠 */
  days?: number;
  /** rss: 피드 주소 */
  url?: string;
  /** 제목에 이 말이 들어 있어야만 들인다(하나라도). 비면 다 들인다 */
  include?: string[];
  /** 제목에 이 말이 있으면 뺀다 */
  exclude?: string[];
}

const words = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 30) : [];

/** DB 의 JSON 을 믿지 않는다 — 종류별로 필요한 값만 꺼내고 범위를 자른다. */
export function normalizeSourceConfig(kind: SourceKind, raw: unknown): SourceConfig {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const base = { include: words(o.include), exclude: words(o.exclude) };
  if (kind === "bizinfo") {
    const code = typeof o.hashCode === "string" && BIZINFO_FIELDS.some((f) => f.code === o.hashCode) ? o.hashCode : "07";
    const pages = Math.min(5, Math.max(1, Math.round(Number(o.pages) || 3)));
    return { ...base, hashCode: code, pages };
  }
  if (kind === "googlenews") {
    const query = typeof o.query === "string" ? o.query.trim().slice(0, 120) : "";
    const days = Math.min(30, Math.max(1, Math.round(Number(o.days) || 7)));
    return { ...base, query, days };
  }
  const url = typeof o.url === "string" ? o.url.trim().slice(0, 500) : "";
  return { ...base, url };
}

export function normalizeSourceCategory(v: unknown): SourceCategory {
  return v === "auto" || isBriefCategory(v) ? (v as SourceCategory) : "auto";
}

export function bizinfoListUrl(cfg: SourceConfig, page: number): string {
  const q = new URLSearchParams({ hashCode: cfg.hashCode ?? "07", cpage: String(page), rows: "15", schEndAt: "N" });
  return `https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/list.do?${q}`;
}

export function bizinfoDetailUrl(pblancId: string): string {
  return `https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=${encodeURIComponent(pblancId)}`;
}

export function googleNewsUrl(cfg: SourceConfig): string {
  const q = `${cfg.query ?? ""} when:${cfg.days ?? 7}d`.trim();
  return `https://news.google.com/rss/search?${new URLSearchParams({ q, hl: "ko", gl: "KR", ceid: "KR:ko" })}`;
}

// ─── 후보 ───────────────────────────────────────────────────────────────

export interface Candidate {
  title: string;
  url: string;
  org: string;
  category: BriefCategory;
  /** KST 날짜 문자열 YYYY-MM-DD — 지원사업 마감일 */
  dueDate: string | null;
  dateLabel: string;
  publishedAt: Date | null;
}

/**
 * 제목만 보고 지원사업/행사를 가른다.
 * 설명회·웨비나·상담회처럼 "와서 듣는·만나는 자리" 는 행사, 리포트·보고서는 리포트 칸(같은 📚)으로.
 * 전시회·박람회 "참가 지원" 은 돈·부스를 대 주는 사업이라 지원사업으로 둔다.
 */
const EVENT_RE = /설명회|웨비나|webinar|세미나|상담회|포럼|컨퍼런스|콘퍼런스|아카데미|클래스|교육생|워크숍|리포트|보고서|간담회/i;

export function classifyTitle(title: string): BriefCategory {
  return EVENT_RE.test(title) ? "event" : "support";
}

export function resolveCategory(sourceCategory: SourceCategory, title: string): BriefCategory {
  return sourceCategory === "auto" ? classifyTitle(title) : sourceCategory;
}

export function passesWordFilter(title: string, cfg: Pick<SourceConfig, "include" | "exclude">): boolean {
  const t = title.toLowerCase();
  if (cfg.exclude?.some((w) => t.includes(w.toLowerCase()))) return false;
  if (cfg.include && cfg.include.length > 0) return cfg.include.some((w) => t.includes(w.toLowerCase()));
  return true;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·" };

function clean(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/** "2026-09-21 ~ 2026-10-09" → 마감일 / "예산 소진시까지" → 자유 표기 */
export function parseBizinfoPeriod(text: string): { dueDate: string | null; dateLabel: string } {
  // 목록 페이지는 2026-09-21, API 는 20260921 로 준다 — 둘 다 받는다.
  const dates = [...text.matchAll(/(\d{4})-?(\d{2})-?(\d{2})/g)].map((m) => `${m[1]}-${m[2]}-${m[3]}`);
  if (dates.length > 0) return { dueDate: dates[dates.length - 1], dateLabel: "" };
  const t = text.replace(/\s+/g, "");
  if (!t) return { dueDate: null, dateLabel: "" };
  if (t.includes("소진")) return { dueDate: null, dateLabel: "예산소진시까지" };
  if (t.includes("선착순")) return { dueDate: null, dateLabel: "선착순" };
  if (t.includes("상시")) return { dueDate: null, dateLabel: "상시" };
  return { dueDate: null, dateLabel: text.trim().slice(0, 20) };
}

/**
 * 기업마당 공고 목록 페이지 → 후보.
 * 열 순서: 번호 · 분야 · 제목 · 신청기간 · 소관부처 · 수행기관 · 등록일 · 조회수
 * 기관은 **수행기관**(실제로 접수받는 곳)을 쓴다 — 원본 게시물의 [대괄호]가 그랬다.
 */
export function parseBizinfoList(html: string, category: SourceCategory): Candidate[] {
  const body = html.slice(Math.max(0, html.indexOf("<tbody")));
  const out: Candidate[] = [];
  for (const row of body.match(/<tr[\s>][\s\S]*?<\/tr>/g) ?? []) {
    const id = row.match(/pblancId=(PBLN_\w+)/)?.[1];
    if (!id) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => clean(m[1]));
    if (cells.length < 6) continue;
    const title = clean(row.match(/<a[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? cells[2]);
    if (!title) continue;
    const { dueDate, dateLabel } = parseBizinfoPeriod(cells[3]);
    const registered = cells[6]?.match(/\d{4}-\d{2}-\d{2}/)?.[0];
    out.push({
      title,
      url: bizinfoDetailUrl(id),
      org: cells[5] || cells[4] || "",
      category: resolveCategory(category, title),
      dueDate,
      dateLabel,
      publishedAt: registered ? new Date(`${registered}T00:00:00+09:00`) : null,
    });
  }
  return out;
}

// ─── 기업마당 공식 API ───────────────────────────────────────────────────
/*
  인증키(BIZINFO_API_KEY)가 있으면 목록 페이지 대신 공식 API 를 쓴다 — 화면 구조가 바뀌어도 안 깨지고,
  한 번에 100건을 받는다. 키가 없거나 API 가 실패하면 목록 읽기로 돌아간다(collect.ts).

  응답 필드 이름은 기업마당 API 안내서 기준이다. 키를 받기 전이라 실응답으로 확인하지 못했으므로
  이름이 조금 달라도 읽히게 후보 이름을 여러 개 본다.
*/

export function bizinfoApiUrl(key: string, count = 100): string {
  const q = new URLSearchParams({ crtfcKey: key, dataType: "json", searchCnt: String(count) });
  return `https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do?${q}`;
}

type Row = Record<string, unknown>;
const str = (row: Row, ...keys: string[]): string => {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return clean(v);
    if (typeof v === "number") return String(v);
  }
  return "";
};

/** API 가 오류를 문자열로 준다: {"reqErr":"인증키를 입력해주세요."} */
export function bizinfoApiError(json: unknown): string {
  const o = (json && typeof json === "object" ? json : {}) as Row;
  return typeof o.reqErr === "string" ? o.reqErr : "";
}

/**
 * API 응답 → 후보. 분야는 분야 **이름**(수출·내수…)으로 거른다 — API 의 분야 코드 체계가
 * 목록 페이지의 hashCode 와 달라 이름이 더 안전하다.
 */
export function parseBizinfoApi(json: unknown, fieldLabel: string, category: SourceCategory): Candidate[] {
  const o = (json && typeof json === "object" ? json : {}) as Row;
  const arr = (Array.isArray(o.jsonArray) ? o.jsonArray : Array.isArray(o.items) ? o.items : Array.isArray(json) ? json : []) as Row[];
  const out: Candidate[] = [];
  for (const row of arr) {
    if (!row || typeof row !== "object") continue;
    const field = str(row, "pldirSportRealmLclasCodeNm", "lclasCodeNm", "realmNm");
    if (fieldLabel && field && !field.includes(fieldLabel)) continue;
    const title = str(row, "pblancNm", "title");
    // 공고 id 가 있으면 목록 읽기와 **같은 주소**를 만든다 — 방식이 바뀌어도 이미 들어온 공고가 중복으로 안 잡힌다.
    const id = str(row, "pblancId");
    let url = id ? bizinfoDetailUrl(id) : str(row, "pblancUrl", "link");
    if (url.startsWith("/")) url = `https://www.bizinfo.go.kr${url}`;
    if (!title || !/^https?:\/\//.test(url)) continue;
    const { dueDate, dateLabel } = parseBizinfoPeriod(str(row, "reqstBeginEndDe", "reqstDt"));
    const created = str(row, "creatPnttm", "pubDate").match(/(\d{4})-?(\d{2})-?(\d{2})/);
    out.push({
      title: title.slice(0, 300),
      url,
      org: str(row, "excInsttNm", "jrsdInsttNm", "author"),
      category: resolveCategory(category, title),
      dueDate,
      dateLabel,
      publishedAt: created ? new Date(`${created[1]}-${created[2]}-${created[3]}T00:00:00+09:00`) : null,
    });
  }
  return out;
}

function tag(block: string, name: string): string {
  return block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? "";
}

/**
 * RSS 2.0 / Atom → 후보. Google 뉴스는 제목 끝에 " - 언론사" 가 붙고 <source> 에 언론사가 있다.
 * 언론사는 기관 칸으로, 제목에서는 떼어 낸다.
 */
export function parseFeed(xml: string, category: SourceCategory): Candidate[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  const out: Candidate[] = [];
  for (const b of blocks) {
    let title = clean(tag(b, "title"));
    const link = clean(tag(b, "link")) || b.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || "";
    if (!title || !/^https?:\/\//i.test(link)) continue;
    let org = clean(tag(b, "source")) || clean(tag(b, "dc:creator"));
    if (org && title.endsWith(` - ${org}`)) title = title.slice(0, -(org.length + 3)).trim();
    else if (!org) {
      const m = title.match(/^(.*\S)\s+-\s+([^-]{2,30})$/);
      if (m && /news\.google\./.test(link)) {
        title = m[1];
        org = m[2].trim();
      }
    }
    const when = clean(tag(b, "pubDate")) || clean(tag(b, "published")) || clean(tag(b, "updated"));
    const d = when ? new Date(when) : null;
    out.push({
      title: title.slice(0, 300),
      url: link,
      org: org.slice(0, 80),
      category: category === "auto" ? classifyTitle(title) === "event" ? "event" : "news" : category,
      dueDate: null,
      dateLabel: "",
      publishedAt: d && !Number.isNaN(d.getTime()) ? d : null,
    });
  }
  return out;
}

// ─── 프리셋 ─────────────────────────────────────────────────────────────

export interface SourcePreset {
  kind: SourceKind;
  name: string;
  category: SourceCategory;
  config: SourceConfig;
}

export interface BriefPreset {
  key: string;
  label: string;
  description: string;
  brief: { name: string; slug: string; intro: string };
  sources: SourcePreset[];
}

/**
 * 해외진출·수출 — 코리아 엑스포 The Action 이 하던 그대로.
 * 참고한 해외진출 데일리 브리프의 출처(기업마당 · 중기부 · Google 뉴스)를 따랐다.
 * 중기부 공고는 기업마당에 같이 올라오므로 기업마당 수출 분야 하나로 덮인다.
 */
export const EXPORT_PRESET: BriefPreset = {
  key: "export",
  label: "해외진출·수출",
  description: "기업마당 수출 분야 공고 + 수출·K-소비재 뉴스와 설명회 소식",
  brief: { name: "The Action", slug: "the-action", intro: "이번주 바로 확인해야 할 실용 정보를 보내드립니다!" },
  sources: [
    { kind: "bizinfo", name: "기업마당 · 수출", category: "auto", config: { hashCode: "07", pages: 3 } },
    { kind: "googlenews", name: "수출 설명회·웨비나", category: "auto", config: { query: "수출 설명회 OR 해외진출 웨비나 OR 수출 세미나", days: 7 } },
    { kind: "googlenews", name: "중소기업 해외진출", category: "news", config: { query: "중소기업 해외진출", days: 3 } },
    { kind: "googlenews", name: "K-뷰티 수출", category: "news", config: { query: "K-뷰티 수출", days: 3 } },
    { kind: "googlenews", name: "K-푸드 수출", category: "news", config: { query: "K-푸드 수출", days: 3 } },
    { kind: "googlenews", name: "관세·통상 이슈", category: "news", config: { query: "관세 중소기업 수출", days: 3 } },
    { kind: "googlenews", name: "해외 박람회 한국관", category: "news", config: { query: "박람회 한국관 참가", days: 7 } },
  ],
};

export const BRIEF_PRESETS: BriefPreset[] = [EXPORT_PRESET];

/** 코리아 엑스포 프로젝트는 고르지 않아도 해외진출 세트로 바로 시작한다. */
export function presetForProject(projectName: string): BriefPreset | null {
  return /코리아\s*엑스포|korea\s*expo/i.test(projectName) ? EXPORT_PRESET : null;
}

export function sourceLabel(kind: string, name: string): string {
  if (name) return name;
  return SOURCE_KINDS.find((k) => k.key === kind)?.label ?? kind;
}
