import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

function normalizeOriginInput(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

async function getSourceWithAuth(id: string, userId: string, requireAdmin = false) {
  const source = await prisma.collectSource.findUnique({ where: { id } });
  if (!source) return { error: "소스를 찾을 수 없어요", status: 404 };

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId: source.workspaceId } },
  });
  if (!membership) return { error: "접근 권한 없음", status: 403 };
  if (requireAdmin && membership.role === "MEMBER") return { error: "권한 없음", status: 403 };

  return { source, membership };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const result = await getSourceWithAuth(id, user.id);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const source = await prisma.collectSource.findUnique({
    where: { id },
    include: {
      fieldMappings: { orderBy: { sortOrder: "asc" } },
      _count: { select: { records: true } },
    },
  });

  return NextResponse.json({ source });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const result = await getSourceWithAuth(id, user.id, true);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const body = await request.json();
  const {
    name, description, siteUrl, successTrigger, redirectUrl, isActive,
    webhookUrl, notifyOnSubmit, allowedOrigins, formPagePatterns, dedupKeyFields,
  } = body;

  let normalizedAllowed: string[] | undefined;
  if (Array.isArray(allowedOrigins)) {
    normalizedAllowed = allowedOrigins
      .map((o) => normalizeOriginInput(o))
      .filter((o): o is string => !!o);
    // 중복 제거
    normalizedAllowed = Array.from(new Set(normalizedAllowed));
  }

  // formPagePatterns: 빈 배열도 valid (= "모든 페이지" 의미).
  // 각 항목은 trim + 200자 제한, 최대 20개.
  let normalizedFormPagePatterns: string[] | undefined;
  if (Array.isArray(formPagePatterns)) {
    normalizedFormPagePatterns = formPagePatterns
      .filter((p): p is string => typeof p === "string")
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && p.length <= 200);
    normalizedFormPagePatterns = Array.from(new Set(normalizedFormPagePatterns)).slice(0, 20);
  }

  // dedupKeyFields: 가져오기 중복 판정용 우선순위 필드 key 목록. 빈 배열 = 전체 시그니처 fallback.
  // trim + 빈값 제거 + 중복 제거, 최대 10개.
  let normalizedDedupKeyFields: string[] | undefined;
  if (Array.isArray(dedupKeyFields)) {
    normalizedDedupKeyFields = dedupKeyFields
      .filter((k): k is string => typeof k === "string")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
    normalizedDedupKeyFields = Array.from(new Set(normalizedDedupKeyFields)).slice(0, 10);
  }

  /**
   * 방식 전환은 **레코드가 0건일 때만** 허용한다(설계 §3.1).
   *
   * 연동형은 외부 폼의 필드명을, 빌더형은 빌더에서 정한 key 를 저장한다. 데이터가 쌓인 뒤
   * 바꾸면 한 소스 안에 두 체계의 레코드가 섞여 표·CSV·분석이 전부 어긋난다. 되돌릴 방법도 없다.
   * 막는 대신 새 소스를 만들도록 안내한다.
   */
  let nextMode: string | undefined;
  if (body.mode !== undefined) {
    const requested = body.mode === "builder" ? "builder" : "capture";
    if (requested !== result.source.mode) {
      const recordCount = await prisma.collectRecord.count({ where: { sourceId: id } });
      if (recordCount > 0) {
        return NextResponse.json(
          { error: `이미 ${recordCount.toLocaleString()}건이 수집돼 방식을 바꿀 수 없어요. 새 수집 소스를 만들어 주세요` },
          { status: 409 },
        );
      }
      nextMode = requested;
    }
  }

  const source = await prisma.collectSource.update({
    where: { id },
    data: {
      ...(nextMode !== undefined && {
        mode: nextMode,
        // 빌더형이 되는데 토큰이 없으면 지금 발급한다(연동형으로 만들어진 소스를 전환한 경우).
        ...(nextMode === "builder" && !result.source.previewToken && { previewToken: randomBytes(24).toString("base64url") }),
      }),
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description: description || null }),
      ...(siteUrl !== undefined && { siteUrl: siteUrl || null }),
      ...(successTrigger !== undefined && { successTrigger }),
      ...(redirectUrl !== undefined && { redirectUrl: redirectUrl || null }),
      ...(isActive !== undefined && { isActive }),
      ...(webhookUrl !== undefined && { webhookUrl: webhookUrl || null }),
      ...(notifyOnSubmit !== undefined && { notifyOnSubmit: !!notifyOnSubmit }),
      ...(normalizedAllowed !== undefined && { allowedOrigins: normalizedAllowed }),
      ...(normalizedFormPagePatterns !== undefined && { formPagePatterns: normalizedFormPagePatterns }),
      ...(normalizedDedupKeyFields !== undefined && { dedupKeyFields: normalizedDedupKeyFields }),
    },
    include: { fieldMappings: { orderBy: { sortOrder: "asc" } } },
  });

  await logActivity({
    workspaceId: source.workspaceId,
    sourceId: source.id,
    userId: user.id,
    action: "source.updated",
    meta: { fields: Object.keys(body) },
  });

  return NextResponse.json({ source });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const result = await getSourceWithAuth(id, user.id, true);
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const wsId = result.source.workspaceId;
  const srcName = result.source.name;
  // Soft delete: 30일 동안 복구 가능, 그 후 cron 으로 영구 제거
  await prisma.collectSource.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });

  await logActivity({
    workspaceId: wsId,
    sourceId: null,
    userId: user.id,
    action: "source.deleted",
    meta: { name: srcName, sourceId: id, softDelete: true },
  });

  return NextResponse.json({ ok: true, softDeleted: true });
}
