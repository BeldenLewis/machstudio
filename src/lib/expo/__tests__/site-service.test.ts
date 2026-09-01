import { describe, expect, it } from "vitest";
import { EXPO_LIMITS } from "@/lib/expo/registry";
import {
  pageSummary, prepareDeletePage, prepareDraftWrite, prepareLiveToggle,
  prepareNewPage, preparePublish, prepareReorder, serviceStatus, type PageRow,
} from "@/lib/expo/site-service";
import { guardWriteOrigin, originGuardStatus } from "@/lib/expo/origin";

/**
 * 변경 규칙 — 라우트가 아니라 여기 모아 둔다.
 * 규칙이 라우트에 흩어지면 "홈이 삭제됐다"·"순서가 어긋났다" 가 한 경로에서만 막힌다.
 */

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const row = (over: Partial<PageRow> = {}): PageRow => ({
  id: "p1", slug: "home", title: "홈", isHome: true,
  sortOrder: 0, draftRevision: 0, deletedAt: null, ...over,
});

describe("draft 저장 — 비교-교환", () => {
  it("읽은 번호가 맞으면 저장하고 번호를 올린다", () => {
    const r = prepareDraftWrite({ draftRevision: 3 }, 3, {
      sections: [{ sid: uid(1), type: "textblock", variant: "prose", content: { body: "본문" } }],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.draftRevision).toBe(4);
      expect(r.value.draft.sections).toHaveLength(1);
    }
  });

  /**
   * 두 탭에서 같은 페이지를 편집하면 나중 저장이 앞 저장을 조용히 덮는다.
   * 409 로 막고 **최신 번호를 함께** 돌려준다 — 화면이 그걸로 다시 읽는다.
   */
  it("그 사이 다른 곳에서 저장했으면 막고 최신 번호를 준다", () => {
    const r = prepareDraftWrite({ draftRevision: 5 }, 3, { sections: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.kind).toBe("conflict");
      if (r.error.kind === "conflict") expect(r.error.currentRevision).toBe(5);
      expect(serviceStatus(r.error)).toBe(409);
    }
  });

  it("저장되는 것은 항상 정규화를 통과한 값이다", () => {
    const r = prepareDraftWrite({ draftRevision: 0 }, 0, {
      sections: [{ sid: "형식아님", type: "textblock", variant: "prose", content: { body: "x" } }],
    });
    if (r.ok) expect(r.value.draft.sections).toEqual([]);
  });
});

describe("발행", () => {
  it("draft 를 서버가 다시 정규화해 굳힌다", () => {
    const out = preparePublish({ draft: {
      sections: [
        { sid: uid(1), type: "textblock", variant: "prose", content: { body: "본문" } },
        { sid: uid(2), type: "정체불명", variant: "x" },
      ],
    } });
    expect(out.published.sections).toHaveLength(1);
    expect(out.publishedAt).toBeInstanceOf(Date);
  });

  /**
   * 발행은 draftRevision 을 건드리지 않는다 — 같은 번호를 공유하면 자동저장이 도는 중에
   * 발행이 충돌로 막힌다.
   */
  it("발행 결과에 draftRevision 이 없다", () => {
    const out = preparePublish({ draft: { sections: [] } });
    expect(out).not.toHaveProperty("draftRevision");
  });
});

describe("공개 스위치", () => {
  it("발행본이 있으면 켤 수 있다", () => {
    const r = prepareLiveToggle({ published: { sections: [] } }, true);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.liveAt).toBeInstanceOf(Date);
  });

  /** 발행본 없이 켜면 빈 화면이 나간다. */
  it("발행본이 없으면 켤 수 없다", () => {
    expect(prepareLiveToggle({ published: null }, true).ok).toBe(false);
  });

  it("끄는 것은 언제나 된다 — 되돌리기를 막으면 안 된다", () => {
    const r = prepareLiveToggle({ published: null }, false);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.liveAt).toBeNull();
  });
});

describe("페이지 추가", () => {
  it("slug 가 겹치면 번호를 붙이고 홈 뒤에 놓는다", () => {
    const r = prepareNewPage([row(), row({ id: "p2", slug: "안내", isHome: false, sortOrder: 1 })], { title: "안내" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.slug).toBe("안내-2");
      expect(r.value.sortOrder).toBe(2);
      expect(r.value.isHome).toBe(false);
    }
  });

  it("상한을 넘으면 거절한다", () => {
    const many = Array.from({ length: EXPO_LIMITS.activePagesPerSite }, (_, i) =>
      row({ id: `p${i}`, slug: `s${i}`, isHome: i === 0, sortOrder: i }));
    const r = prepareNewPage(many, { title: "하나 더" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(serviceStatus(r.error)).toBe(422);
  });

  it("지워진 페이지는 개수에 세지 않는다", () => {
    const deleted = Array.from({ length: EXPO_LIMITS.activePagesPerSite }, (_, i) =>
      row({ id: `d${i}`, slug: `d${i}`, isHome: false, deletedAt: new Date() }));
    expect(prepareNewPage([row(), ...deleted], { title: "새 페이지" }).ok).toBe(true);
  });
});

describe("순서 재배치 — 홈은 항상 맨 위", () => {
  const pages = [
    row({ id: "home", slug: "home", isHome: true, sortOrder: 0 }),
    row({ id: "a", slug: "a", isHome: false, sortOrder: 1 }),
    row({ id: "b", slug: "b", isHome: false, sortOrder: 2 }),
  ];

  it("보낸 순서를 반영한다", () => {
    const r = prepareReorder(pages, ["home", "b", "a"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual([
      { id: "home", sortOrder: 0 }, { id: "b", sortOrder: 1 }, { id: "a", sortOrder: 2 },
    ]);
  });

  /** 홈을 아래로 끌어내린 목록이 와도 도로 맨 위로 — 사이트의 첫 화면이다. */
  it("홈을 아래로 보내려 해도 맨 위로 되돌린다", () => {
    const r = prepareReorder(pages, ["a", "b", "home"]);
    if (r.ok) expect(r.value[0].id).toBe("home");
  });

  /** 목록이 잘려 와도 페이지가 사라지면 안 된다. */
  it("빠뜨린 페이지는 뒤에 원래 순서대로 붙인다", () => {
    const r = prepareReorder(pages, ["b"]);
    if (r.ok) expect(r.value.map((p) => p.id)).toEqual(["home", "b", "a"]);
  });

  it("모르는 id 나 중복이 섞이면 거절한다", () => {
    expect(prepareReorder(pages, ["home", "없는id"]).ok).toBe(false);
    expect(prepareReorder(pages, ["a", "a"]).ok).toBe(false);
  });
});

describe("삭제", () => {
  it("홈은 지울 수 없다", () => {
    const r = prepareDeletePage({ isHome: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("home-locked");
  });

  it("일반 페이지는 소프트 삭제 — 되돌릴 수 있다", () => {
    const r = prepareDeletePage({ isHome: false });
    if (r.ok) expect(r.value.deletedAt).toBeInstanceOf(Date);
  });
});

describe("목록 응답 — draft 를 싣지 않는다", () => {
  /**
   * 사이트 하나에 페이지가 50개까지다. 목록에 draft 를 담으면 응답이 수 MB 가 되고
   * 편집기는 그걸 쓰지도 않는다(선택한 페이지만 따로 읽는다).
   */
  it("요약에는 draft 가 없다", () => {
    const summary = pageSummary({
      ...row(), published: { sections: [{ sid: uid(1) }] }, liveAt: null, imwebUrl: null,
    } as Parameters<typeof pageSummary>[0]);
    expect(summary).not.toHaveProperty("draft");
    expect(summary).not.toHaveProperty("published");
    // 상태 판정에 필요한 최소 정보만.
    expect(summary.hasPublished).toBe(true);
  });
});

describe("쓰기 출처 가드 — 인증보다 먼저", () => {
  const req = (headers: Record<string, string>) => ({
    headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
  });

  it("우리 화면에서 온 JSON 은 통과", () => {
    expect(guardWriteOrigin(req({ "sec-fetch-site": "same-origin", "content-type": "application/json" })).ok).toBe(true);
  });

  it("명시적으로 허용한 legacy multipart만 같은 출처에서 통과", () => {
    const multipart = req({ "sec-fetch-site": "same-origin", "content-type": "multipart/form-data; boundary=x" });
    expect(guardWriteOrigin(multipart).ok).toBe(false);
    expect(guardWriteOrigin(multipart, [], ["multipart/form-data"]).ok).toBe(true);
    expect(guardWriteOrigin(
      req({ "sec-fetch-site": "cross-site", "content-type": "multipart/form-data; boundary=x" }),
      [], ["multipart/form-data"],
    ).ok).toBe(false);
  });

  /**
   * 쿠키는 브라우저가 자동으로 붙는다. 다른 사이트가 로그인한 운영자의 브라우저를 시켜
   * 우리 API 를 부르면 그 요청도 인증을 통과한다 — 발행·공개 스위치를 다루는 API 라
   * 그 한 번이 전시 홈페이지를 밖으로 내보낼 수 있다.
   */
  it("다른 사이트에서 온 요청은 막는다", () => {
    const r = guardWriteOrigin(req({ "sec-fetch-site": "cross-site", "content-type": "application/json" }));
    expect(r.ok).toBe(false);
    if (r.failure) expect(originGuardStatus(r.failure)).toBe(403);
  });

  /** 폼 전송 형식은 프리플라이트 없이 교차 출처로 날아온다. */
  it("JSON 이 아닌 본문은 거절한다", () => {
    for (const ct of ["text/plain", "multipart/form-data", "application/x-www-form-urlencoded", ""]) {
      const r = guardWriteOrigin(req({ "sec-fetch-site": "same-origin", "content-type": ct }));
      expect(r.ok).toBe(false);
      if (r.failure) expect(originGuardStatus(r.failure)).toBe(415);
    }
  });

  /**
   * **본문 없는 쓰기를 막으면 안 된다.**
   *
   * `fetch(url, { method: "DELETE" })` 에는 브라우저가 content-type 을 붙이지 않는다.
   * 이걸 JSON 만 허용으로 두었더니 트리의 페이지 삭제가 항상 415 였다 — 라우트 테스트가
   * 헤더를 손으로 붙여 보내서 아무도 못 봤다.
   *
   * 안전한 이유: `<form>` 은 content-type 을 **생략할 수 없고**(위 세 형식 중 하나를 반드시
   * 붙인다), 본문 없는 교차 출처 DELETE 는 CORS 프리플라이트를 타는데 우리는 응답하지 않는다.
   * 즉 위조 가능한 요청은 전부 형식을 달고 온다 — 위 케이스에서 걸린다.
   */
  it("본문 없는 쓰기(형식 헤더 없음)는 통과한다", () => {
    expect(guardWriteOrigin(req({ "sec-fetch-site": "same-origin" })).ok).toBe(true);
  });

  /** 본문이 없어도 교차 출처면 여전히 막는다 — 완화한 것은 형식 검사뿐이다. */
  it("본문이 없어도 다른 사이트면 막는다", () => {
    expect(guardWriteOrigin(req({ "sec-fetch-site": "cross-site" })).ok).toBe(false);
    expect(guardWriteOrigin(
      req({ origin: "https://남의사이트.test" }), ["https://machstudio.vercel.app"],
    ).ok).toBe(false);
  });

  /**
   * 실제 브라우저 Request 로 확인한다 — 위 `req()` 는 우리가 만든 가짜라
   * "브라우저가 헤더를 정말 안 붙이는가" 를 증명하지 못한다.
   */
  it("실제 Request 객체: 본문 없는 DELETE 는 형식 헤더가 없다", () => {
    const real = new Request("https://machstudio.vercel.app/api/expo/pages/p1", { method: "DELETE" });
    expect(real.headers.get("content-type")).toBeNull();
    // sec-fetch-site 는 브라우저가 붙이는 값이라 여기서는 없다 — 그 경로도 통과해야 한다.
    expect(guardWriteOrigin(real).ok).toBe(true);
  });

  it("Sec-Fetch-Site 가 없으면 Origin 으로 본다", () => {
    expect(guardWriteOrigin(
      req({ origin: "https://남의사이트.test", "content-type": "application/json" }),
      ["https://machstudio.vercel.app"],
    ).ok).toBe(false);

    expect(guardWriteOrigin(
      req({ origin: "https://machstudio.vercel.app", "content-type": "application/json" }),
      ["https://machstudio.vercel.app"],
    ).ok).toBe(true);
  });
});
