/**
 * 홈페이지 사이트 목록·생성.
 *
 * 목록은 **프로젝트 문맥**에서 그린다 — 사이드바가 고른 프로젝트를 쿼리로 받는다.
 * 상세 화면과 달리 목록은 그게 맞다(무엇을 보여줄지 고르는 일이다).
 * 다만 그 프로젝트가 내 워크스페이스인지는 서버가 확인한다.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardExpoRoute, readJsonBody, authFailure } from "@/lib/expo/route-guard";
import { requireMembership } from "@/lib/expo/auth";
import { normalizeExpoTheme, EXPO_DEFAULT_THEME } from "@/lib/expo/config";
import { homePageDefaults } from "@/lib/expo/model";
import { randomUUID } from "node:crypto";

export async function GET(request: Request) {
  const guard = await guardExpoRoute(request);
  if (!guard.ok) return guard.response;

  const projectId = new URL(request.url).searchParams.get("projectId");
  const sites = await prisma.expoSite.findMany({
    where: {
      deletedAt: null,
      workspaceId: { in: guard.ctx.memberWorkspaceIds },
      ...(projectId ? { projectId } : {}),
    },
    select: {
      id: true, name: true, projectId: true, siteUrl: true, updatedAt: true,
      _count: { select: { pages: { where: { deletedAt: null } } } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({
    sites: sites.map((s) => ({
      id: s.id, name: s.name, projectId: s.projectId, siteUrl: s.siteUrl,
      updatedAt: s.updatedAt, pageCount: s._count.pages,
    })),
  });
}

export async function POST(request: Request) {
  const guard = await guardExpoRoute(request, { write: true });
  if (!guard.ok) return guard.response;

  const parsed = await readJsonBody(request);
  if (!parsed.ok) return parsed.response;

  const projectId = String(parsed.body.projectId ?? "");
  const name = String(parsed.body.name ?? "").trim().slice(0, 120);
  if (!projectId || !name) {
    return NextResponse.json({ error: "전시와 이름이 필요해요" }, { status: 400 });
  }

  // 소속은 **프로젝트 레코드**에서 온다 — 클라이언트가 보낸 워크스페이스를 믿지 않는다.
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, workspaceId: true },
  });
  if (!project) return authFailure({ kind: "not-found" });

  const member = requireMembership(guard.ctx.userId, guard.ctx.memberWorkspaceIds, project.workspaceId);
  if (!member.ok) return authFailure(member.failure);

  const home = homePageDefaults("ko");
  const site = await prisma.expoSite.create({
    data: {
      workspaceId: project.workspaceId,
      projectId: project.id,
      name,
      // Prisma 의 Json 입력 타입은 인덱스 시그니처를 요구한다 — 우리 타입은 고정 키라 한 번 넓힌다.
      theme: { ...normalizeExpoTheme(parsed.body.theme ?? EXPO_DEFAULT_THEME) },
      previewToken: randomUUID(),
      pages: { create: [{ ...home, draft: home.draft }] },
    },
    select: { id: true, name: true, projectId: true },
  });

  return NextResponse.json({ site }, { status: 201 });
}
