/**
 * 템플릿에서 **새 사이트를 만든다** — 비공개로.
 *
 * ── 절대 조건 ─────────────────────────────────────────────────────────
 * 만들어진 사이트는 발행도 공개도 되어 있지 않다. 템플릿을 골랐다는 이유로 **지난 전시
 * 문구가 파트너 사이트에 나가는 일**은 없어야 한다. 식별자(페이지 id·섹션 sid·미리보기
 * 토큰)도 전부 새로 발급한다 — 옛 스니펫 URL 이 새 사이트를 가리키면 안 된다.
 *
 * ── 순서 ──────────────────────────────────────────────────────────────
 * ① 사이트 id 를 먼저 발급(Storage 목적지가 그 id 다)
 * ② 템플릿 미디어를 새 사이트 경로로 복사 — 템플릿 원본은 그대로 둔다
 * ③ 사이트 + 페이지를 **한 트랜잭션**으로. 실패하면 ②를 되돌린다
 */
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { guardExpoRoute, readJsonBody, authFailure, fieldErrors, asJson } from "@/lib/expo/route-guard";
import { requireMembership, requireOwnedTemplate } from "@/lib/expo/auth";
import { copyExpoMedia, expoSitePrefix, expoTemplatePrefix } from "@/lib/expo/media";
import { createExpoStorage } from "@/lib/expo/storage";
import { applyMediaToPages, planTemplateInstantiate, reconnectChecklist } from "@/lib/expo/template-service";

export async function POST(request: Request, { params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const guard = await guardExpoRoute(request, { write: true });
  if (!guard.ok) return guard.response;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const name = String(parsed.body.name ?? "").trim().slice(0, 120);
  const projectId = String(parsed.body.projectId ?? "");
  if (!name || !projectId) {
    return fieldErrors([{ path: "name", code: "required", message: "전시와 홈페이지 이름이 필요해요" }]);
  }

  const row = await prisma.expoTemplate.findFirst({
    where: { id: templateId },
    select: { id: true, workspaceId: true, snapshot: true },
  });
  const owned = requireOwnedTemplate(row, guard.ctx.userId, guard.ctx.memberWorkspaceIds);
  if (!owned.ok) return authFailure(owned.failure);

  // 목적지 소속은 **프로젝트 레코드**에서 온다 — 클라이언트가 보낸 워크스페이스를 믿지 않는다.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, workspaceId: true },
  });
  if (!project) return authFailure({ kind: "not-found" });

  const member = requireMembership(guard.ctx.userId, guard.ctx.memberWorkspaceIds, project.workspaceId);
  if (!member.ok) return authFailure(member.failure);

  let plan;
  try {
    plan = planTemplateInstantiate(row!.snapshot);
  } catch {
    // 스냅샷을 못 읽으면 반쪽짜리 사이트를 만들지 않는다.
    return NextResponse.json({ error: "템플릿을 읽을 수 없어요" }, { status: 422 });
  }
  if (plan.pages.length === 0) {
    return NextResponse.json({ error: "템플릿에 페이지가 없어요" }, { status: 422 });
  }

  // ① 사이트 id 를 먼저.
  const siteId = randomUUID();
  const storage = createExpoStorage();

  // ② 템플릿 → 새 사이트. 템플릿 원본 파일은 남는다(다음 전시도 쓴다).
  const media = await copyExpoMedia(storage, {
    urls: plan.mediaUrls,
    sourcePrefix: expoTemplatePrefix(owned.value.workspaceId, owned.value.id),
    destPrefix: expoSitePrefix(project.workspaceId, siteId),
  });
  if (!media.ok) {
    const cleaned = await media.cleanup();
    if (!cleaned.ok) console.error("[expo] 복제 미디어 고아", cleaned.orphans);
    return NextResponse.json({ error: "이미지를 옮기지 못했어요" }, { status: 502 });
  }

  const pages = applyMediaToPages(plan.pages, media.map);
  // 부모가 자식보다 먼저 들어가야 외래키가 성립한다 — 최상위를 앞으로.
  const ordered = [...pages].sort((a, b) => Number(Boolean(a.parentId)) - Number(Boolean(b.parentId)));

  // ③ 한 트랜잭션. 실패하면 ②를 되돌린다.
  try {
    await prisma.$transaction([
      prisma.expoSite.create({
        data: {
          id: siteId,
          workspaceId: project.workspaceId,
          projectId: project.id,
          name,
          theme: asJson(plan.theme),
          defaultLocale: plan.defaultLocale,
          // 미리보기 토큰도 새로 발급한다 — 템플릿에는 담기지 않는 값이다.
          previewToken: randomUUID(),
        },
      }),
      ...ordered.map((page) => prisma.expoPage.create({
        data: {
          id: page.id,
          siteId,
          parentId: page.parentId,
          slug: page.slug,
          title: page.title,
          isHome: page.isHome,
          sortOrder: page.sortOrder,
          draft: asJson(page.draft),
          // 발행·공개는 전부 꺼진 채로 시작한다.
          published: undefined,
          liveAt: null,
        },
      })),
    ]);
  } catch {
    const cleaned = await media.cleanup();
    if (!cleaned.ok) console.error("[expo] 복제 미디어 고아", cleaned.orphans);
    return NextResponse.json({ error: "홈페이지를 만들지 못했어요" }, { status: 500 });
  }

  return NextResponse.json({
    site: { id: siteId, name, projectId: project.id, pageCount: pages.length },
    checklist: reconnectChecklist({
      registerFormSections: plan.registerFormSections,
      linksCleared: plan.linksCleared,
      externalMedia: media.notCopied,
      needsImwebUrls: true,
    }),
  }, { status: 201 });
}
