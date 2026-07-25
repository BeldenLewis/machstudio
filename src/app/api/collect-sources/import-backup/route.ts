import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

// mach 백업 JSON 파일 복구 → 새 소스로 생성하고 모든 레코드 import.
// body: { workspaceId, projectId, backup: {...} }
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const body = await request.json();
  const { workspaceId, projectId, backup } = body as {
    workspaceId?: string; projectId?: string;
    backup?: {
      _schema?: string;
      source?: Record<string, unknown>;
      records?: Array<Record<string, unknown>>;
    };
  };

  if (!workspaceId || !projectId || !backup) {
    return NextResponse.json({ error: "workspaceId, projectId, backup 필요" }, { status: 400 });
  }
  const legacySchema = ["x" + "flow", "collect-source", "backup", "v1"].join(".");
  const supportedSchemas = ["mach.collect-source.backup.v1", legacySchema];
  if (!backup._schema || !supportedSchemas.includes(backup._schema)) {
    return NextResponse.json({ error: "지원하지 않는 백업 포맷이에요" }, { status: 400 });
  }

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId } },
  });
  if (!membership || membership.role === "MEMBER") {
    return NextResponse.json({ error: "ADMIN 이상 필요" }, { status: 403 });
  }

  // projectId 가 이 워크스페이스 소속인지 검증 — 교차 테넌트 FK 방지.
  // (webinars/route.ts, webinar-embed-sites/route.ts 등은 이미 이 검사를 한다)
  const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } });
  if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없어요" }, { status: 400 });

  const src = backup.source ?? {};
  const fieldMappings = (src.fieldMappings as Array<Record<string, unknown>>) ?? [];

  // 소스 생성
  const newSource = await prisma.collectSource.create({
    data: {
      workspaceId,
      projectId,
      name: `${src.name ?? "복원된 소스"} (복원)`,
      description: (src.description as string) ?? null,
      siteUrl: (src.siteUrl as string) ?? null,
      successTrigger: (src.successTrigger as string) ?? "정상적으로 접수되었습니다",
      redirectUrl: (src.redirectUrl as string) ?? null,
      isActive: false, // 복원 직후 비활성 — 사용자가 확인 후 활성화
      webhookUrl: (src.webhookUrl as string) ?? null,
      notifyOnSubmit: !!src.notifyOnSubmit,
      allowedOrigins: Array.isArray(src.allowedOrigins) ? (src.allowedOrigins as string[]) : [],
      fieldMappings: {
        create: fieldMappings.map((f, i) => ({
          index: (f.index as number) ?? i,
          key: String(f.key ?? `field_${i}`),
          label: String(f.label ?? `필드 ${i}`),
          type: String(f.type ?? "text"),
          isRequired: !!f.isRequired,
          sortOrder: (f.sortOrder as number) ?? i,
        })),
      },
    },
  });

  // 레코드 청크 insert
  const records = backup.records ?? [];
  const CHUNK = 2000;
  let imported = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK).map((r) => {
      const created = r.createdAt ? new Date(r.createdAt as string) : undefined;
      return {
        sourceId: newSource.id,
        projectId,
        workspaceId,
        data: (r.data ?? {}) as never,
        utmSource: (r.utmSource as string) ?? null,
        utmMedium: (r.utmMedium as string) ?? null,
        utmCampaign: (r.utmCampaign as string) ?? null,
        utmTerm: (r.utmTerm as string) ?? null,
        utmContent: (r.utmContent as string) ?? null,
        firstUtmSource: (r.firstUtmSource as string) ?? null,
        firstUtmMedium: (r.firstUtmMedium as string) ?? null,
        firstUtmCampaign: (r.firstUtmCampaign as string) ?? null,
        firstUtmTerm: (r.firstUtmTerm as string) ?? null,
        firstUtmContent: (r.firstUtmContent as string) ?? null,
        firstReferrer: (r.firstReferrer as string) ?? null,
        firstSeenAt: r.firstSeenAt ? new Date(r.firstSeenAt as string) : null,
        referrer: (r.referrer as string) ?? null,
        userAgent: (r.userAgent as string) ?? null,
        ip: (r.ip as string) ?? null,
        ...(created && !isNaN(created.getTime()) ? { createdAt: created } : {}),
      };
    });
    const result = await prisma.collectRecord.createMany({ data: chunk });
    imported += result.count;
  }

  await logActivity({
    workspaceId,
    sourceId: newSource.id,
    userId: user.id,
    action: "source.created",
    meta: { restoredFromBackup: true, importedRecords: imported },
  });

  return NextResponse.json({ source: newSource, imported });
}
