// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { expoCustomCodeDigest } from "@/lib/expo/code-digest";

/**
 * 토큰 미리보기.
 *
 * 여기서 지키는 것 셋:
 *  · **밖으로 새지 않는다** — 모든 응답이 no-store·noindex 이고 남의 사이트가 감쌀 수 없다
 *  · **토큰 하나로 남의 사이트를 못 본다** — 요청한 페이지가 그 토큰의 사이트 것이어야 한다
 *  · **붙여넣은 코드는 그때 본 그 코드만** 실행된다(서버 계산 지문)
 */

const prismaMock = {
  expoSite: { findFirst: vi.fn() },
  collectSource: { findMany: vi.fn() },
};
const rateLimitAsync = vi.fn();
const probe = vi.fn();

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/ratelimit", () => ({
  getClientIp: () => "1.2.3.4",
  rateLimitAsync: (...args: unknown[]) => rateLimitAsync(...args),
}));
vi.mock("@/lib/expo/schema-probe", () => ({ probeExpoSchema: () => probe() }));

const SCHEMA_VERSION = "20260821-v1";
const CANONICAL = "https://machstudio.example.com";
const SID = "11111111-1111-1111-1111-111111111111";
const CODE_SID = "22222222-2222-2222-2222-222222222222";

const section = (over: Record<string, unknown> = {}) => ({
  sid: SID, type: "kv", variant: "column", enabled: true, embedEnabled: false,
  design: {}, content: { title: { ko: "초안 제목" } }, ...over,
});

const codeSection = (code: string) => ({
  sid: CODE_SID, type: "custom-code", variant: "boxed", enabled: true, embedEnabled: false,
  design: {}, content: { heading: { ko: "지도" }, code },
});

const site = (over: Record<string, unknown> = {}) => ({
  id: "s1", projectId: "p1", theme: { accent: "#1f3a5f" }, defaultLocale: "ko",
  pages: [{
    id: "pg1", isHome: true, sortOrder: 0,
    draft: { sections: [section()] },
    published: { sections: [section({ content: { title: { ko: "발행 제목" } } })] },
    imwebUrl: null, deletedAt: null,
  }],
  ...over,
});

async function get(query = "", token = "tok-1") {
  const { GET } = await import("@/app/hp/[token]/route");
  return GET(
    new Request(`${CANONICAL}/hp/${token}${query}`),
    { params: Promise.resolve({ token }) },
  );
}

/**
 * boot **호출 한 줄만** 잘라 낸다.
 *
 * 번들 자체가 우리 식별자를 문자열로 담고 있고, 문서 끝에는 정상적인 스크립트 닫는
 * 태그가 있다 — 범위를 정확히 좁혀야 무엇을 보고 있는지 알 수 있다.
 */
function bootArgs(html: string): string {
  const start = html.indexOf("__msExpo.boot(");
  expect(start).toBeGreaterThan(-1);
  const end = html.indexOf(", document.currentScript);", start);
  expect(end).toBeGreaterThan(start);
  return html.slice(start, end);
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("EXPO_SCHEMA_CAPABILITY", SCHEMA_VERSION);
  vi.stubEnv("EXPO_PUBLIC_EMBED_RELEASE", "");
  vi.stubEnv("EXPO_CANONICAL_PUBLIC_ORIGIN", CANONICAL);
  vi.stubEnv("NEXT_PUBLIC_CANONICAL_APP_URL", CANONICAL);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("VERCEL_URL", "");
  vi.stubEnv("VERCEL_BRANCH_URL", "");
  probe.mockResolvedValue(true);
  rateLimitAsync.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
  prismaMock.expoSite.findFirst.mockResolvedValue(site());
  prismaMock.collectSource.findMany.mockResolvedValue([]);
});

describe("게이트 순서", () => {
  /** 스키마 없는 배포에서 매 요청 DB 를 두드리면 커넥션 풀이 마른다(2026-08-11). */
  it("스키마 플래그가 틀리면 아무 일도 하지 않는다", async () => {
    vi.stubEnv("EXPO_SCHEMA_CAPABILITY", "");
    const res = await get();
    expect(res.status).toBe(404);
    expect(rateLimitAsync).not.toHaveBeenCalled();
    expect(probe).not.toHaveBeenCalled();
    expect(prismaMock.expoSite.findFirst).not.toHaveBeenCalled();
  });

  it("한도가 카탈로그·조회보다 먼저다", async () => {
    rateLimitAsync.mockResolvedValue({ allowed: false, retryAfterMs: 5000 });
    const res = await get();
    expect(res.status).toBe(429);
    expect(probe).not.toHaveBeenCalled();
    expect(prismaMock.expoSite.findFirst).not.toHaveBeenCalled();
  });

  it("테이블이 아직 없으면 델리게이트를 부르지 않는다", async () => {
    probe.mockResolvedValue(false);
    expect((await get()).status).toBe(404);
    expect(prismaMock.expoSite.findFirst).not.toHaveBeenCalled();
  });

  /** 미리보기는 **공개 승인과 무관하다** — 승인은 밖으로 내보내는 것에만 걸린다. */
  it("공개 승인이 꺼져 있어도 미리보기는 열린다", async () => {
    expect((await get()).status).toBe(200);
  });

  it("공개 주소 설정이 잘못되면 503 이다", async () => {
    vi.stubEnv("EXPO_CANONICAL_PUBLIC_ORIGIN", "");
    const res = await get();
    expect(res.status).toBe(503);
    expect(prismaMock.expoSite.findFirst).not.toHaveBeenCalled();
  });
});

describe("응답 헤더", () => {
  /** 발행 전 초안이 검색에 걸리거나 CDN 에 남으면 그건 유출이다. */
  it("모든 응답이 새지 않는 헤더를 갖는다", async () => {
    const cases = [
      await get(),
      await (async () => { prismaMock.expoSite.findFirst.mockResolvedValue(null); return get(); })(),
    ];
    for (const res of cases) {
      expect(res.headers.get("Cache-Control")).toBe("private, no-store");
      expect(res.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
      expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
      expect(res.headers.get("Content-Security-Policy")).toBe("frame-ancestors 'self'");
    }
  });

  it("한도·설정 오류 응답도 같은 헤더를 갖는다", async () => {
    rateLimitAsync.mockResolvedValue({ allowed: false, retryAfterMs: 5000 });
    const res = await get();
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });
});

describe("토큰과 페이지 소속", () => {
  it("없는 토큰은 404 이고 문구에 토큰을 넣지 않는다", async () => {
    prismaMock.expoSite.findFirst.mockResolvedValue(null);
    const res = await get("", "tok-secret");
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("tok-secret");
  });

  /** 아니면 토큰 하나로 남의 사이트 초안을 열 수 있다. */
  it("이 토큰의 사이트가 아닌 페이지는 404", async () => {
    expect((await get("?page=pg-other")).status).toBe(404);
  });

  it("페이지를 안 주면 홈을 그린다", async () => {
    const args = bootArgs(await (await get()).text());
    expect(args).toContain('"pageId":"pg1"');
  });

  it("페이지가 하나도 없으면 404", async () => {
    prismaMock.expoSite.findFirst.mockResolvedValue(site({ pages: [] }));
    expect((await get()).status).toBe(404);
  });

  it("조회가 실패하면 503", async () => {
    prismaMock.expoSite.findFirst.mockRejectedValue(new Error("down"));
    expect((await get()).status).toBe(503);
  });
});

describe("초안과 발행본", () => {
  it("기본은 초안이다", async () => {
    const args = bootArgs(await (await get()).text());
    expect(args).toContain("초안 제목");
    expect(args).toContain('"mode":"preview-draft"');
  });

  it("published=1 이면 발행본이다", async () => {
    const args = bootArgs(await (await get("?published=1")).text());
    expect(args).toContain("발행 제목");
    expect(args).toContain('"mode":"preview-published"');
  });

  /** 아직 안 켠 것을 보려고 여는 화면이다 — 공개 스위치를 요구하지 않는다. */
  it("liveAt·embedEnabled 를 요구하지 않는다", async () => {
    prismaMock.expoSite.findFirst.mockResolvedValue(site({
      pages: [{
        id: "pg1", isHome: true, sortOrder: 0,
        draft: { sections: [section({ enabled: true, embedEnabled: false })] },
        published: null, imwebUrl: null, deletedAt: null,
      }],
    }));
    const args = bootArgs(await (await get()).text());
    expect(args).toContain("초안 제목");
  });

  /**
   * `enabled` 는 **본다.** 공개 로더가 그 기준으로 거르므로(`renderableSections`),
   * 여기서만 보여 주면 꺼 놓은 구획이 미리보기에는 있고 발행본에는 없다.
   * 편집기에 그 스위치가 붙은 뒤로 실제로 누를 수 있는 경로다.
   */
  it("페이지에 표시를 끈 구획은 미리보기에도 안 나온다", async () => {
    prismaMock.expoSite.findFirst.mockResolvedValue(site({
      pages: [{
        id: "pg1", isHome: true, sortOrder: 0,
        draft: { sections: [section({ enabled: false })] },
        published: null, imwebUrl: null, deletedAt: null,
      }],
    }));
    const args = bootArgs(await (await get()).text());
    expect(args).not.toContain("초안 제목");
  });

  /** 부작용 판정은 mode 에서 온다 — 미리보기는 저장도 추적도 하지 않는다. */
  it("미리보기 mode 가 라이브가 되는 경로가 없다", async () => {
    for (const query of ["", "?published=1", "?container=wide", "?customCode=run"]) {
      const args = bootArgs(await (await get(query)).text());
      expect(args).toContain('"mode":"preview-');
      expect(args).not.toContain('"mode":"live"');
    }
  });
});

describe("컨테이너 폭", () => {
  /** 아임웹 콘텐츠 폭 흉내 — 실측 1410/1440·360/390. */
  it("기본은 표준 폭이다", async () => {
    expect(await (await get()).text()).toContain("width:calc(100% - 30px);margin:0 auto");
  });

  it("wide 는 전폭이다", async () => {
    const html = await (await get("?container=wide")).text();
    expect(html).toContain('style="width:100%"');
    expect(html).not.toContain("calc(100% - 30px)");
  });

  it("모르는 값은 표준으로 떨어진다", async () => {
    expect(await (await get("?container=nope")).text()).toContain("calc(100% - 30px)");
  });
});

describe("문서 껍데기", () => {
  /** 미리보기용 렌더러를 따로 만들면 두 벌이 갈라진다 — 보이는 것이 나가는 것이어야 한다. */
  it("커밋된 실제 임베드 번들을 그대로 싣는다", async () => {
    const { EXPO_RUNTIME_JS } = await import("@/generated/expo-runtime");
    const html = await (await get()).text();
    expect(html).toContain(EXPO_RUNTIME_JS);
    expect(html).toContain("<div data-mach-expo></div>");
  });

  /** 서체는 런타임이 FontFace 로 등록한다 — head 에 링크를 두면 두 경로가 된다. */
  it("head 에 스타일·폰트 링크가 없다", async () => {
    const html = await (await get()).text();
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head).not.toContain("<link");
    expect(head).not.toContain("<style");
  });

  /** 번들이 인라인 스크립트를 조기에 닫으면 문서 나머지가 통째로 깨진다. */
  it("번들이 인라인 스크립트를 조기에 닫지 않는다", async () => {
    const html = await (await get()).text();
    const open = html.indexOf("<script>");
    const close = html.indexOf("</" + "script>", open);
    const inline = html.slice(open + "<script>".length, close);
    expect(inline).toContain("__msExpo.boot(");
    expect(inline).not.toContain("</" + "script");
  });

  it("payload 의 꺾쇠를 이스케이프한다", async () => {
    prismaMock.expoSite.findFirst.mockResolvedValue(site({
      pages: [{
        id: "pg1", isHome: true, sortOrder: 0,
        draft: { sections: [section({ content: { title: { ko: "</" + "script><script>alert(1)" } } })] },
        published: null, imwebUrl: null, deletedAt: null,
      }],
    }));
    const args = bootArgs(await (await get()).text());
    expect(args).not.toContain("</" + "script");
    expect(args).toContain("\\u003C");
  });
});

describe("붙여넣은 코드 실행 허가", () => {
  const withCode = (code: string) => site({
    pages: [{
      id: "pg1", isHome: true, sortOrder: 0,
      draft: { sections: [codeSection(code)] },
      published: null, imwebUrl: null, deletedAt: null,
    }],
  });

  const digestOf = (code: string) => expoCustomCodeDigest([{
    sid: CODE_SID, type: "custom-code", variant: "boxed", enabled: true, embedEnabled: false,
    design: {}, content: { code },
  }]);

  it("기본은 실행하지 않는다", async () => {
    prismaMock.expoSite.findFirst.mockResolvedValue(withCode("<div>지도</div>"));
    expect(bootArgs(await (await get()).text())).toContain('"allowCustomCode":false');
  });

  it("지문이 정확히 맞으면 실행한다", async () => {
    const code = "<div>지도</div>";
    prismaMock.expoSite.findFirst.mockResolvedValue(withCode(code));
    const args = bootArgs(await (await get(`?customCode=run&codeDigest=${digestOf(code)}`)).text());
    expect(args).toContain('"allowCustomCode":true');
    // 편집기가 그 후보에 대해서만 발행을 열 수 있게 지문을 되돌려 준다.
    expect(args).toContain(`"codeDigest":"${digestOf(code)}"`);
  });

  /**
   * **핵심.** 코드를 바꾼 뒤에도 옛 허가가 남으면, 확인하지 않은 스크립트가 도는
   * 상태로 발행까지 갈 수 있다.
   */
  it("지문이 낡았으면 실행하지 않는다", async () => {
    prismaMock.expoSite.findFirst.mockResolvedValue(withCode("<div>바뀐 지도</div>"));
    const stale = digestOf("<div>지도</div>");
    expect(bootArgs(await (await get(`?customCode=run&codeDigest=${stale}`)).text()))
      .toContain('"allowCustomCode":false');
  });

  it("지문이 없으면 실행하지 않는다", async () => {
    prismaMock.expoSite.findFirst.mockResolvedValue(withCode("<div>지도</div>"));
    expect(bootArgs(await (await get("?customCode=run")).text()))
      .toContain('"allowCustomCode":false');
  });

  /** 제목만 고쳐도 다시 "실행" 을 눌러야 하면 못 쓴다. */
  it("코드가 같으면 다른 편집은 지문을 바꾸지 않는다", () => {
    const a = expoCustomCodeDigest([{ sid: CODE_SID, type: "custom-code", variant: "boxed", enabled: true, embedEnabled: false, design: {}, content: { heading: { ko: "지도" }, code: "<b>x</b>" } }]);
    const b = expoCustomCodeDigest([{ sid: CODE_SID, type: "custom-code", variant: "full", enabled: false, embedEnabled: true, design: { bg: "dark" }, content: { heading: { ko: "위치" }, code: "<b>x</b>" } }]);
    expect(a).toBe(b);
  });

  it("코드 구획이 없으면 지문도 없다", () => {
    expect(expoCustomCodeDigest([])).toBe("");
  });
});

describe("편집기 통로", () => {
  it("채널이 있으면 부모 오리진과 함께 싣는다", async () => {
    const args = bootArgs(await (await get("?channel=abc123")).text());
    expect(args).toContain('"channel":"abc123"');
    expect(args).toContain(`"parentOrigin":"${CANONICAL}"`);
  });

  /** 직접 URL 로 열어 본 경우 — 부모가 없으니 통로를 붙일 이유가 없다. */
  it("채널이 없으면 통로를 붙이지 않는다", async () => {
    const args = bootArgs(await (await get()).text());
    expect(args).not.toContain("parentOrigin");
    expect(args).not.toContain('"channel"');
  });
});

describe("사전등록 소스 확인", () => {
  /** 미리보기에서 남의 전시 폼이 뜨면 안 된다. */
  it("다른 프로젝트의 소스는 비운다", async () => {
    prismaMock.expoSite.findFirst.mockResolvedValue(site({
      pages: [{
        id: "pg1", isHome: true, sortOrder: 0,
        draft: { sections: [{ sid: SID, type: "register-form", variant: "inline", enabled: true, embedEnabled: false, design: {}, content: { sourceRef: "src-other" } }] },
        published: null, imwebUrl: null, deletedAt: null,
      }],
    }));
    prismaMock.collectSource.findMany.mockResolvedValue([]);
    expect(bootArgs(await (await get()).text())).not.toContain("src-other");
    expect(prismaMock.collectSource.findMany.mock.calls[0][0].where).toMatchObject({
      projectId: "p1", deletedAt: null, mode: "builder",
    });
  });
});
