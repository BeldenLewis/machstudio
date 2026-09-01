import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

const SOURCE_TYPES = new Set(["ALL", "GOOGLE", "META", "LINKEDIN", "MANUAL"]);

async function authorize(id: string, requireEdit = true) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "인증이 필요해요" }, { status: 401 }) };

  const view = await prisma.adPerformanceView.findUnique({ where: { id } });
  if (!view) return { error: NextResponse.json({ error: "성과 보드를 찾을 수 없어요" }, { status: 404 }) };
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: view.workspaceId } },
    select: { role: true },
  });
  if (!membership || (requireEdit && membership.role === "MEMBER")) {
    return { error: NextResponse.json({ error: "성과 보드를 편집할 권한이 없어요" }, { status: 403 }) };
  }
  return { view };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "변경할 값이 없어요" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "보드 이름을 입력해 주세요" }, { status: 400 });
    data.name = name.slice(0, 80);
  }
  if (typeof body.sourceType === "string" && SOURCE_TYPES.has(body.sourceType)) data.sourceType = body.sourceType;
  if (body.campaignName === null || typeof body.campaignName === "string") data.campaignName = typeof body.campaignName === "string" ? body.campaignName.trim() || null : null;
  if (body.adGroupName === null || typeof body.adGroupName === "string") data.adGroupName = typeof body.adGroupName === "string" ? body.adGroupName.trim() || null : null;
  if (typeof body.rangeLabel === "string") data.rangeLabel = body.rangeLabel.slice(0, 80);
  const dateFrom = typeof body.dateFrom === "string" ? new Date(body.dateFrom) : null;
  const dateTo = typeof body.dateTo === "string" ? new Date(body.dateTo) : null;
  if (dateFrom && !Number.isNaN(dateFrom.getTime())) data.dateFrom = dateFrom;
  if (dateTo && !Number.isNaN(dateTo.getTime())) data.dateTo = dateTo;
  const nextFrom = (data.dateFrom as Date | undefined) ?? auth.view?.dateFrom;
  const nextTo = (data.dateTo as Date | undefined) ?? auth.view?.dateTo;
  if (nextFrom && nextTo && nextFrom > nextTo) {
    return NextResponse.json({ error: "시작일은 종료일보다 늦을 수 없어요" }, { status: 400 });
  }

  const view = await prisma.adPerformanceView.update({ where: { id }, data });
  return NextResponse.json({ view });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(id);
  if (auth.error) return auth.error;
  await prisma.adPerformanceView.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
