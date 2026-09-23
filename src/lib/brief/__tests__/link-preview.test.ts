import { describe, expect, it } from "vitest";
import { isBlockedAddress, parsePreview } from "@/lib/brief/link-preview";

/**
 * 서버가 운영자가 넣은 주소를 대신 연다. 내부망으로 가는 요청을 막는 게 이 파일의 첫 번째 일이다.
 */
describe("내부 주소 차단(SSRF)", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.0.10",
    "169.254.169.254", // 클라우드 메타데이터
    "0.0.0.0", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1",
  ])("%s 는 막는다", (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "211.234.10.1", "172.32.0.1", "2606:4700::1111"])("%s 는 통과", (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});

describe("제목·사이트명 추출", () => {
  it("og 태그가 우선이다", () => {
    const html = `<html><head><title>무시될 제목</title>
      <meta property="og:title" content="K게임 상반기 해외매출 6조">
      <meta property="og:site_name" content="서울경제"></head></html>`;
    expect(parsePreview(html, "https://www.sedaily.com/a")).toEqual({ title: "K게임 상반기 해외매출 6조", siteName: "서울경제" });
  });

  /** 사이트마다 속성 순서가 다르다 — content 가 먼저 와도 읽어야 한다. */
  it("content 가 먼저 오는 순서도 읽는다", () => {
    const html = `<meta content="공고 제목" property="og:title">`;
    expect(parsePreview(html, "https://a.go.kr/x").title).toBe("공고 제목");
  });

  it("og 가 없으면 <title>, 사이트명이 없으면 호스트", () => {
    const html = `<title> 2026년 수출물류비 지원사업 &amp; 모집 </title>`;
    expect(parsePreview(html, "https://www.ttp.org/n")).toEqual({
      title: "2026년 수출물류비 지원사업 & 모집",
      siteName: "ttp.org",
    });
  });

  it("HTML 엔티티를 푼다", () => {
    const html = `<meta property="og:title" content="&quot;K-뷰티&quot; &#8216;헤어&#8217;">`;
    expect(parsePreview(html, "https://a.kr").title).toBe(`"K-뷰티" ‘헤어’`);
  });
});
