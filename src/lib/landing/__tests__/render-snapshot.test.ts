// @vitest-environment jsdom
/**
 * 웨비나 랜딩 렌더 결과 고정 — **리팩터 안전망**.
 *
 * 공용 페이지 껍데기(src/lib/page/)를 뽑아내는 동안 웨비나 랜딩이 조용히 달라지는 것을
 * 막으려고 둔다. 등록자가 붙어 있는 실서비스이고, 스크롤 효과·배경 모드처럼 **눈으로 봐야
 * 아는** 종류라 단위 테스트로는 안 걸린다. 그래서 출력 자체를 통째로 못박는다.
 *
 * 스냅샷이 깨지면 둘 중 하나다:
 *   · 리팩터가 렌더를 바꿨다 → 되돌린다.
 *   · 의도한 디자인 변경이다 → 무엇이 바뀌었는지 확인하고 스냅샷을 갱신한다.
 * 확인 없이 `-u` 로 갱신하면 이 파일은 존재 이유를 잃는다.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { mountLanding } from "@/lib/landing/mount";
import { LANDING_CSS } from "@/lib/landing/css";
import type { LandingWebinar } from "@/lib/landing/types";

/** 모든 섹션을 켠 웨비나 — 한 섹션이라도 비면 그 부분의 회귀를 못 잡는다. */
function fixture(overrides: Partial<LandingWebinar> = {}): LandingWebinar {
  return {
    id: "wb-fixture",
    name: "스냅샷 웨비나",
    slug: "snapshot-webinar",
    description: "리팩터 안전망용 고정 데이터",
    liveStartAt: "2026-08-11T05:00:00.000Z",
    theme: { primaryColor: "#ff8500" },
    status: "registration",
    entryOpen: false,
    canRegister: true,
    sessions: [
      {
        id: "s1", number: 1, type: "opening", title: "여는 인사",
        speaker: null, startTime: "14:00", endTime: "14:05",
      },
      {
        id: "s2", number: 2, type: "session", title: "미국 시장에서 통하는 브랜드",
        speaker: "김기동", speakerCompany: "Bitree",
        speakerPhotoUrl: "https://example.com/p.jpg", logoUrl: "https://example.com/l.png",
        description: "본문", speakerBio: "약력",
        speakerHomepage: "https://example.com",
        speakerLinks: ["https://instagram.com/x"],
        startTime: "14:05", endTime: "14:35",
      },
      {
        id: "s3", number: 3, type: "break", title: "BREAK TIME",
        speaker: null, startTime: "14:35", endTime: "14:40",
      },
    ],
    config: {
      landingPage: {
        enabled: true,
        heroMedia: { type: "image", url: "https://example.com/hero.jpg" },
        brand: "K-BRAND LA",
        titleLines: ["K-BRAND LA", "LAUNCH WEBINAR"],
        subtitle: "우리 브랜드는 LA에서 통할까?",
        venue: "ONLINE LIVE",
        ctaLabel: "사전 등록하기",
        colors: { lightBg: "#f6f8ff", darkBg: "#06080d" },
        sectionBg: {
          hero: "dark", intro: "light", sessions: "dark", programs: "light",
          audience: "dark", highlights: "light", join: "dark", faq: "light", sponsors: "dark",
        },
        intro: { enabled: true, title: "미국 시장 진출 전 점검 포인트", body: "본문\n두 번째 줄" },
        sessions: { enabled: true, detailPopup: true },
        timetable: { enabled: true },
        audience: {
          enabled: true, title: "이런 분들께 추천합니다",
          items: [{ icon: "", title: "수출 담당자", description: "설명" }],
        },
        programs: { enabled: true, items: [{ icon: "", title: "프로그램", description: "설명" }] },
        highlights: { enabled: true, title: "혜택", items: [{ title: "자료 제공", description: "설명" }] },
        join: { enabled: true, steps: [{ title: "등록", description: "설명" }] },
        faq: { enabled: true, items: [{ category: "일반", question: "질문", answer: "답변" }] },
        sponsors: {
          enabled: true, title: "주최 및 후원",
          items: [{ tier: "주최", name: "코리아엑스포", logoUrl: "https://example.com/s.png", url: "https://example.com" }],
        },
      },
    },
    ...overrides,
  };
}

function render(webinar: LandingWebinar, opts: { embedded?: boolean; isPreview?: boolean } = {}): string {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  const handle = mountLanding({
    mount, webinar,
    embedded: opts.embedded ?? false,
    isPreview: opts.isPreview ?? false,
    origin: "https://example.test",
  });
  const html = mount.innerHTML;
  handle.destroy();
  mount.remove();
  return html;
}

beforeAll(() => {
  // jsdom 에는 CSS.escape 가 없다(실제 브라우저에는 있다). 히어로 preload 가 이걸 쓰므로
  // 없으면 렌더 자체가 죽는다 — 제품 버그가 아니라 테스트 환경의 구멍이라 여기서 메운다.
  const cssObj = (globalThis as { CSS?: { escape?: (v: string) => string } }).CSS;
  const escape = (value: string) => value.split("\\").join("\\\\").split('"').join('\\"');
  if (!cssObj) (globalThis as { CSS?: unknown }).CSS = { escape };
  else if (!cssObj.escape) cssObj.escape = escape;
});

/** uid·랜덤 접두를 지워 실행 순서와 무관하게 비교 가능한 형태로 만든다. */
function stable(html: string): string {
  return html.replace(/lnd-u\d+/g, "lnd-uid").replace(/u\d+-/g, "uid-");
}

describe("웨비나 랜딩 렌더 — 리팩터 기준선", () => {
  it("단독 페이지 렌더가 그대로다", () => {
    expect(stable(render(fixture()))).toMatchSnapshot();
  });

  it("임베드 렌더가 그대로다", () => {
    expect(stable(render(fixture(), { embedded: true }))).toMatchSnapshot();
  });

  it("미리보기 렌더가 그대로다", () => {
    expect(stable(render(fixture(), { isPreview: true }))).toMatchSnapshot();
  });

  it("CSS 가 그대로다", () => {
    expect(LANDING_CSS).toMatchSnapshot();
  });
});
