import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOwnedPage, requireProjectAccess } from "@/lib/expo/auth";
import { normalizeExpoPage, normalizeExpoTheme } from "@/lib/expo/config";
import { prepareStandaloneExpoHtml, type ExpoExportScope } from "@/lib/expo/export";
import { deriveExpoPermissions } from "@/lib/expo/permissions";
import { collectInternalPageIds } from "@/lib/expo/payload";
import { authFailure, guardExpoRoute, readJsonBody } from "@/lib/expo/route-guard";
import type { ExpoPageConfigV2 } from "@/lib/expo/types";

function parseScope(body: Record<string, unknown>): ExpoExportScope | null {
  const keys = Object.keys(body).sort();
  if (body.scope === "page" && keys.length === 1 && keys[0] === "scope") return { type: "page" };
  if (body.scope === "section" && keys.length === 2 && keys[0] === "scope" && keys[1] === "sid"
    && typeof body.sid === "string" && body.sid.trim()) {
    return { type: "section", sid: body.sid.trim() };
  }
  return null;
}

const badBody = () => NextResponse.json({ error: "내보내기 범위가 올바르지 않아요" }, { status: 400 });

export async function POST(request: Request, { params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const guard = await guardExpoRoute(request, { write: true });
  if (!guard.ok) return guard.response;

  const page = await prisma.expoPage.findFirst({
    where: { id: pageId, deletedAt: null },
    select: {
      id: true,
      siteId: true,
      published: true,
      site: {
        select: { id: true, workspaceId: true, projectId: true, theme: true, defaultLocale: true },
      },
    },
  });
  const owned = requireOwnedPage(page, guard.ctx.userId, guard.ctx.memberWorkspaceIds);
  if (!owned.ok) return authFailure(owned.failure);
  const workspaceRole = guard.ctx.workspaceRole(owned.value.site.workspaceId);
  const projectRole = guard.ctx.projectRole(owned.value.site.projectId);
  const access = requireProjectAccess(workspaceRole, projectRole);
  if (!access.ok) return authFailure(access.failure);
  if (!deriveExpoPermissions(workspaceRole, projectRole).canPublish) return authFailure({ kind: "forbidden" });

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const scope = parseScope(parsed.body);
  if (!scope) return badBody();

  if (!page!.published) {
    const issues = [{
      path: "revision",
      code: "standalone-republish-required",
      message: "먼저 페이지를 발행해 주세요.",
      severity: "error" as const,
    }];
    return NextResponse.json({ error: issues[0].message, code: issues[0].code, issues }, { status: 409 });
  }

  const published = page!.published as unknown as ExpoPageConfigV2;
  const config = normalizeExpoPage(published);
  const pageIds = collectInternalPageIds(config.sections);
  const [revision, pages] = await Promise.all([
    prisma.expoPageRevision.findFirst({
      where: { pageId: page!.id },
      orderBy: { sequence: "desc" },
      select: { sequence: true, codeDigest: true },
    }),
    pageIds.length > 0
      ? prisma.expoPage.findMany({
        where: { id: { in: pageIds }, siteId: page!.siteId, deletedAt: null },
        select: { id: true, imwebUrl: true, deletedAt: true },
      })
      : Promise.resolve([]),
  ]);

  const result = prepareStandaloneExpoHtml({
    pageId: page!.id,
    revisionSequence: revision?.sequence ?? null,
    revisionCodeDigest: revision?.codeDigest ?? null,
    exportedAt: new Date(),
    scope,
    // Rendering is normalized in the builder, but it also inspects the stored snapshot first so
    // an unsafe legacy media URL/modal fallback cannot disappear silently during normalization.
    config: published,
    theme: normalizeExpoTheme(page!.site.theme),
    locale: page!.site.defaultLocale || "ko",
    pages,
  });
  if (!result.ok) {
    return NextResponse.json({
      error: result.issues[0]?.message ?? "백업 HTML을 만들 수 없어요",
      code: result.issues[0]?.code,
      issues: result.issues,
    }, { status: result.status });
  }

  return new NextResponse(result.html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
