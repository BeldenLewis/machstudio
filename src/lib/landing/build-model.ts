/**
 * 랜딩 파생 모델 빌더 — 원본 LandingContent 상단의 계산을 전부 여기로 옮겼다.
 *
 * 왜 분리했는가: 단독 페이지 / 어드민 미리보기 / 외부 사이트 임베드가 같은 마크업을 공유하는데,
 * 파생 계산이 뷰에 섞여 있으면 세 경로가 조금씩 다른 결론을 내기 쉽다. 렌더 직전까지의 판단
 * (무엇을 보여줄지·어떤 문자열을 쓸지)을 이 파일 한 곳에서 끝내고, 뷰는 LandingModel 만 읽는다.
 * React / Next 를 import 하지 않는다 — 호스트 DOM 번들에 그대로 들어간다.
 */

import { formatKst } from "@/lib/datetime";
import { DEFAULT_LANDING_AUDIENCE_TITLE, normalizeLandingPageConfig, safeHttpUrl } from "@/lib/webinar-config";
import { isRealSession } from "@/lib/webinar-sessions";
import { SAFE_HEX, TOC_DEF, onPrimaryFor } from "./model";
import type { LandingModel, LandingSession, LandingStatusInfo, LandingTocItem, LandingWebinar } from "./types";

export interface BuildLandingModelOptions {
  /** 인스턴스 고유 접두 — 한 페이지에 랜딩이 둘 이상 붙어도 DOM id 가 안 부딪히게. */
  uid: string;
  embedded: boolean;
  isPreview: boolean;
  /** 임베드는 호스트 도메인이 달라 상대경로가 깨진다 → 등록 링크를 절대 URL 로 만들 오리진. */
  origin?: string;
}

/** 라이브 페이지 링크 — origin 이 있으면 절대 URL(임베드용). */
function buildLiveUrl(slug: string, origin: string | undefined, view: "signup" | null): string {
  const path = `/webinar/${encodeURIComponent(slug)}/live${view ? `?view=${view}` : ""}`;
  const base = (origin ?? "").trim();
  if (!base) return path;
  try {
    // safeHttpUrl 로 한 번 더 거른다 — 호스트가 넘긴 오리진이 http(s) 가 아니면 상대경로로 되돌림.
    return safeHttpUrl(new URL(path, base).toString()) || path;
  } catch {
    return path;
  }
}

export function buildLandingModel(webinar: LandingWebinar, opts: BuildLandingModelOptions): LandingModel {
  const { uid, embedded, isPreview, origin } = opts;
  const lp = normalizeLandingPageConfig(webinar.config);
  const sectionId = (base: string) => `${uid}-${base}`;

  const accentRaw = String(webinar.theme?.accentColor ?? "");
  // 폴백은 **에디터가 선언한 기본값과 같아야 한다** — BrandSection 의
  // THEME_DEFAULTS.accentColor 는 #6d28d9 인데 여기만 #8b5cf6 이었다. 그래서 accent 를
  // 한 번도 저장하지 않은 웨비나는 편집기에서 보이는 색과 실제 랜딩 색이 서로 달랐다.
  // (이건 앱 크롬이 아니라 **시청자에게 보이는 고객 테마** 도메인이라 보라를 유지한다.)
  const accent = SAFE_HEX.test(accentRaw) ? accentRaw : "#6d28d9";
  const onPrimary = onPrimaryFor(accent);

  const brand = lp.brand.trim() || webinar.name;
  const titleLines = lp.titleLines.length ? lp.titleLines : [webinar.name];
  const subtitle = lp.subtitle.trim() || (webinar.description ?? "").split("\n")[0] || "";
  const dateStr = `${formatKst(webinar.liveStartAt, { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })} KST`;
  // 상태별 CTA — 예전엔 상태와 무관하게 항상 "사전 등록하기 → ?view=signup" 이었다.
  // 종료된 웨비나가 등록을 권하고, 라이브 중에는 ?view=signup 이 대기 화면을 고정해
  // 등록자가 입장하지 못했다(배너는 상태별로 바뀌는데 히어로만 안 바뀜).
  const statusInfo: LandingStatusInfo = {
    status: typeof webinar.status === "string" ? webinar.status : "registration",
    entryOpen: webinar.entryOpen === true,
    // 구 페이로드(상태 없음) 호환 — 값이 없으면 등록 가능으로 본다.
    canRegister: webinar.canRegister !== false,
  };
  const canEnter = statusInfo.status === "live" || statusInfo.entryOpen;
  const registerUrl = buildLiveUrl(
    webinar.slug,
    origin,
    // 실제로 등록할 수 있을 때만 ?view=signup 을 붙인다(이 쿼리는 대기 화면을 고정한다).
    // 입장·종료·마감 상태에서는 라이브 페이지가 알아서 맞는 화면을 고른다.
    statusInfo.canRegister && !canEnter && statusInfo.status !== "ended" ? "signup" : null,
  );
  const ctaLabel =
    statusInfo.status === "ended"
      ? "웨비나가 종료되었어요"
      : canEnter
        ? "웨비나 입장하기"
        : statusInfo.canRegister
          ? lp.ctaLabel
          : "사전등록이 마감되었어요";

  // 임베드는 호출자가 만든 임의의 객체를 넘길 수 있어 세션 배열 부재를 방어한다(파트너 문서에서 throw 금지).
  const sessions: LandingSession[] = Array.isArray(webinar.sessions) ? webinar.sessions : [];
  /**
   * 세션 카드는 **실제 세션만** — isRealSession 을 쓴다. 예전엔 여기서 `=== "session"` 을
   * 직접 비교해 헬퍼의 복제였고, 헬퍼만 고치면 랜딩 카드만 옛 규칙으로 남아 타임테이블
   * (전체 통과)과 어긋난 화면이 시청자에게 나갔다.
   */
  const sessionCards = lp.sessions.enabled ? sessions.filter(isRealSession) : [];
  const timetableRows = lp.timetable.enabled ? sessions : [];

  const introTitle = lp.intro.title.trim() || subtitle;
  // 본문 기본값: 설명에서 제목으로 쓰인 첫 줄은 빼고 — 같은 문장이 제목·본문에 두 번 나오지 않게
  const descLines = (webinar.description ?? "").split("\n");
  const introBodyDefault = (descLines[0]?.trim() === introTitle.trim() ? descLines.slice(1) : descLines).join("\n").trim();
  const introBody = lp.intro.body.trim() || introBodyDefault;

  const showIntro = lp.intro.enabled && Boolean(introTitle || introBody);
  const showAudience = lp.audience.enabled && lp.audience.items.length > 0;
  // 기본 문구 폴백은 **모델에서 한 번** — 뷰가 또 판정하면 두 곳이 갈린다(종료 인사말과 같은 규칙).
  const audienceTitle = lp.audience.title.trim() || DEFAULT_LANDING_AUDIENCE_TITLE;
  const showPrograms = lp.programs.enabled && lp.programs.items.length > 0;
  const showHighlights = lp.highlights.enabled && lp.highlights.items.length > 0;
  const showJoin = lp.join.enabled && lp.join.steps.length > 0;
  const showFaq = lp.faq.enabled && lp.faq.items.length > 0;

  // 목차 노출 조건은 TOC_DEF 의 원래 id(=섹션 base)로 판단하고, 실제 id 는 uid 접두를 붙여 내보낸다.
  const visible: Record<string, boolean> = {
    "lnd-about": showIntro,
    "lnd-audience": showAudience,
    "lnd-sessions": sessionCards.length > 0,
    "lnd-timetable": timetableRows.length > 0,
    "lnd-programs": showPrograms,
    "lnd-highlights": showHighlights,
    "lnd-join": showJoin,
    "lnd-faq": showFaq,
  };
  // id 는 **base**(uid 접두 전) 그대로 싣는다. 접두는 뷰(renderToc)가 m.sectionId 로 한 번만 붙인다.
  // 여기서 미리 붙이면 뷰에서 두 번 붙어 앵커·스크롤·aria-current 가 전부 죽는다.
  const tocItems: LandingTocItem[] = TOC_DEF.filter((t) => visible[t.id]).map((t) => ({
    id: t.id,
    label: t.label,
  }));

  // FAQ 카테고리 — 등장 순서 유지(중복만 제거).
  const faqCategories: string[] = [];
  for (const item of lp.faq.items) if (!faqCategories.includes(item.category)) faqCategories.push(item.category);

  const detailPopup = lp.sessions.enabled && lp.sessions.detailPopup;

  return {
    webinar,
    lp,
    uid,
    accent,
    onPrimary,
    brand,
    titleLines,
    subtitle,
    dateStr,
    registerUrl,
    ctaLabel,
    statusInfo,
    introTitle,
    introBody,
    sessionCards,
    timetableRows,
    faqCategories,
    tocItems,
    showIntro,
    showAudience,
    audienceTitle,
    showPrograms,
    showHighlights,
    showJoin,
    showFaq,
    detailPopup,
    embedded,
    isPreview,
    sectionId,
  };
}
