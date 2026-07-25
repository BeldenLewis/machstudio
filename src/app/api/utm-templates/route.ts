import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { isWorkspaceMember, resolveMemberWorkspaceId } from "@/lib/workspace-scope";


export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const wsId = await resolveMemberWorkspaceId(searchParams.get("workspaceId"), user.id);
  if (!wsId) return NextResponse.json({ templates: [] });

  const templates = await prisma.uTMTemplate.findMany({
    where: { workspaceId: wsId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { workspaceId, name, source, medium, campaign, term, content } = await request.json();
  const nameValue = typeof name === "string" ? name.trim() : "";
  const sourceValue = typeof source === "string" ? source.trim().toLowerCase() : "";
  const mediumValue = typeof medium === "string" ? medium.trim().toLowerCase() : "";
  const campaignValue = typeof campaign === "string" ? campaign.trim() : "";

  if (!nameValue || !sourceValue || !mediumValue || !campaignValue) {
    return NextResponse.json({ error: "name, source, medium, campaign은 필수입니다" }, { status: 400 });
  }

  const wsId = await resolveMemberWorkspaceId(workspaceId, user.id);
  if (!wsId) return NextResponse.json({ error: "워크스페이스 없음" }, { status: 400 });

  const template = await prisma.uTMTemplate.create({
    data: {
      id: crypto.randomUUID(),
      workspaceId: wsId,
      name: nameValue,
      source: sourceValue,
      medium: mediumValue,
      campaign: campaignValue,
      term: term?.trim() || null,
      content: content?.trim() || null,
    },
  });

  await logActivity({
    workspaceId: wsId,
    userId: user.id,
    action: "utmTemplate.created",
    meta: { templateId: template.id, name: template.name, source: template.source, medium: template.medium },
  });

  return NextResponse.json({ template });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await request.json();
  const existing = await prisma.uTMTemplate.findUnique({ where: { id } });
  // 삭제는 되돌릴 수 없다 — 내 워크스페이스 것인지 반드시 확인한다(프리셋 DELETE 와 같은 이유).
  if (!existing || !(await isWorkspaceMember(user.id, existing.workspaceId))) {
    return NextResponse.json({ error: "템플릿을 찾을 수 없어요" }, { status: 404 });
  }
  await prisma.uTMTemplate.delete({ where: { id } });

  {
    await logActivity({
      workspaceId: existing.workspaceId,
      userId: user.id,
      action: "utmTemplate.deleted",
      meta: { templateId: id, name: existing.name },
    });
  }

  return NextResponse.json({ ok: true });
}
