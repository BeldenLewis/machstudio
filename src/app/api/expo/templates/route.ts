/**
 * 템플릿 목록·저장.
 *
 * 템플릿은 **워크스페이스**에 매달린다 — 프로젝트가 아니다. 다음 전시가 고르는 것이므로
 * 만든 전시가 끝나도 남아 있어야 한다.
 *
 * ── 저장의 순서 ───────────────────────────────────────────────────────
 * ① 템플릿 id 를 먼저 발급한다(Storage 목적지가 그 id 다)
 * ② 소유한 미디어를 템플릿 경로로 복사한다
 * ③ DB 에 한 번 쓴다
 * 실패하면 이번 작업이 만든 객체만 지운다. 지우기까지 실패하면 성공이라고 말하지 않는다.
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { guardExpoRoute, readJsonBody, authFailure, fieldErrors, asJson } from "@/lib/expo/route-guard";
import { requireOwnedSite } from "@/lib/expo/auth";
import { copyExpoMedia, expoSitePrefix, expoTemplatePrefix } from "@/lib/expo/media";
import { createExpoStorage } from "@/lib/expo/storage";
import {
  applyMediaToSnapshot, normalizeTemplateMeta, planTemplateSave, reconnectChecklist,
} from "@/lib/expo/template-service";
import { EXPO_LIMITS } from "@/lib/expo/registry";

export async function GET(request: Request) {
  const guard = await guardExpoRoute(request);
  if (!guard.ok) return guard.response;

  // 스냅샷은 싣지 않는다 — 목록에 담으면 응답이 수 MB 가 되고 화면이 쓰지도 않는다.
  const templates = await prisma.expoTemplate.findMany({
    where: { workspaceId: { in: guard.ctx.memberWorkspaceIds } },
    select: { id: true, workspaceId: true, name: true, description: true, snapshot: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    templates: templates.map((t) => {
      const snap = (t.snapshot ?? {}) as { contentMode?: string; pages?: unknown[] };
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        contentMode: snap.contentMode === "full" ? "full" : "design",
        pageCount: Array.isArray(snap.pages) ? snap.pages.length : 0,
        createdAt: t.createdAt,
        canManage: guard.ctx.workspaceRole(t.workspaceId) !== "MEMBER",
      };
    }),
  });
}

export async function POST(request: Request) {
  const guard = await guardExpoRoute(request, { write: true });
  if (!guard.ok) return guard.response;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const meta = normalizeTemplateMeta(parsed.body);
  if (!meta.ok) return fieldErrors([{ path: meta.field, code: "invalid", message: meta.message }]);

  const siteId = String(parsed.body.siteId ?? "");
  // 소속은 **사이트 레코드**에서 온다 — 사이드바의 현재 프로젝트를 보지 않는다.
  const site = await prisma.expoSite.findFirst({
    where: { id: siteId, deletedAt: null },
    select: { id: true, workspaceId: true, projectId: true, theme: true, siteUrl: true },
  });
  const owned = requireOwnedSite(site, guard.ctx.userId, guard.ctx.memberWorkspaceIds);
  if (!owned.ok) return authFailure(owned.failure);

  const pages = await prisma.expoPage.findMany({
    where: { siteId: owned.value.id, deletedAt: null },
    select: {
      id: true, slug: true, title: true, isHome: true, sortOrder: true,
      parentId: true, imwebUrl: true, draft: true,
    },
    orderBy: { sortOrder: "asc" },
  });

  let plan;
  try {
    plan = planTemplateSave({
      theme: site!.theme,
      pages,
      contentMode: meta.value.contentMode,
      siteImwebUrls: site!.siteUrl ? [site!.siteUrl] : [],
    });
  } catch {
    // buildExpoTemplate 는 상한을 넘으면 던진다 — 자르지 않고 거절한다.
    return fieldErrors([{
      path: "snapshot", code: "too-large",
      message: `템플릿이 너무 커요 (${Math.round(EXPO_LIMITS.templateSnapshotBytes / (1024 * 1024))}MB 상한)`,
    }]);
  }

  // ① id 를 먼저 발급한다 — Storage 목적지가 이 id 다.
  const templateId = randomUUID();
  const storage = createExpoStorage();

  // ② 미디어 복사. 원본 사이트 파일은 건드리지 않는다.
  const media = await copyExpoMedia(storage, {
    urls: plan.mediaUrls,
    sourcePrefix: expoSitePrefix(owned.value.workspaceId, owned.value.id),
    destPrefix: expoTemplatePrefix(owned.value.workspaceId, templateId),
  });
  if (!media.ok) {
    const cleaned = await media.cleanup();
    if (!cleaned.ok) console.error("[expo] 템플릿 미디어 고아", cleaned.orphans);
    return NextResponse.json({ error: "이미지를 옮기지 못했어요" }, { status: 502 });
  }

  // ③ DB 쓰기. 여기서 실패하면 ②가 만든 것을 되돌린다.
  const snapshot = applyMediaToSnapshot(plan.snapshot, media.map);
  try {
    await prisma.expoTemplate.create({
      data: {
        id: templateId,
        workspaceId: owned.value.workspaceId,
        name: meta.value.name,
        description: meta.value.description,
        snapshot: asJson(snapshot),
      },
    });
  } catch {
    const cleaned = await media.cleanup();
    if (!cleaned.ok) console.error("[expo] 템플릿 미디어 고아", cleaned.orphans);
    return NextResponse.json({ error: "템플릿을 저장하지 못했어요" }, { status: 500 });
  }

  return NextResponse.json({
    template: { id: templateId, name: meta.value.name, contentMode: meta.value.contentMode },
    checklist: reconnectChecklist({
      registerFormSections: plan.registerFormSections,
      linksCleared: plan.linksCleared,
      externalMedia: media.notCopied,
    }),
  }, { status: 201 });
}
