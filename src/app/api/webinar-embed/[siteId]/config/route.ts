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
import { normalizeRegistrationForm } from "@/lib/webinar-config";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const;

const CACHE_OK = "public, s-maxage=60, stale-while-revalidate=300";
const CACHE_MISS = "public, s-maxage=60";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { ...CORS_HEADERS, "Access-Control-Max-Age": "86400" },
  });
}

function toICSDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function buildIcs(webinar: { name: string; description: string | null; liveStartAt: Date; liveEndAt: Date; slug: string }) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//mach studio//Webinar//KR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:mach-webinar-${webinar.slug}@machstudio`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(webinar.liveStartAt)}`,
    `DTEND:${toICSDate(webinar.liveEndAt)}`,
    `SUMMARY:${webinar.name.replace(/[\n\r]/g, " ")}`,
    `DESCRIPTION:${(webinar.description ?? "").replace(/[\n\r]/g, " ")}`,
    "LOCATION:Online",
    "BEGIN:VALARM",
    "TRIGGER:-PT60M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${webinar.name.replace(/[\n\r]/g, " ")} 1시간 전입니다!`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;

  const site = await prisma.webinarEmbedSite.findUnique({
    where: { id: siteId },
    select: {
      id: true,
      isActive: true,
      deletedAt: true,
      livePageUrl: true,
      bannerPagePatterns: true,
      activeWebinar: {
        select: {
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
          sessions: {
            select: { number: true, title: true, speaker: true, startTime: true, endTime: true },
            orderBy: { number: "asc" },
          },
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

  const webinar = site.activeWebinar;
  const statusInfo = resolveWebinarStatus(webinar);
  const registrationForm = normalizeRegistrationForm(webinar.config);
  const config = (webinar.config ?? {}) as Record<string, unknown>;

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
    registrationForm: {
      fields: registrationForm.fields,
      privacyText: registrationForm.privacyText,
      marketingText: registrationForm.marketingText,
      submitLabel: registrationForm.submitLabel,
    },
    sessions: webinar.sessions,
    links: {
      livePageUrl: site.livePageUrl ?? null,
      surveyUrl: typeof config.surveyUrl === "string" ? config.surveyUrl : null,
      calendarUrl: typeof config.calendarUrl === "string" ? config.calendarUrl : null,
    },
    ics: buildIcs(webinar),
    bannerPagePatterns: site.bannerPagePatterns,
  };

  return NextResponse.json(payload, {
    headers: { ...CORS_HEADERS, "Cache-Control": CACHE_OK },
  });
}
