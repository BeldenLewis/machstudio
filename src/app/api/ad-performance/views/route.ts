import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

const SOURCE_TYPES = new Set(["ALL", "GOOGLE", "META", "LINKEDIN", "MANUAL"]);

function validDate(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function authorize(workspaceId: string, projectId: string, requireEdit = false) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "인증이 필요해요" }, { status: 401 }) };

  const [membership, project] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId: user.id, workspaceId } },
      select: { role: true },
    }),
    prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { id: true } }),
  ]);
  if (!membership || !project) {
    return { error: NextResponse.json({ error: "이 프로젝트에 접근할 수 없어요" }, { status: 403 }) };
  }
  if (requireEdit && membership.role === "MEMBER") {
    return { error: NextResponse.json({ error: "성과 보드를 편집할 권한이 없어요" }, { status: 403 }) };
  }
  return { user, membership };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspaceId");
  const projectId = searchParams.get("projectId");
  if (!workspaceId || !projectId) {
    return NextResponse.json({ error: "workspaceId와 projectId가 필요해요" }, { status: 400 });
  }

  const auth = await authorize(workspaceId, projectId);
  if (auth.error) return auth.error;

  const views = await prisma.adPerformanceView.findMany({
    where: { workspaceId, projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ views, canEdit: auth.membership?.role !== "MEMBER" });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : "";
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const dateFrom = validDate(body?.dateFrom);
  const dateTo = validDate(body?.dateTo);
  if (!workspaceId || !projectId || !name || !dateFrom || !dateTo || dateFrom > dateTo) {
    return NextResponse.json({ error: "보드 이름과 올바른 기간을 입력해 주세요" }, { status: 400 });
  }

  const auth = await authorize(workspaceId, projectId, true);
  if (auth.error) return auth.error;

  const sourceType = typeof body?.sourceType === "string" && SOURCE_TYPES.has(body.sourceType)
    ? body.sourceType
    : "ALL";
  const last = await prisma.adPerformanceView.aggregate({
    where: { workspaceId, projectId },
    _max: { sortOrder: true },
  });
  const view = await prisma.adPerformanceView.create({
    data: {
      workspaceId,
      projectId,
      name: name.slice(0, 80),
      sourceType,
      campaignName: typeof body?.campaignName === "string" ? body.campaignName.trim() || null : null,
      adGroupName: typeof body?.adGroupName === "string" ? body.adGroupName.trim() || null : null,
      rangeLabel: typeof body?.rangeLabel === "string" ? body.rangeLabel.slice(0, 80) : "직접 설정",
      dateFrom,
      dateTo,
      sortOrder: (last._max.sortOrder ?? -1) + 1,
    },
  });
  return NextResponse.json({ view }, { status: 201 });
}
