/**
 * 링크를 붙여넣으면 제목·기관을 채워 준다 — 서버가 그 페이지를 한 번 열어 본다.
 *
 * ── 서버가 남의 주소를 여는 일이라 막을 것이 있다(SSRF) ─────────────────────
 * 운영자가 넣은 주소를 **우리 서버가** 요청한다. 거기에 `http://169.254.169.254/`(클라우드 메타데이터)나
 * `http://localhost:5432` 를 넣으면 밖에서는 못 닿는 내부를 우리 서버가 대신 두드리게 된다.
 * 그래서:
 *   · http(s) 만
 *   · 호스트를 DNS 로 풀어 **사설·루프백·링크로컬 주소면 거절**
 *   · 리다이렉트는 자동으로 따라가지 않고 **한 단계씩 다시 검사**(공개 주소 → 내부 주소로 튀는 우회 차단)
 *   · 시간·크기 상한
 *
 * ── 한국 공공기관 사이트는 EUC-KR 이 많다 ─────────────────────────────
 * UTF-8 로만 읽으면 제목이 깨진다. 응답 헤더 → <meta charset> 순으로 인코딩을 찾아 다시 디코딩한다.
 *
 * 실패해도 던지지 않는다 — 제목을 못 가져오면 운영자가 직접 적으면 된다. 추가 자체가 막히면 안 된다.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface LinkPreview {
  title: string;
  siteName: string;
  /** 리다이렉트를 따라간 최종 주소 */
  finalUrl: string;
}

const TIMEOUT_MS = 6_000;
const MAX_BYTES = 600_000;
const MAX_REDIRECTS = 4;

/** 사설·루프백·링크로컬·예약 대역. 여기로 가는 요청은 보내지 않는다. */
export function isBlockedAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) ||           // 링크로컬 · 클라우드 메타데이터
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224                               // 멀티캐스트·예약
    );
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  if (v6.startsWith("fc") || v6.startsWith("fd")) return true;      // ULA
  if (v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb")) return true; // 링크로컬
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedAddress(mapped[1]);
  return false;
}

async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new Error("blocked-host");
  }
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) {
    throw new Error("blocked-host");
  }
}

function pickCharset(contentType: string | null, head: string): string {
  const fromHeader = contentType?.match(/charset=([\w-]+)/i)?.[1];
  if (fromHeader) return fromHeader.toLowerCase();
  const fromMeta = head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1];
  return (fromMeta ?? "utf-8").toLowerCase();
}

function decode(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset === "ks_c_5601-1987" ? "euc-kr" : charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

function unescapeHtml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z#0-9]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, key: string): string {
  // property/name 과 content 의 순서가 사이트마다 다르다 — 두 순서를 다 본다.
  const a = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i");
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, "i");
  return unescapeHtml(html.match(a)?.[1] ?? html.match(b)?.[1] ?? "");
}

/** HTML 에서 제목·사이트명을 뽑는다. 네트워크 없이 테스트할 수 있게 분리해 둔다. */
export function parsePreview(html: string, url: string): Omit<LinkPreview, "finalUrl"> {
  const title =
    metaContent(html, "og:title") ||
    metaContent(html, "twitter:title") ||
    unescapeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  let siteName = metaContent(html, "og:site_name");
  if (!siteName) {
    try {
      siteName = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      siteName = "";
    }
  }
  return { title: title.slice(0, 300), siteName: siteName.slice(0, 80) };
}

export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreview | null> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (current.protocol !== "http:" && current.protocol !== "https:") return null;
      await assertPublicHost(current.hostname);

      const res = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          // 봇 차단이 심한 사이트가 있어 평범한 브라우저처럼 보인다. 목적은 제목 한 줄뿐이다.
          "User-Agent": "Mozilla/5.0 (compatible; machstudio-brief/1.0; +link-preview)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "ko,en;q=0.8",
        },
      });

      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location");
        if (!next) return null;
        current = new URL(next, current); // 다음 바퀴에서 다시 검사한다
        continue;
      }
      if (!res.ok || !res.body) return null;
      if (!(res.headers.get("content-type") ?? "").includes("html")) return null;

      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (total < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.byteLength;
      }
      void reader.cancel().catch(() => {});

      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) {
        bytes.set(c.subarray(0, Math.min(c.byteLength, total - offset)), offset);
        offset += c.byteLength;
        if (offset >= total) break;
      }
      const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
      const html = decode(bytes, pickCharset(res.headers.get("content-type"), head));
      return { ...parsePreview(html, current.toString()), finalUrl: current.toString() };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
