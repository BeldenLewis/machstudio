/**
 * 웨비나 임베드 공개 설정 — 로더가 런타임에 읽는 단일 계약.
 *
 * - 무인증. youtubeId·등록자 수 등 민감 값은 노출하지 않는다.
 * - 서버가 activeWebinarId 로 웨비나를 해석 — 전시 전환은 어드민에서 이 값만 교체.
 * - 캐시: s-maxage=60 + swr=300 → 수동 오버라이드도 방문자에게 최대 ~1분 내 전파,
 *   오리진(Supabase) 조회는 CDN이 흡수한다. CORS 는 * (Origin echo 는 캐시 파편화 유발).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveWebinarStatus } from "@/lib/webinar-status";
import { normalizeRegistrationForm, safeHttpUrl } from "@/lib/webinar-config";
import { endedSurveyLinks } from "@/lib/webinar-ended-surveys";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const;

const CACHE_OK = "public, s-maxage=60, stale-while-revalidate=300";
const CACHE_MISS = "public, s-maxage=60";

/** 외부 로더에 필요한 등록 폼 계약만 내보낸다 — 완료 CTA URL은 공개 전 서버에서 한 번 더 정제한다. */
export function buildPublicRegistrationFormPayload(config: unknown) {
  const registrationForm = normalizeRegistrationForm(config);
  return {
    fields: registrationForm.fields,
    privacyText: registrationForm.privacyText,
    marketingText: registrationForm.marketingText,
    privacyBody: registrationForm.privacyBody,
    marketingBody: registrationForm.marketingBody,
    privacyDefaultChecked: registrationForm.privacyDefaultChecked,
    marketingDefaultChecked: registrationForm.marketingDefaultChecked,
    submitLabel: registrationForm.submitLabel,
    successCta: {
      enabled: registrationForm.successCta.enabled,
      label: registrationForm.successCta.label,
      url: safeHttpUrl(registrationForm.successCta.url),
    },
  };
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { ...CORS_HEADERS, "Access-Control-Max-Age": "86400" },
  });
}

/** DTSTAMP 등 UTC 고정 필드용. */
function toICSDateUtc(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/**
 * 한국시간(Asia/Seoul) 벽시계 표기 — TZID 와 함께 쓴다.
 * KST 는 1988년 이후 서머타임이 없어 UTC+9 고정이라 오프셋 가산으로 충분하다.
 */
function toICSDateKst(date: Date) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .replace(/[-:]/g, "")
    .split(".")[0];
}

/** RFC 5545 TEXT 이스케이프 — 안 하면 설명의 쉼표·세미콜론에서 파싱이 깨진다. */
function icsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/[\r\n]+/g, "\\n");
}

/** RFC 5545 줄 접기(75 옥텟). 한국어 설명은 쉽게 넘어가고, 안 접으면 가져오기에 실패하는 앱이 있다. */
function foldIcsLine(line: string) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let take = Math.min(limit, bytes.length - start);
    // 멀티바이트 문자를 자르지 않도록 경계까지 뒤로 물린다
    while (take > 0 && (bytes[start + take] & 0xc0) === 0x80) take--;
    out.push(bytes.subarray(start, start + take).toString("utf8"));
    start += take;
    limit = 74; // 이어지는 줄은 선행 공백 1옥텟을 쓴다
  }
  return out.join("\r\n ");
}

function buildIcs(webinar: { name: string; description: string | null; liveStartAt: Date; liveEndAt: Date; slug: string }) {
  const name = icsText(webinar.name);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//mach studio//Webinar//KR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    // 한국시간 기준을 명시한다. TZID 없이 UTC 로만 주면 절대시각은 맞지만
    // 캘린더 앱이 기기 시간대로만 보여줘 "한국시간 몇 시인지"가 드러나지 않는다.
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Seoul",
    "BEGIN:STANDARD",
    "DTSTART:19881009T030000",
    "TZOFFSETFROM:+1000",
    "TZOFFSETTO:+0900",
    "TZNAME:KST",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:mach-webinar-${webinar.slug}@machstudio`,
    `DTSTAMP:${toICSDateUtc(new Date())}`,
    `DTSTART;TZID=Asia/Seoul:${toICSDateKst(webinar.liveStartAt)}`,
    `DTEND;TZID=Asia/Seoul:${toICSDateKst(webinar.liveEndAt)}`,
    `SUMMARY:${name}`,
    `DESCRIPTION:${icsText(webinar.description ?? "")}`,
    "LOCATION:Online",
    // 알림 2회 — 1시간 전, 10분 전
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${name} 1시간 전입니다!`,
    "END:VALARM",
    "BEGIN:VALARM",
    "TRIGGER:-PT10M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${name} 10분 뒤 시작합니다!`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .map(foldIcsLine)
    .join("\r\n");
}

// 허용 오리진 비교 — 스킴+호스트+포트만 본다(경로·서브도메인 부분일치는 인정하지 않는다).
function originAllowed(reqOrigin: string | null, allowed: string[]) {
  if (!allowed.length) return true; // 미설정 = 제한 없음(기존 동작 유지)
  if (!reqOrigin) return false;
  const norm = (v: string) => { try { return new URL(v).origin.toLowerCase(); } catch { return ""; } };
  const target = norm(reqOrigin);
  return !!target && allowed.some((a) => norm(a) === target);
}

export async function GET(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;

  const site = await prisma.webinarEmbedSite.findUnique({
    where: { id: siteId },
    select: {
      id: true,
      isActive: true,
      deletedAt: true,
      livePageUrl: true,
      bannerPagePatterns: true,
      allowedOrigins: true,
      activeWebinar: {
        select: {
          id: true, // 자체 설문(종료 화면 연결) 조회용
          slug: true,
          name: true,
          description: true,
          liveStartAt: true,
          liveEndAt: true,
          signupDeadline: true,
          statusOverride: true,
          theme: true,
          config: true,
          components: true,
          updatedAt: true,
          // sessions 는 로더가 렌더하지 않음(아젠다는 라이브 페이지 iframe 담당) — 미전송으로 페이로드 절감
        },
      },
    },
  });

  if (!site || site.deletedAt !== null || !site.isActive || !site.activeWebinar) {
    return NextResponse.json(
      { error: "노출 중인 웨비나가 없어요" },
      { status: 404, headers: { ...CORS_HEADERS, "Cache-Control": CACHE_MISS } },
    );
  }

  // 허용 오리진이 설정돼 있으면 실제로 막는다 — siteId 만 알면 아무 도메인에나
  // 스니펫을 붙여 진짜 등록 폼을 띄울 수 있던 구멍.
  // 오리진별 응답이 갈리므로 이 경우엔 CDN 공유 캐시를 끈다(private).
  const allowedOrigins = site.allowedOrigins ?? [];
  if (allowedOrigins.length) {
    const reqOrigin = req.headers.get("origin") ?? req.headers.get("referer");
    if (!originAllowed(reqOrigin, allowedOrigins)) {
      return NextResponse.json(
        { error: "이 사이트에서는 사용할 수 없는 위젯이에요" },
        { status: 403, headers: { ...CORS_HEADERS, "Cache-Control": "private, no-store" } },
      );
    }
  }

  const webinar = site.activeWebinar;
  const statusInfo = resolveWebinarStatus(webinar);
  const config = (webinar.config ?? {}) as Record<string, unknown>;

  // 절대 URL 기준 — 스니펫/로더가 파트너 사이트에서 실행되므로 배포 오리진이어야 한다(w/l 라우트와 동일 방식).
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

  // 종료 화면에 연결된 자체 설문 — 라이브 페이지(info 라우트)와 같은 우선순위를 임베드에도 적용한다.
  // 이걸 안 실어 보내면 자체 설문만 설정한 웨비나는 아임웹 종료 배너·히어로가 통째로 비어 버린다.
  /**
   * 종료 화면 설문은 여러 개 걸 수 있지만 **임베드 배너·히어로는 CTA 한 줄**이라 첫 번째만 쓴다.
   * 파트너 사이트 배너에 설문 버튼을 N개 늘어놓는 건 그 자리의 역할(한 줄 알림)에 맞지 않는다.
   * 전체 목록이 필요하면 배너의 링크가 종료 화면으로 보내고, 거기서 카드 N장을 보여준다.
   *
   * orderBy 는 결정론을 위한 것이다 — 정렬 없는 findFirst 는 여러 개가 되는 순간
   * 어느 설문이 뽑힐지 DB 순서에 달리고, 캐시된 임베드 설정이 조용히 다른 링크를 갖게 된다.
   */
  const endedSurvey = await prisma.webinarSurvey.findFirst({
    where: {
      webinarId: webinar.id,
      showOnEnded: true,
      isOpen: true,
      OR: [{ closesAt: null }, { closesAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  /* 자체 설문 vs 외부 URL 의 배타적 폴백은 뷰어와 같은 함수로 판정한다 —
     한쪽만 고치면 같은 웨비나가 면에 따라 다른 설문을 가리킨다. 여기서는 첫 번째만 쓴다. */
  const endedSurveyUrl =
    endedSurveyLinks(
      endedSurvey ? [endedSurvey] : [],
      config.surveyUrl,
      (id) => `${appOrigin}/webinar/${encodeURIComponent(webinar.slug)}/survey/${id}?src=ended`,
    )[0]?.url ?? null;

  const payload = {
    slug: webinar.slug,
    name: webinar.name,
    status: statusInfo.status,
    statusOverride: webinar.statusOverride ?? null,
    serverNow: new Date().toISOString(),
    entryOpenAt: statusInfo.entryOpenAt.toISOString(),
    liveStartAt: webinar.liveStartAt.toISOString(),
    liveEndAt: webinar.liveEndAt.toISOString(),
    signupDeadline: webinar.signupDeadline.toISOString(),
    canRegister: statusInfo.canRegister,
    // 어드민 수정 시 열려 있는 페이지도 재렌더되도록 하는 렌더 키 (로더가 상태와 함께 비교)
    updatedKey: webinar.updatedAt.toISOString(),
    // 클라 live-중 등록 재판정용: 명시 설정만 boolean 으로 내리고, 미설정이면 null →
    // 로더가 signupDeadline 을 실시간 비교(서버 규칙과 동일). fetch 시점 boolean 고정 금지.
    allowLiveRegistration: (() => {
      const comps = (webinar.components ?? {}) as Record<string, unknown>;
      return typeof comps.allowLiveRegistration === "boolean" ? comps.allowLiveRegistration : null;
    })(),
    theme: webinar.theme ?? {},
    components: webinar.components ?? {},
    registrationForm: buildPublicRegistrationFormPayload(webinar.config),
    links: {
      livePageUrl: site.livePageUrl ?? null,
      surveyUrl: endedSurveyUrl,
      calendarUrl: typeof config.calendarUrl === "string" ? config.calendarUrl : null,
    },
    ics: buildIcs(webinar),
    bannerPagePatterns: site.bannerPagePatterns,
  };

  return NextResponse.json(payload, {
    // 오리진 제한이 걸린 사이트는 응답이 요청 오리진에 따라 달라지므로 공유 캐시 금지.
    headers: { ...CORS_HEADERS, "Cache-Control": allowedOrigins.length ? "private, max-age=60" : CACHE_OK },
  });
}
