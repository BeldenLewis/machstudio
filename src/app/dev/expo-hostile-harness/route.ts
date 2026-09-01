/**
 * 홈페이지 임베드 **적대적 CSS 하니스** — 개발 환경 전용(프로덕션 404).
 *
 * ── 왜 필요한가 ───────────────────────────────────────────────────────
 * 이 제품의 전부는 **남의 페이지 안에서 제대로 그려지는 것**이다. 아임웹 테마는 우리
 * 요소에 자기 규칙을 건다 — `*{margin:20px!important}`, `.ani{opacity:0}` 스크롤 리빌,
 * `html{direction:rtl}`, `body{display:flex}`, `*{transition:all!important}`.
 * `host-reset.ts` 의 선언은 하나하나 그런 실측 사고에 대응하는데, **정작 그 방어가
 * 브라우저에서 통하는지는 확인된 적이 없다.** jsdom 은 캐스케이드·상속을 계산하지 않아
 * 이 종류를 원리상 못 본다.
 *
 * `page.tsx` 가 아니라 `route.ts` 인 이유: React 는 컴포넌트가 렌더한 script 태그를
 * 실행하지 않는다. 임베드는 script 태그로 붙는 물건이라 생 HTML 이 실제 부착 환경에
 * 훨씬 가깝다(`/dev/landing-embed-harness` 와 같은 이유·같은 구조).
 *
 * ── DB 를 타지 않는다 ─────────────────────────────────────────────────
 * `/h/{pageId}` 는 실제 페이지가 있어야 하고 스키마 게이트도 열려 있어야 한다. 여기서
 * 보려는 것은 **런타임이 적대적 캐스케이드를 견디는가**뿐이라, 서버가 실제 `buildExpoPayload`
 * 로 페이로드를 굽고 런타임 번들을 그대로 인라인한다 — 실제 로더가 하는 일과 같다.
 *
 * ── 쓰는 법 ───────────────────────────────────────────────────────────
 *   /dev/expo-hostile-harness            공격 전부 켜짐(기본)
 *   /dev/expo-hostile-harness?attack=off 공격 없음 — 기준선
 *   /dev/expo-hostile-harness?rtl=1      html[dir=rtl] 까지
 * 두 화면의 측정값이 같아야 방어가 통한 것이다.
 */
import { NextResponse } from "next/server";
import { buildExpoPayload } from "@/lib/expo/payload";
import { EXPO_RUNTIME_JS } from "@/generated/expo-runtime";
import { EXPO_DEFAULT_THEME, normalizeExpoPage } from "@/lib/expo/config";
import type { ExpoSection } from "@/lib/expo/types";

const sid = (n: number) =>
  `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;

const SECTIONS: ExpoSection[] = [
  {
    sid: sid(1), type: "kv", variant: "column", enabled: true, embedEnabled: true,
    design: { bg: "light", align: "left" },
    content: {
      eyebrow: { ko: "KOREA EXPO LA 2026" },
      title: { ko: "빛의 시간" },
      subtitle: { ko: "10월 22일부터 사흘간, 로스앤젤레스 컨벤션 센터." },
      cta: { label: "참가 신청", href: "https://example.com/apply" },
    },
  },
  {
    sid: sid(2), type: "cardgrid", variant: "multicolumn", enabled: true, embedEnabled: true,
    design: { bg: "dark" },
    content: {
      heading: { ko: "프로그램" },
      items: [
        { tag: { ko: "무대" }, title: { ko: "커버댄스 경연" }, description: { ko: "예선과 본선." } },
        { tag: { ko: "전시" }, title: { ko: "브랜드관" }, description: { ko: "40개 부스." } },
        { tag: { ko: "체험" }, title: { ko: "푸드존" }, description: { ko: "8개 팀." } },
      ],
    },
  },
];

/**
 * 아임웹 테마가 실제로 하는 짓들. 각 줄은 `host-reset.ts`·`sheet.ts` 가 이름을 대어
 * 막고 있다고 적어 둔 사고에 **하나씩 대응한다** — 막았다고 적어 두기만 한 것과
 * 실제로 막히는 것은 다른 문제다.
 */
const HOSTILE_CSS = `
/* ① 전역 리셋 — 우리 박스의 여백·박스모델을 뒤집는다 */
*, *::before, *::after { box-sizing: content-box !important; }
div, section, p, h1, h2, h3, span, a, ul, li { margin: 24px !important; padding: 12px !important; }

/* ② 스크롤 리빌 — 자기 요소만 IO 로 푸는 테마. 우리는 영영 안 풀린다 */
div, section { opacity: 0; visibility: hidden; }
.ani, [class] { animation: hostileFade 8s both !important; }
@keyframes hostileFade { from { opacity: 0 } to { opacity: 0.02 } }

/* ③ 전역 전환 — iframe 자동높이가 중간값을 읽어 진동한다 */
* { transition: all 3s ease !important; }

/* ④ 변환·필터 — 포털의 컨테이닝 블록을 훔친다 */
div { transform: translateY(40px) rotate(2deg) !important; filter: grayscale(1) blur(1px) !important; }

/* ⑤ 타이포 상속 — 그림자 경계를 넘어온다 */
html, body { font-family: "Comic Sans MS", cursive !important; font-size: 29px !important;
             line-height: 3.3 !important; letter-spacing: 4px !important; color: #ff00ff !important;
             text-transform: uppercase !important; }

/* ⑥ 레이아웃 — body flex 는 static 호스트를 flex 항목으로 만든다 */
body { display: flex !important; flex-direction: column !important; }

/* ⑦ 쌓임·클리핑 */
.partner-wrap { position: relative; z-index: 9999; overflow: hidden; contain: layout paint; }

/* ⑧ 붙여넣은 자리와 내부 이름을 직접 노린다. 마운트 자리는 런타임의 인라인 리셋이,
   Shadow 경계 안쪽 이름은 격리가 막아야 한다. */
[data-mach-expo] {
  display: none !important; opacity: 0 !important; visibility: hidden !important;
  transform: translateY(80px) rotate(9deg) !important; filter: blur(4px) !important;
}
.msx-root, .msx-portal { display: none !important; opacity: 0 !important; }
`;

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const url = new URL(request.url);
  const attack = url.searchParams.get("attack") !== "off";
  const rtl = url.searchParams.get("rtl") === "1";

  // 실제 로더와 같은 함수로 굽는다 — 여기서만 다른 모양이면 확인의 뜻이 없다.
  const payload = {
    pageId: "hostile-harness",
    theme: EXPO_DEFAULT_THEME,
    origin: url.origin,
    sections: buildExpoPayload(normalizeExpoPage({ sections: SECTIONS }), { locale: "ko", pages: [], now: new Date() }).sections,
    mode: "preview-draft" as const,
  };

  const html = `<!doctype html>
<html lang="ko"${rtl ? ' dir="rtl"' : ""}><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>홈페이지 임베드 적대적 CSS 하니스</title>
<style>
  body { margin:0; background:#fff; color:#111; font:400 14px/1.6 -apple-system,sans-serif }
  .bar { padding:12px 16px; background:#111318; color:#e7ecf5; font-size:12px }
  .bar a { color:#a78bfa }
  .partner-wrap {
    max-width: 980px; margin: 0 auto; padding: 24px 12px;
    /* The harness keeps the mounting ancestor visible so the test isolates what
       the embed can defend: hostile rules aimed at the host and shadow tree. */
    opacity:1!important; visibility:visible!important; transform:none!important; filter:none!important;
  }
  .partner-note { font-size:12px; color:#666 }
</style>
${attack ? `<style id="hostile">${HOSTILE_CSS}</style>` : ""}
</head><body data-harness-kind="expo-hostile">
<div class="bar">
  적대적 CSS 하니스 — 공격 <b>${attack ? "켜짐" : "꺼짐(기준선)"}</b>${rtl ? " · <b>RTL</b>" : ""}
  · <a href="?attack=${attack ? "off" : "on"}${rtl ? "&rtl=1" : ""}">전환</a>
  · <a href="?attack=${attack ? "on" : "off"}&rtl=${rtl ? "0" : "1"}">RTL 전환</a>
</div>
<div class="partner-wrap" style="opacity:1!important;visibility:visible!important;transform:none!important;filter:none!important;animation:none!important;transition:none!important">
  <p class="partner-note">— 파트너 사이트 본문 (여기 위아래가 아임웹 콘텐츠) —</p>
  <div data-mach-expo></div>
  <p class="partner-note">— 파트너 사이트 본문 계속 —</p>
</div>
<script>${EXPO_RUNTIME_JS}
__msExpo.boot(${JSON.stringify(payload).replace(/</g, "\\u003c")}, document.currentScript);
</script>
</body></html>`;

  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
