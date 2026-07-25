import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { logActivity } from "@/lib/activity";
import { isWebinarStatusOverride } from "@/lib/webinar-status";
import { assertScheduleOrder, parseWebinarDate, WebinarScheduleError } from "@/lib/webinar-schedule";

async function getWebinarWithAuth(id: string, userId: string) {
  const webinar = await prisma.webinar.findUnique({ where: { id } });
  if (!webinar) return { webinar: null, membership: null };

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: webinar.workspaceId } },
  });
  return { webinar, membership };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const { webinar, membership } = await getWebinarWithAuth(id, user.id);
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const full = await prisma.webinar.findUnique({
    where: { id },
    include: {
      sessions: { orderBy: { number: "asc" } },
      // 허브 헤더 브레드크럼용 소속 맥락 (딥링크/복제로 진입 시 어느 프로젝트인지 표시)
      project: { select: { id: true, name: true } },
      workspace: { select: { id: true, name: true } },
      _count: { select: { registrations: true, questions: true } },
    },
  });

  return NextResponse.json({ webinar: full });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const { webinar, membership } = await getWebinarWithAuth(id, user.id);
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  const body = await request.json();
  const { name, description, liveStartAt, liveEndAt, signupDeadline, theme, config, statusOverride, components } = body;

  // 상태 수동 오버라이드 — null(자동 복귀) 또는 유틸이 정의한 값만 허용
  if (statusOverride !== undefined && statusOverride !== null && !isWebinarStatusOverride(statusOverride)) {
    return NextResponse.json({ error: "잘못된 상태 값이에요" }, { status: 400 });
  }

  // 날짜 파싱·순서 규칙은 webinar-schedule 하나로 — 생성(POST /api/webinars)과 같은 규칙을 쓴다.
  const parseDate = parseWebinarDate;

  // config·components 는 탭마다 자기 키만 보낸다 → 서버에서 최상위 키 단위로 병합한다.
  // 통째 교체하면 A 탭 저장 직후 B 탭이 옛 스냅샷으로 덮어써 방금 저장한 설정이 롤백된다.
  // 이 값들은 임베드 로더를 통해 파트너 사이트의 href·stylesheet 로 들어간다.
  // javascript: 스킴이나 CSS 이스케이프 문자가 저장되면 남의 도메인에서 실행·훼손된다.
  const URL_KEYS = ["surveyUrl", "calendarUrl"];
  const sanitizeConfig = (input: Record<string, unknown>) => {
    const out = { ...input };
    for (const k of URL_KEYS) {
      const v = out[k];
      if (typeof v !== "string" || !v.trim()) continue;
      try {
        const u = new URL(v.trim());
        if (u.protocol !== "http:" && u.protocol !== "https:") out[k] = null;
      } catch { out[k] = null; }
    }
    return out;
  };
  // 색상은 #hex / rgb() / 색상이름만, 반지름은 길이 단위만 — 중괄호 등으로 셀렉터를 탈출하지 못하게.
  const SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%]+\)|[a-zA-Z]+)$/;
  const SAFE_LENGTH = /^\d+(\.\d+)?(px|rem|em|%)?$/;
  // 폰트명은 공백 포함(Noto Sans KR 등) — 색상 정규식으로 검증하면 걸러진다.
  // CSS 값으로 안전하게 들어가도록 글자·공백·하이픈만 허용한다(따옴표·중괄호 차단).
  const SAFE_FONT = /^[a-zA-Z0-9 _-]+$/;
  const sanitizeTheme = (input: Record<string, unknown>) => {
    const out = { ...input };
    for (const [k, v] of Object.entries(out)) {
      if (typeof v !== "string") continue;
      const s = v.trim();
      const ok = k.toLowerCase().includes("radius") ? SAFE_LENGTH.test(s)
        : k.toLowerCase() === "font" ? SAFE_FONT.test(s)
        : SAFE_COLOR.test(s);
      if (!ok) delete out[k];
    }
    return out;
  };

  const mergeJson = (current: unknown, incoming: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull => {
    if (incoming === null) return Prisma.JsonNull; // 명시적 초기화
    if (typeof incoming !== "object" || Array.isArray(incoming)) return incoming as Prisma.InputJsonValue;
    const base = current && typeof current === "object" && !Array.isArray(current) ? (current as Record<string, unknown>) : {};
    return { ...base, ...(incoming as Record<string, unknown>) } as Prisma.InputJsonValue;
  };

  // 일정 순서 검증 — 종료<시작이면 상태머신이 시작 전인데도 '종료'로 판정한다(webinar-status: t>=liveEndAt→ended).
  // 변경되는 값 + 기존 값을 합쳐 최종 조합으로 본다. parseDate 형식 에러는 아래 catch 가 400 으로 처리.
  let updated;
  try {
    if (liveStartAt !== undefined || liveEndAt !== undefined || signupDeadline !== undefined) {
      const start = liveStartAt !== undefined ? parseDate(liveStartAt, "시작 시각") : webinar.liveStartAt;
      const end = liveEndAt !== undefined ? parseDate(liveEndAt, "종료 시각") : webinar.liveEndAt;
      const deadline = signupDeadline !== undefined ? parseDate(signupDeadline, "등록 마감") : webinar.signupDeadline;
      assertScheduleOrder(start, end, deadline);
    }
    updated = await prisma.webinar.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(liveStartAt !== undefined && { liveStartAt: parseDate(liveStartAt, "시작 시각") }),
        ...(liveEndAt !== undefined && { liveEndAt: parseDate(liveEndAt, "종료 시각") }),
        ...(signupDeadline !== undefined && { signupDeadline: parseDate(signupDeadline, "등록 마감") }),
        ...(theme !== undefined && {
          theme: mergeJson(webinar.theme, theme && typeof theme === "object" && !Array.isArray(theme) ? sanitizeTheme(theme as Record<string, unknown>) : theme),
        }),
        ...(config !== undefined && {
          config: mergeJson(webinar.config, config && typeof config === "object" && !Array.isArray(config) ? sanitizeConfig(config as Record<string, unknown>) : config),
        }),
        ...(statusOverride !== undefined && { statusOverride }),
        ...(components !== undefined && { components: mergeJson(webinar.components, components) }),
      },
    });
  } catch (e) {
    // 문자열 대조가 아니라 타입으로 구분한다 — 문구를 다듬는 순간 400 이 500 으로 바뀌던 자리다.
    if (e instanceof WebinarScheduleError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }

  const changed = Object.keys(body).filter((k) =>
    ["name", "description", "liveStartAt", "liveEndAt", "signupDeadline", "theme", "config", "statusOverride", "components"].includes(k),
  );
  await logActivity({
    workspaceId: webinar.workspaceId,
    userId: user.id,
    action: "webinar.updated",
    meta: { webinarId: id, changes: changed },
  });

  return NextResponse.json({ webinar: updated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const { webinar, membership } = await getWebinarWithAuth(id, user.id);
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });
  if (!membership || membership.role === "MEMBER") {
    return NextResponse.json({ error: "삭제 권한 없음" }, { status: 403 });
  }

  await prisma.webinar.delete({ where: { id } });

  await logActivity({
    workspaceId: webinar.workspaceId,
    userId: user.id,
    action: "webinar.deleted",
    meta: { webinarId: id, slug: webinar.slug, name: webinar.name },
  });

  return NextResponse.json({ ok: true });
}
