import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

async function authorize(id: string, requireAdmin = false) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "인증 필요" }, { status: 401 }) };

  const source = await prisma.collectSource.findUnique({ where: { id } });
  if (!source) return { error: NextResponse.json({ error: "소스를 찾을 수 없어요" }, { status: 404 }) };

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: source.workspaceId } },
  });
  if (!membership) return { error: NextResponse.json({ error: "접근 권한 없음" }, { status: 403 }) };
  if (requireAdmin && membership.role === "MEMBER") {
    return { error: NextResponse.json({ error: "권한 없음 (ADMIN 이상)" }, { status: 403 }) };
  }

  return { source, userId: user.id };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; recordId: string }> }) {
  const { id, recordId } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return auth.error;

  const record = await prisma.collectRecord.findFirst({
    where: { id: recordId, sourceId: id },
  });
  if (!record) return NextResponse.json({ error: "레코드를 찾을 수 없어요" }, { status: 404 });

  return NextResponse.json({ record });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; recordId: string }> }) {
  const { id, recordId } = await params;
  const auth = await authorize(id);
  if ("error" in auth) return auth.error;

  const body = await request.json().catch(() => ({}));
  const { data, utmSource, utmMedium, utmCampaign, utmTerm, utmContent, referrer } = body as {
    data?: Record<string, string>;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
    utmTerm?: string | null;
    utmContent?: string | null;
    referrer?: string | null;
  };

  const updateData: Record<string, unknown> = {};
  if (data !== undefined && typeof data === "object" && data !== null) updateData.data = data;
  if (utmSource !== undefined) updateData.utmSource = utmSource || null;
  if (utmMedium !== undefined) updateData.utmMedium = utmMedium || null;
  if (utmCampaign !== undefined) updateData.utmCampaign = utmCampaign || null;
  if (utmTerm !== undefined) updateData.utmTerm = utmTerm || null;
  if (utmContent !== undefined) updateData.utmContent = utmContent || null;
  if (referrer !== undefined) updateData.referrer = referrer || null;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "수정할 항목이 없어요" }, { status: 400 });
  }

  // sourceId 로 반드시 함께 스코프한다. authorize(id) 는 "이 소스의 워크스페이스 멤버인가"만 보므로,
  // recordId 만으로 update 하면 자기 소스 id + 남의 레코드 id 조합으로 다른 워크스페이스의
  // 레코드를 수정할 수 있다(활동 로그는 공격자 워크스페이스에 남아 피해자는 알지도 못한다).
  // GET 은 이미 findFirst({ id, sourceId }) 로 걸러 왔는데 PATCH/DELETE 만 빠져 있었다.
  const target = await prisma.collectRecord.findFirst({
    where: { id: recordId, sourceId: id },
    select: { id: true },
  });
  if (!target) return NextResponse.json({ error: "레코드를 찾을 수 없어요" }, { status: 404 });

  const record = await prisma.collectRecord.update({
    where: { id: target.id },
    data: updateData,
  });

  await logActivity({
    workspaceId: auth.source.workspaceId,
    sourceId: id,
    userId: auth.userId,
    action: "record.updated",
    meta: { recordId, fields: Object.keys(updateData) },
  });

  return NextResponse.json({ record });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; recordId: string }> }) {
  const { id, recordId } = await params;
  const auth = await authorize(id, true);
  if ("error" in auth) return auth.error;

  // PATCH 와 같은 이유로 sourceId 를 함께 걸어 확인한다 — 스코프 없이 지우면 남의 워크스페이스
  // 레코드를 삭제할 수 있고, 삭제는 되돌릴 수 없다.
  const target = await prisma.collectRecord.findFirst({
    where: { id: recordId, sourceId: id },
    select: { id: true },
  });
  if (!target) return NextResponse.json({ error: "레코드를 찾을 수 없어요" }, { status: 404 });

  await prisma.collectRecord.delete({ where: { id: target.id } });

  await logActivity({
    workspaceId: auth.source.workspaceId,
    sourceId: id,
    userId: auth.userId,
    action: "record.deleted",
    meta: { recordId },
  });

  return NextResponse.json({ ok: true });
}
