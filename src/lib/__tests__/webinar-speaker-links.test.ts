import { describe, expect, it } from "vitest";
import {
  normalizeSpeakerLinks,
  parseSpeakerLink,
  serializeSpeakerLinks,
  SPEAKER_LINKS_MAX,
} from "@/lib/webinar-speaker-links";

/**
 * 연사 SNS 링크 — 저장 형태는 **URL 문자열 배열**이고, 플랫폼은 저장하지 않고 호스트로 판정한다.
 *
 * 왜 그렇게 했나: 운영자가 붙여넣는 건 링크뿐이다. "플랫폼 선택 + URL" 두 칸으로 두면 값 하나에
 * 손이 두 번 가고, 라벨은 LinkedIn 인데 주소는 인스타인 행이 생긴다. 그 결정 때문에 판정 로직이
 * 유일한 진실이 되므로 여기서 규칙을 고정한다.
 *
 * 보안: 랜딩은 **남의 사이트에 붙는다**. javascript:·data: 가 href 에 닿으면 안 되고,
 * 이 함수가 첫 번째 관문이다(랜딩 DOM 빌더의 setAttrSafe 가 두 번째).
 */

describe("스킴 — 절대 http(s) 만 통과", () => {
  it("javascript:·data: 는 링크가 되지 않는다 — 랜딩 href 에 닿으면 클릭 가능한 위험이 된다", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox",
      "file:///etc/passwd",
    ]) {
      expect(parseSpeakerLink(bad), bad).toBeNull();
    }
  });

  it("상대 경로·프로토콜 없는 주소도 버린다 — 남의 사이트에서 그 경로는 우리 것이 아니다", () => {
    for (const bad of ["/about", "linkedin.com/in/me", "www.example.com", ""]) {
      expect(parseSpeakerLink(bad), bad).toBeNull();
    }
  });

  it("http·https 는 통과한다", () => {
    expect(parseSpeakerLink("https://example.com")?.url).toBe("https://example.com");
    expect(parseSpeakerLink("http://example.com")?.url).toBe("http://example.com");
  });
});

describe("플랫폼 판정 — 호스트에서 뽑는다", () => {
  const kindOf = (url: string) => parseSpeakerLink(url)?.kind;

  it("아는 플랫폼은 정식 표기로 라벨이 붙는다", () => {
    expect(parseSpeakerLink("https://www.linkedin.com/in/me")).toMatchObject({ kind: "linkedin", label: "LinkedIn" });
    expect(parseSpeakerLink("https://instagram.com/me")).toMatchObject({ kind: "instagram", label: "Instagram" });
    expect(parseSpeakerLink("https://brunch.co.kr/@me")).toMatchObject({ kind: "brunch", label: "브런치" });
  });

  it("한 플랫폼의 호스트가 여러 개면 같은 kind 로 모인다 — 아이콘이 갈라지지 않게", () => {
    expect(kindOf("https://x.com/me")).toBe("x");
    expect(kindOf("https://twitter.com/me")).toBe("x");
    expect(kindOf("https://youtube.com/@me")).toBe("youtube");
    expect(kindOf("https://youtu.be/abc")).toBe("youtube");
  });

  it("하위 도메인·접두도 같은 플랫폼으로 본다 — kr.linkedin.com 이 남이 되면 안 된다", () => {
    expect(kindOf("https://kr.linkedin.com/in/me")).toBe("linkedin");
    expect(kindOf("https://blog.naver.com/me")).toBe("naver");
  });

  /**
   * 목록에 없는 곳이 많다(개인 블로그·기업 채용 페이지). 버리면 운영자가 넣은 링크가
   * 조용히 사라지므로, 호스트명을 라벨로 써서 남긴다.
   */
  it("모르는 호스트는 버리지 않고 호스트명을 라벨로 쓴다", () => {
    expect(parseSpeakerLink("https://www.exporum.com/team")).toMatchObject({ kind: "link", label: "exporum.com" });
    expect(parseSpeakerLink("https://내블로그.kr")?.kind).toBe("link");
  });

  it("호스트 접미가 '겹쳐 보이는' 도메인을 오판하지 않는다 — notlinkedin.com 은 LinkedIn 이 아니다", () => {
    expect(kindOf("https://notlinkedin.com/me")).toBe("link");
    expect(kindOf("https://linkedin.com.evil.example/me")).toBe("link");
  });
});

describe("목록 정규화 — 저장 직전", () => {
  it("빈 값·잘못된 스킴을 떨어뜨리고 순서를 지킨다 — 운영자가 정한 노출 순서다", () => {
    const links = normalizeSpeakerLinks([
      "https://linkedin.com/in/me",
      "",
      "javascript:alert(1)",
      "https://instagram.com/me",
      null,
    ]);
    expect(links.map((l) => l.kind)).toEqual(["linkedin", "instagram"]);
  });

  it("같은 URL 은 한 번만 — 붙여넣기를 두 번 해도 아이콘이 겹치지 않는다", () => {
    const links = normalizeSpeakerLinks(["https://x.com/me", "https://x.com/me"]);
    expect(links).toHaveLength(1);
  });

  /**
   * 끝 슬래시 차이는 **합치지 않는다**. 더 공격적으로 경로를 정규화하면 운영자가 의도한
   * 다른 페이지(프로필 vs 특정 글)를 하나로 뭉갠다.
   */
  it("경로가 다르면 다른 링크로 남긴다 — 프로필과 글을 하나로 뭉개지 않는다", () => {
    const links = normalizeSpeakerLinks(["https://brunch.co.kr/@me", "https://brunch.co.kr/@me/12"]);
    expect(links).toHaveLength(2);
  });

  it("상한을 넘으면 앞에서 자른다 — 아이콘 줄이 두 줄로 넘치면 모달 밑이 무거워진다", () => {
    const many = Array.from({ length: SPEAKER_LINKS_MAX + 3 }, (_, i) => `https://example.com/${i}`);
    expect(normalizeSpeakerLinks(many)).toHaveLength(SPEAKER_LINKS_MAX);
  });

  it("배열이 아니면 빈 목록 — 옛 값이나 손으로 고친 config 가 와도 터지지 않는다", () => {
    for (const bad of [undefined, null, "https://x.com/me", 42, {}]) {
      expect(normalizeSpeakerLinks(bad), JSON.stringify(bad)).toEqual([]);
    }
  });

  it("{ url } 객체 형태도 읽는다 — 손으로 고친 값·옛 형태 호환", () => {
    expect(normalizeSpeakerLinks([{ url: "https://github.com/me" }]).map((l) => l.kind)).toEqual(["github"]);
  });
});

describe("저장 형태 — URL 배열, 비면 null", () => {
  it("URL 문자열만 담는다 — 라벨을 같이 저장하면 주소와 어긋난 행이 생긴다", () => {
    expect(serializeSpeakerLinks(["https://x.com/me", "https://github.com/me"])).toEqual([
      "https://x.com/me",
      "https://github.com/me",
    ]);
  });

  it("남는 링크가 없으면 null — 컬럼을 빈 배열로 채우지 않는다", () => {
    expect(serializeSpeakerLinks([])).toBeNull();
    expect(serializeSpeakerLinks(["javascript:alert(1)"])).toBeNull();
    expect(serializeSpeakerLinks(undefined)).toBeNull();
  });
});
