import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { requireOwnedSite } from "@/lib/expo/auth";
import { deriveExpoPermissions } from "@/lib/expo/permissions";
import { isExpoPublicEmbedReleaseEnabled } from "@/lib/expo/capability";
import type { WorkspaceRole } from "@/lib/expo/auth";
import { ExpoSiteEditor } from "@/components/expo/ExpoSiteEditor";

/**
 * 홈페이지 상세 — 탐색·편집·미리보기.
 *
 * ── 소속은 URL 자원에서 온다 ──────────────────────────────────────────
 * 사이드바에 떠 있는 프로젝트를 보지 않는다. 이 저장소는 그 사고를 겪었다 — 웨비나
 * 배포 탭이 사이드바의 현재 프로젝트로 아임웹 사이트를 조회·변경해서, 딥링크로 들어오면
 * **다른 전시의 공개 노출이 성공 토스트와 함께 바뀌었다**(AGENTS.md "새 면을 만들 때" ②).
 * 여기서는 서버가 `siteId` 로 소유권을 확인하고, 사이드바는 그 결과를 따라간다.
 */
export const dynamic = "force-dynamic";

export default async function HomepageDetailPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) notFound();

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id },
    select: { workspaceId: true, role: true },
  });
  const site = await prisma.expoSite.findFirst({
    where: { id: siteId, deletedAt: null },
    select: { id: true, workspaceId: true, projectId: true, name: true },
  });

  // 남의 워크스페이스면 **없는 것으로** 답한다 — 403 은 그 id 의 존재를 알려 준다.
  const owned = requireOwnedSite(site, user.id, memberships.map((m) => m.workspaceId));
  if (!owned.ok) notFound();

  const role = memberships.find((m) => m.workspaceId === owned.value.workspaceId)?.role as WorkspaceRole | undefined;

  return (
    <ExpoSiteEditor
      siteId={owned.value.id}
      projectId={owned.value.projectId}
      siteName={site!.name}
      permissions={deriveExpoPermissions(role ?? null)}
      release={{ publicEmbedEnabled: isExpoPublicEmbedReleaseEnabled() }}
    />
  );
}
