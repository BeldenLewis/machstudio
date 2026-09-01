/**
 * 템플릿 상세·이름 변경·영구 삭제.
 *
 * ── 왜 삭제만 권한이 다른가 ───────────────────────────────────────────
 * 템플릿은 워크스페이스 전역이다. 한 전시의 담당자가 지우면 **다른 전시들이 쓰던 틀이
 * 같이 사라진다.** 그래서 이름 변경·영구 삭제는 워크스페이스 OWNER·ADMIN 만 한다.
 * 반면 조회·복제는 멤버면 된다 — 그건 자기 전시 안에서만 일어난다.
 *
 * ── 삭제 순서 ─────────────────────────────────────────────────────────
 * DB 를 먼저 지우고 Storage 를 지운다. 반대로 하면 파일이 없는 템플릿이 목록에 남아
 * 다음 전시가 그걸 골라 **이미지가 다 깨진 사이트**를 만든다.
 * Storage 정리가 실패하면 202 로 "지웠지만 정리가 남았다" 를 정확히 말한다.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardExpoRoute, readJsonBody, authFailure, fieldErrors } from "@/lib/expo/route-guard";
import { requireOwnedTemplate, requireWorkspaceAdmin } from "@/lib/expo/auth";
import { expoTemplatePrefix, purgeExpoMediaPrefix } from "@/lib/expo/media";
import { createExpoStorage } from "@/lib/expo/storage";
import { normalizeTemplateMeta } from "@/lib/expo/template-service";
import { isBuiltInExpoPresetId } from "@/lib/expo/presets";

async function load(templateId: string) {
  return prisma.expoTemplate.findFirst({
    where: { id: templateId },
    select: { id: true, workspaceId: true, name: true, description: true, snapshot: true, createdAt: true },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const guard = await guardExpoRoute(request);
  if (!guard.ok) return guard.response;

  const row = await load(templateId);
  const owned = requireOwnedTemplate(row, guard.ctx.userId, guard.ctx.memberWorkspaceIds);
  if (!owned.ok) return authFailure(owned.failure);

  const snap = (row!.snapshot ?? {}) as { contentMode?: string; theme?: unknown; pages?: unknown[] };
  return NextResponse.json({
    template: {
      id: row!.id,
      name: row!.name,
      description: row!.description,
      contentMode: snap.contentMode === "full" ? "full" : "design",
      theme: snap.theme ?? null,
      // 미리보기는 구조만 보여 준다 — 전체 스냅샷은 복제할 때 서버 안에서만 쓴다.
      pages: (Array.isArray(snap.pages) ? snap.pages : []).map((p) => {
        const page = (p ?? {}) as { key?: string; title?: string; isHome?: boolean; sections?: unknown[] };
        return {
          key: String(page.key ?? ""),
          title: String(page.title ?? ""),
          isHome: page.isHome === true,
          sectionTypes: (Array.isArray(page.sections) ? page.sections : [])
            .map((s) => String(((s ?? {}) as { type?: string }).type ?? "")),
        };
      }),
      createdAt: row!.createdAt,
      canManage: guard.ctx.workspaceRole(row!.workspaceId) !== "MEMBER",
    },
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const guard = await guardExpoRoute(request, { write: true });
  if (!guard.ok) return guard.response;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  // 예약 id는 DB에 같은 행이 생겨도 관리 대상이 아니다.
  if (isBuiltInExpoPresetId(templateId)) return authFailure({ kind: "not-found" });

  const row = await load(templateId);
  const owned = requireOwnedTemplate(row, guard.ctx.userId, guard.ctx.memberWorkspaceIds);
  if (!owned.ok) return authFailure(owned.failure);

  const admin = requireWorkspaceAdmin(guard.ctx.userId, guard.ctx.workspaceRole(owned.value.workspaceId));
  if (!admin.ok) return authFailure(admin.failure);

  // contentMode 는 스냅샷의 성질이라 이름 변경으로 바뀌지 않는다 — 여기서는 무시한다.
  const meta = normalizeTemplateMeta(parsed.body);
  if (!meta.ok) return fieldErrors([{ path: meta.field, code: "invalid", message: meta.message }]);

  const updated = await prisma.expoTemplate.update({
    where: { id: owned.value.id },
    data: { name: meta.value.name, description: meta.value.description },
    select: { id: true, name: true, description: true },
  });
  return NextResponse.json({ template: updated });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const guard = await guardExpoRoute(request, { write: true });
  if (!guard.ok) return guard.response;

  if (isBuiltInExpoPresetId(templateId)) return authFailure({ kind: "not-found" });

  const row = await load(templateId);
  const owned = requireOwnedTemplate(row, guard.ctx.userId, guard.ctx.memberWorkspaceIds);
  if (!owned.ok) return authFailure(owned.failure);

  const admin = requireWorkspaceAdmin(guard.ctx.userId, guard.ctx.workspaceRole(owned.value.workspaceId));
  if (!admin.ok) return authFailure(admin.failure);

  // DB 가 먼저다 — 파일 없는 템플릿이 목록에 남는 쪽이 더 나쁘다.
  await prisma.expoTemplate.delete({ where: { id: owned.value.id } });

  const prefix = expoTemplatePrefix(owned.value.workspaceId, owned.value.id);
  const cleaned = await purgeExpoMediaPrefix(createExpoStorage(), prefix);
  if (!cleaned.ok) {
    // 지운 것은 사실이다. 정리가 남았다는 것까지 정확히 말한다.
    console.error("[expo] 템플릿 미디어 고아", prefix, cleaned.orphans);
    return NextResponse.json({ deleted: true, cleanupPending: true }, { status: 202 });
  }
  return NextResponse.json({ deleted: true });
}
