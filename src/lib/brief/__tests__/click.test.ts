import { describe, expect, it } from "vitest";
import { clickChannel, isBotUserAgent, visitorKey } from "@/lib/brief/click";

describe("클릭으로 셀 요청인가", () => {
  /** 카톡에 올리는 순간 카카오 서버가 미리보기를 만들려고 연다 — 이건 사람이 아니다. */
  it("카카오 미리보기 봇은 뺀다", () => {
    expect(isBotUserAgent("facebookexternalhit/1.1; kakaotalk-scrap/1.0; +https://devtalk.kakao.com/")).toBe(true);
  });

  /** 사람이 카톡에서 누르면 인앱 브라우저 UA 에 KAKAOTALK 가 들어 있다. 이걸 빼면 제일 중요한 클릭이 사라진다. */
  it("카톡 인앱 브라우저는 센다", () => {
    const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5";
    expect(isBotUserAgent(ua)).toBe(false);
    const android = "Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.0.0 Mobile Safari/537.36;KAKAOTALK 2410850";
    expect(isBotUserAgent(android)).toBe(false);
  });

  it.each([
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "Twitterbot/1.0",
    "TelegramBot (like TwitterBot)",
    "Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)",
    "curl/8.4.0",
    "",
  ])("봇·도구 %s 는 뺀다", (ua) => {
    expect(isBotUserAgent(ua)).toBe(true);
  });

  it("일반 PC 크롬은 센다", () => {
    expect(isBotUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")).toBe(false);
  });
});

describe("유입 경로·방문자 키", () => {
  it("?c=w 는 공개 페이지, 나머지는 바로 누름", () => {
    expect(clickChannel(new URLSearchParams("c=w"))).toBe("web");
    expect(clickChannel(new URLSearchParams(""))).toBe("direct");
  });

  /** 같은 날 같은 사람은 하나, 날이 바뀌면 다른 키 — 날짜 너머로 사람을 추적하지 않는다. */
  it("KST 하루 단위로 묶인다", () => {
    const a = visitorKey("1.2.3.4", "UA", new Date("2026-09-22T01:00:00+09:00"));
    const b = visitorKey("1.2.3.4", "UA", new Date("2026-09-22T23:30:00+09:00"));
    const c = visitorKey("1.2.3.4", "UA", new Date("2026-09-23T00:10:00+09:00"));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toContain("1.2.3.4");
  });
});
