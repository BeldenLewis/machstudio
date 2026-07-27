/**
 * 연사 링크 — 홈페이지 1개 + SNS 여러 개. 편집기·저장 라우트·랜딩 뷰가 공유한다.
 *
 * 왜 플랫폼을 고르게 하지 않고 URL 에서 뽑나: 운영자가 붙여넣는 것은 링크뿐이다.
 * "플랫폼 선택 + URL 입력" 두 칸으로 두면 값 하나 넣는 데 두 번 손이 가고, 둘이 어긋난
 * 행(라벨은 LinkedIn 인데 주소는 인스타)이 생긴다. 호스트로 판정하면 붙여넣기 한 번이다.
 *
 * 모르는 호스트는 버리지 않는다 — 브런치·개인 블로그·기업 채용 페이지처럼 목록에 없는
 * 곳이 많다. 그때는 호스트명을 그대로 라벨로 쓴다(아이콘만 일반 링크 모양).
 */
import { safeHttpUrl } from "@/lib/webinar-config";

/** 아이콘을 가진 플랫폼. 그 외는 kind: "link" 로 떨어진다. */
export type SpeakerLinkKind =
  | "linkedin"
  | "instagram"
  | "x"
  | "youtube"
  | "facebook"
  | "github"
  | "threads"
  | "tistory"
  | "brunch"
  | "naver"
  | "link";

export interface SpeakerLink {
  /** 정규화된 절대 http(s) URL. */
  url: string;
  kind: SpeakerLinkKind;
  /** 사람이 읽는 이름 — 아는 플랫폼은 정식 표기, 모르면 호스트명. */
  label: string;
}

/** SNS 링크 상한 — 아이콘 줄이 두 줄로 넘치면 모달 맨 밑이 무거워진다. */
export const SPEAKER_LINKS_MAX = 6;

/**
 * 호스트 → 플랫폼. 접미 일치로 본다(`www.` · `kr.` 같은 접두, `linkedin.com` 하위 도메인 모두 통과).
 * 순서는 무관하지만 x/twitter 처럼 한 플랫폼에 호스트가 여러 개인 경우가 있다.
 */
const HOSTS: [suffix: string, kind: SpeakerLinkKind, label: string][] = [
  ["linkedin.com", "linkedin", "LinkedIn"],
  ["instagram.com", "instagram", "Instagram"],
  ["x.com", "x", "X"],
  ["twitter.com", "x", "X"],
  ["youtube.com", "youtube", "YouTube"],
  ["youtu.be", "youtube", "YouTube"],
  ["facebook.com", "facebook", "Facebook"],
  ["fb.com", "facebook", "Facebook"],
  ["github.com", "github", "GitHub"],
  ["threads.net", "threads", "Threads"],
  ["threads.com", "threads", "Threads"],
  ["tistory.com", "tistory", "티스토리"],
  ["brunch.co.kr", "brunch", "브런치"],
  ["blog.naver.com", "naver", "네이버 블로그"],
  ["post.naver.com", "naver", "네이버 포스트"],
];

/** 호스트에서 표시용 이름 — `www.` 를 떼고 소문자 그대로(도메인은 대소문자 구분이 없다). */
function hostLabel(host: string): string {
  return host.replace(/^www\./, "");
}

/**
 * URL 하나를 링크로. 절대 http(s) 가 아니면 null —
 * 랜딩은 남의 사이트에 붙기 때문에 `javascript:` · `data:` 가 href 에 닿으면 안 된다
 * (같은 규칙을 랜딩 DOM 빌더의 setAttrSafe 가 한 번 더 본다: 두 겹으로 막는다).
 */
export function parseSpeakerLink(value: unknown): SpeakerLink | null {
  const url = safeHttpUrl(value);
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  const hit = HOSTS.find(([suffix]) => host === suffix || host.endsWith(`.${suffix}`));
  return hit
    ? { url, kind: hit[1], label: hit[2] }
    : { url, kind: "link", label: hostLabel(host) };
}

/**
 * 저장·표시용 목록 정규화. 빈 값·중복·잘못된 스킴을 떨어뜨리고 상한을 적용한다.
 *
 * 중복 판정은 **정규화된 URL 문자열**로 한다 — 같은 프로필의 다른 표기(끝 슬래시 유무 등)는
 * 다른 값으로 남는다. 여기서 더 공격적으로 합치면(경로 정규화) 운영자가 의도한 다른 페이지
 * (프로필 vs 특정 글)를 하나로 뭉갠다.
 */
export function normalizeSpeakerLinks(raw: unknown): SpeakerLink[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: SpeakerLink[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    // 저장 형태는 URL 문자열 배열이지만, 옛 값이나 손으로 고친 값이 { url } 로 올 수 있다.
    const value = typeof item === "string" ? item : (item as { url?: unknown } | null)?.url;
    const link = parseSpeakerLink(value);
    if (!link || seen.has(link.url)) continue;
    seen.add(link.url);
    out.push(link);
    if (out.length >= SPEAKER_LINKS_MAX) break;
  }
  return out;
}

/** DB 에 넣을 형태 — URL 문자열 배열. 비면 null(컬럼을 비워 둔다). */
export function serializeSpeakerLinks(raw: unknown): string[] | null {
  const links = normalizeSpeakerLinks(raw);
  return links.length ? links.map((l) => l.url) : null;
}
