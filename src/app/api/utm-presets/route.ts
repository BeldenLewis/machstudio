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
  if (!wsId) return NextResponse.json({ presets: [] });

  const presets = await prisma.uTMPreset.findMany({
    where: { workspaceId: wsId },
    orderBy: [{ field: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ presets });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { workspaceId, field, value, label } = await request.json();
  if (!field || !value) return NextResponse.json({ error: "field와 value는 필수입니다" }, { status: 400 });

  const wsId = await resolveMemberWorkspaceId(workspaceId, user.id);
  if (!wsId) return NextResponse.json({ error: "워크스페이스 없음" }, { status: 400 });

  const trimmedValue = value.trim().toLowerCase();
  const trimmedLabel = label?.trim() || null;

  const existing = await prisma.uTMPreset.findFirst({
    where: { workspaceId: wsId, field, value: trimmedValue },
  });

  if (existing) {
    const updated = await prisma.uTMPreset.update({
      where: { id: existing.id },
      data: { label: trimmedLabel },
    });
    await logActivity({
      workspaceId: wsId,
      userId: user.id,
      action: "utmPreset.updated",
      meta: { presetId: updated.id, field, value: trimmedValue },
    });
    return NextResponse.json({ preset: updated });
  }

  // 새 항목은 현재 필드의 마지막 순서로 추가
  const last = await prisma.uTMPreset.findFirst({
    where: { workspaceId: wsId, field },
    orderBy: { sortOrder: "desc" },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;

  const preset = await prisma.uTMPreset.create({
    data: { id: crypto.randomUUID(), workspaceId: wsId, field, value: trimmedValue, label: trimmedLabel, sortOrder },
  });

  await logActivity({
    workspaceId: wsId,
    userId: user.id,
    action: "utmPreset.created",
    meta: { presetId: preset.id, field, value: trimmedValue, label: trimmedLabel },
  });

  return NextResponse.json({ preset });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const body = await request.json();

  // 순서 일괄 변경: { orders: [{ id, sortOrder }] }
  if (body.orders) {
    await Promise.all(
      (body.orders as { id: string; sortOrder: number }[]).map(({ id, sortOrder }) =>
        prisma.uTMPreset.update({ where: { id }, data: { sortOrder } })
      )
    );
    return NextResponse.json({ ok: true });
  }

  // 단일 수정: { id, value?, label? }
  const { id, value, label } = body;
  if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 });

  // 대상 레코드의 워크스페이스에 내가 속해 있는지 확인한다 — 예전엔 로그인만 확인하고
  // body 의 id 로 곧바로 update 를 실행해서, 남의 워크스페이스 프리셋을 고칠 수 있었다.
  const target = await prisma.uTMPreset.findUnique({ where: { id }, select: { workspaceId: true } });
  if (!target || !(await isWorkspaceMember(user.id, target.workspaceId))) {
    return NextResponse.json({ error: "프리셋을 찾을 수 없어요" }, { status: 404 });
  }

  try {
    const updated = await prisma.uTMPreset.update({
      where: { id },
      data: {
        ...(value !== undefined && { value: value.trim().toLowerCase() }),
        label: label?.trim() || null,
      },
    });
    await logActivity({
      workspaceId: updated.workspaceId,
      userId: user.id,
      action: "utmPreset.updated",
      meta: { presetId: updated.id, field: updated.field, value: updated.value },
    });
    return NextResponse.json({ preset: updated });
  } catch {
    return NextResponse.json({ error: "이미 존재하는 값이에요" }, { status: 409 });
  }
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await request.json();
  const existing = await prisma.uTMPreset.findUnique({ where: { id } });
  // 삭제는 되돌릴 수 없다 — 내 워크스페이스 것인지 반드시 확인한다. 예전엔 확인 없이 지웠고,
  // 활동 로그마저 피해 워크스페이스에 남아 피해자는 자기 로그에서 남의 행위를 보게 됐다.
  if (!existing || !(await isWorkspaceMember(user.id, existing.workspaceId))) {
    return NextResponse.json({ error: "프리셋을 찾을 수 없어요" }, { status: 404 });
  }
  await prisma.uTMPreset.delete({ where: { id } });

  {
    await logActivity({
      workspaceId: existing.workspaceId,
      userId: user.id,
      action: "utmPreset.deleted",
      meta: { presetId: id, field: existing.field, value: existing.value },
    });
  }

  return NextResponse.json({ ok: true });
}
