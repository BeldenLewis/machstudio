/**
 * 단축링크 클릭을 셀지 말지, 누구로 셀지.
 *
 * ── 미리보기 봇은 빼고, 카톡 안 브라우저는 센다 ─────────────────────────
 * 카톡에 링크를 올리면 카카오 서버가 미리보기를 만들려고 **한 번 연다**(UA 에 `kakaotalk-scrap`).
 * 이걸 세면 올리자마자 모든 링크가 1클릭이 된다. 반면 사람이 카톡에서 눌러 여는 인앱 브라우저의 UA 에도
 * `KAKAOTALK` 가 들어 있다 — 그건 우리가 제일 세고 싶은 클릭이다. 그래서 "kakaotalk" 단어만으로 거르면 안 된다.
 *
 * ── 개인정보를 쌓지 않는다 ─────────────────────────────────────────
 * IP·UA 원문은 저장하지 않는다. (IP + UA + KST 날짜) 를 해시한 값만 남겨 "같은 날 같은 사람" 을 한 번으로 센다.
 * 날짜가 섞여 있어 날이 바뀌면 같은 사람도 다른 키가 된다 — 사람을 날짜 너머로 추적하지 않는다.
 */
import { createHash } from "node:crypto";

const BOT_PATTERNS = [
  /kakaotalk-scrap/i,
  /facebookexternalhit|facebot|meta-externalagent/i,
  /slackbot|slack-imgproxy/i,
  /twitterbot|telegrambot|discordbot|whatsapp|linkedinbot|skypeuripreview|line-poker/i,
  /yeti|daum(oa)?|naverbot/i, // 네이버·다음 수집기
  /bot\b|bot\/|crawl|spider|preview|scrap|headless/i,
  /^curl\/|^wget\/|python-requests|axios\/|node-fetch|go-http-client|okhttp/i,
];

export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua || ua.trim() === "") return true; // UA 없는 요청은 사람이 아니다
  return BOT_PATTERNS.some((re) => re.test(ua));
}

/** ?c=w → 공개 페이지에서 누른 것. 나머지는 카톡 등에서 바로 누른 것. */
export function clickChannel(searchParams: URLSearchParams): "web" | "direct" {
  return searchParams.get("c") === "w" ? "web" : "direct";
}

function kstDay(now: Date): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

export function visitorKey(ip: string, ua: string, now = new Date()): string {
  const salt = process.env.CLICK_HASH_SALT || "machstudio-brief";
  return createHash("sha256").update(`${salt}|${ip}|${ua}|${kstDay(now)}`).digest("hex").slice(0, 32);
}

export function clientIp(headers: Headers): string {
  return (headers.get("x-forwarded-for")?.split(",")[0] ?? headers.get("x-real-ip") ?? "").trim();
}
