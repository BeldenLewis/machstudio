import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: id } },
    include: { workspace: { include: { projects: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } } } } },
  });

  if (!membership) return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  if (membership.workspace.deletedAt) return NextResponse.json({ error: "삭제된 워크스페이스" }, { status: 404 });

  return NextResponse.json({
    workspace: {
      id: membership.workspace.id,
      name: membership.workspace.name,
      slug: membership.workspace.slug,
      // 약관 전문 템플릿 — 워크스페이스 설정에서 편집하고 등록 폼이 상속한다.
      privacyBodyTemplate: membership.workspace.privacyBodyTemplate,
      marketingBodyTemplate: membership.workspace.marketingBodyTemplate,
    },
    projects: membership.workspace.projects,
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const { name, privacyBodyTemplate, marketingBodyTemplate } = body ?? {};

  /**
   * 이름과 약관 템플릿은 **따로 저장된다** — 템플릿만 바꾸는 호출에 이름을 요구하면
   * 워크스페이스 설정 화면이 이름을 매번 함께 보내야 하고, 그러면 옛 스냅샷이 이름을 되돌린다.
   * 그래서 보낸 키만 반영한다(기존 name-only 호출은 그대로 동작).
   */
  const wantsName = name !== undefined;
  const wantsTemplates = privacyBodyTemplate !== undefined || marketingBodyTemplate !== undefined;
  if (!wantsName && !wantsTemplates) {
    return NextResponse.json({ error: "바꿀 값이 없어요" }, { status: 400 });
  }
  if (wantsName && !name?.trim()) {
    return NextResponse.json({ error: "이름을 입력해주세요" }, { status: 400 });
  }
  // 빈 문자열은 "템플릿 없음"(null)으로 저장한다 — 상속 판정이 trim 기준이라 저장도 같은 기준.
  const asTemplate = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: id } },
    include: { workspace: true },
  });
  if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  }

  const before = membership.workspace.name;
  const workspace = await prisma.workspace.update({
    where: { id },
    data: {
      ...(wantsName && { name: name.trim() }),
      ...(privacyBodyTemplate !== undefined && { privacyBodyTemplate: asTemplate(privacyBodyTemplate) }),
      ...(marketingBodyTemplate !== undefined && { marketingBodyTemplate: asTemplate(marketingBodyTemplate) }),
    },
  });

  if (wantsName) {
    await logActivity({
      workspaceId: id,
      userId: user.id,
      action: "workspace.renamed",
      meta: { before, after: workspace.name },
    });
  }
  if (wantsTemplates) {
    // 전문 본문은 로그에 남기지 않는다 — 어떤 것을 바꿨는지만.
    await logActivity({
      workspaceId: id,
      userId: user.id,
      action: "workspace.consent_template_updated",
      meta: {
        privacy: privacyBodyTemplate !== undefined,
        marketing: marketingBodyTemplate !== undefined,
      },
    });
  }

  return NextResponse.json({ workspace });
}

// 워크스페이스 삭제 (soft-delete) — OWNER만 가능. 확인 이름 일치 필수.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const confirmName = typeof body.confirmName === "string" ? body.confirmName.trim() : "";
  if (!confirmName) return NextResponse.json({ error: "워크스페이스 이름 확인이 필요합니다." }, { status: 400 });

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: id } },
    include: { workspace: true },
  });
  if (!membership) return NextResponse.json({ error: "권한 없음" }, { status: 403 });
  if (membership.role !== "OWNER") {
    return NextResponse.json({ error: "워크스페이스 OWNER만 삭제할 수 있습니다." }, { status: 403 });
  }
  if (membership.workspace.deletedAt) {
    return NextResponse.json({ error: "이미 삭제된 워크스페이스입니다." }, { status: 404 });
  }
  if (membership.workspace.name !== confirmName) {
    return NextResponse.json({ error: "워크스페이스 이름이 일치하지 않습니다." }, { status: 400 });
  }

  await prisma.workspace.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await logActivity({
    workspaceId: id,
    userId: user.id,
    action: "workspace.deleted",
    meta: { name: membership.workspace.name },
  });

  return NextResponse.json({ ok: true });
}
