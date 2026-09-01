/**
 * 발행 — draft 를 **서버가 다시 정규화해** published 에 굳힌다.
 *
 * 클라이언트가 보낸 것을 그대로 굳히지 않는다. 발행본은 공개 로더가 읽는 유일한 원본이라,
 * 여기 들어간 것은 이미 검증을 통과한 것이어야 한다.
 * draftRevision 은 건드리지 않는다 — 진행 중인 자동저장을 충돌로 막으면 안 된다.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardExpoRoute, authFailure } from "@/lib/expo/route-guard";
import { requireOwnedPage, requireProjectAccess } from "@/lib/expo/auth";
import { deriveExpoPermissions } from "@/lib/expo/permissions";
import { preparePublish } from "@/lib/expo/site-service";
import { launchLockIssue, publishIssues } from "@/lib/expo/readiness";
import { newlyEmbedEnabled } from "@/lib/expo/release-gate";

export async function POST(request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const guard = await guardExpoRoute(request, { write: true });
  if (!guard.ok) return guard.response;

  const page = await prisma.expoPage.findFirst({
    where: { id: pageId, deletedAt: null },
    select: {
      id: true, siteId: true, draft: true, published: true,
      site: { select: { id: true, workspaceId: true, projectId: true } },
    },
  });
  const owned = requireOwnedPage(page, guard.ctx.userId, guard.ctx.memberWorkspaceIds);
  if (!owned.ok) return authFailure(owned.failure);
  const access = requireProjectAccess(guard.ctx.workspaceRole(owned.value.site.workspaceId), guard.ctx.projectRole(owned.value.site.projectId));
  if (!access.ok) return authFailure(access.failure);

  /**
   * 발행은 **역할까지** 본다. 멤버십만 보면 MEMBER 도 발행할 수 있는데, 화면은 그에게
   * `canPublish: false` 라고 말한다(`permissions.ts`) — 숨긴 버튼을 API 로는 누를 수 있는
   * 상태였다. 버튼을 숨기는 것은 인가가 아니고, 라우트가 제자리에서 다시 판정해야 한다.
   */
  if (!deriveExpoPermissions(guard.ctx.workspaceRole(owned.value.site.workspaceId), guard.ctx.projectRole(owned.value.site.projectId)).canPublish) {
    return authFailure({ kind: "forbidden" });
  }

  // 왜 못 나가는지를 운영자 말로 돌려준다 — 화면이 그 카드로 데려간다.
  const issues = publishIssues(page!.draft);
  if (issues.length > 0) {
    return NextResponse.json({ error: "아직 발행할 수 없어요", issues }, { status: 422 });
  }

  /**
   * **발행만으로도 노출이 장전된다.** 구획 단독 임베드는 `liveAt` 을 보지 않고 발행본만
   * 본다(`model.ts` 의 `standaloneSection`) — 그래서 공개 스위치를 잠그는 것만으로는
   * 부족하다. 릴리스 승인 전에는 이번 발행으로 **새로 켜지는** 구획이 있으면 막는다.
   *
   * 비교 대상이 `published` 인 것이 핵심이다: 발행의 효과는 발행본에 미치므로, 이미
   * 발행본에 켜져 있던 구획을 다시 발행하는 것은 새 노출이 아니다. 끄는 발행은 언제나 된다.
   */
  if (!guard.ctx.caps.publicEmbed) {
    const arming = newlyEmbedEnabled(page!.draft, page!.published);
    if (arming.length > 0) {
      return NextResponse.json(
        {
          error: "아직 발행할 수 없어요",
          issues: arming.map((sid) => launchLockIssue("launch-locked-embed", sid)),
        },
        { status: 422 },
      );
    }
  }

  const prepared = preparePublish(page!);
  const updated = await prisma.expoPage.update({
    where: { id: page!.id },
    data: {
      published: JSON.parse(JSON.stringify(prepared.published)),
      publishedAt: prepared.publishedAt,
    },
    select: { id: true, publishedAt: true },
  });
  return NextResponse.json({ page: updated });
}
