import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { normalizeRegistrationForm } from "@/lib/webinar-config";

// memo 는 JSON 문자열({ memo, customFields }) 또는 평문일 수 있다 (register 라우트 참조)
function parseMemo(memo: string | null): { note: string; customFields: Record<string, unknown> } {
  if (!memo) return { note: "", customFields: {} };
  try {
    const parsed = JSON.parse(memo);
    if (parsed && typeof parsed === "object") {
      return {
        note: typeof parsed.memo === "string" ? parsed.memo : "",
        customFields: parsed.customFields && typeof parsed.customFields === "object" ? parsed.customFields : {},
      };
    }
  } catch {
    /* 평문 memo */
  }
  return { note: memo, customFields: {} };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const webinar = await prisma.webinar.findUnique({ where: { id } });
  if (!webinar) return NextResponse.json({ error: "없는 웨비나예요" }, { status: 404 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: webinar.workspaceId } },
  });
  if (!membership) return NextResponse.json({ error: "접근 권한 없음" }, { status: 403 });

  // ?ids=a,b,c 가 있으면 선택 등록자만 내보낸다(없으면 전체) — 이 웨비나 스코프 유지
  const idsParam = new URL(request.url).searchParams.get("ids");
  const ids = idsParam ? idsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 1000) : null;

  const registrations = await prisma.webinarRegistration.findMany({
    where: { webinarId: id, ...(ids && ids.length ? { id: { in: ids } } : {}) },
    orderBy: { submittedAt: "desc" },
  });

  // 커스텀 필드 컬럼 — 등록폼 정의 순서(시스템 필드 제외) 그대로 헤더에 편입
  const customFieldDefs = normalizeRegistrationForm(webinar.config, { includeDisabled: true }).fields
    .filter((f) => !f.system);

  const headers = [
    "이름", "연락처", "이메일", "회사", "부서", "직함", "업종", "마케팅동의", "체류시간(분)", "등록일", "입장일",
    ...customFieldDefs.map((f) => f.label),
    "사전질문",
    "UTM소스", "UTM매체", "UTM캠페인", "최초UTM소스", "최초UTM매체", "유입경로(referrer)",
  ];
  const rows = registrations.map((r) => {
    const { note, customFields } = parseMemo(r.memo);
    return [
      r.name,
      r.phone ?? "",
      r.email ?? "",
      r.company ?? "",
      r.department ?? "",
      r.jobTitle ?? "",
      r.industry ?? "",
      r.agreeMarketing ? "Y" : "N",
      String(r.stayMinutes),
      new Date(r.submittedAt).toLocaleString("ko-KR"),
      r.enteredAt ? new Date(r.enteredAt).toLocaleString("ko-KR") : "",
      ...customFieldDefs.map((f) => {
        const value = customFields[f.key];
        return value == null ? "" : String(value);
      }),
      note,
      r.utmSource ?? "",
      r.utmMedium ?? "",
      r.utmCampaign ?? "",
      r.firstUtmSource ?? "",
      r.firstUtmMedium ?? "",
      r.referrer ?? "",
    ];
  });

  // CSV 수식 인젝션 방어 — 셀 첫 문자가 = + - @ 또는 선행 TAB/CR 이면 작은따옴표로 무력화한 뒤 인용/이스케이프
  const csvCell = (cell: unknown) => {
    const s = String(cell);
    const neutralized = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return `"${neutralized.replace(/"/g, '""')}"`;
  };

  const csv = [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");

  await logActivity({
    workspaceId: webinar.workspaceId,
    userId: user.id,
    action: "webinar.registrations.exported",
    meta: { webinarId: id, webinarSlug: webinar.slug, format: "csv", recordCount: registrations.length },
  });

  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="registrations-${webinar.slug}.csv"`,
    },
  });
}
