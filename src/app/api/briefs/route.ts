/**
 * 브리프 목록·생성 — 프로젝트 단위.
 * 한 프로젝트에 보통 하나(The Action)지만, 시리즈를 더 얹을 수 있게(The Insight 등) 목록으로 둔다.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyPreset, guardProject, publicBriefUrl } from "@/lib/brief/server";
import { BRIEF_PRESETS, presetForProject } from "@/lib/brief/sources";
import { collectBrief } from "@/lib/brief/collect";
import { toSlug } from "@/lib/brief/model";

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get("projectId") ?? "";
  if (!projectId) return NextResponse.json({ error: "projectId 필요" }, { status: 400 });
  const g = await guardProject(projectId, { write: false });
  if (!g.ok) return g.response;

  const [briefs, project] = await Promise.all([
    prisma.brief.findMany({ where: { projectId, deletedAt: null }, orderBy: { createdAt: "asc" } }),
    prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
  ]);
  return NextResponse.json({
    canWrite: g.canWrite,
    // 코리아 엑스포 프로젝트는 고르지 않고 바로 해외진출 세트로 시작한다 — 화면이 이 값을 보고 자동 생성한다.
    suggestedPreset: presetForProject(project?.name ?? "")?.key ?? null,
    presets: BRIEF_PRESETS.map((p) => ({ key: p.key, label: p.label, description: p.description, name: p.brief.name })),
    briefs: briefs.map((b) => ({ ...b, publicUrl: publicBriefUrl(request, b.slug) })),
  });
}

/** 공개 주소가 겹치면 뒤에 숫자를 붙인다 — 슬러그는 전역 유일이다(/b/{slug}). */
async function uniqueSlug(base: string): Promise<string> {
  const root = base || `brief-${Math.random().toString(36).slice(2, 8)}`;
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const taken = await prisma.brief.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 60) : "";
  if (!projectId || !name) return NextResponse.json({ error: "프로젝트와 이름이 필요해요" }, { status: 400 });

  const g = await guardProject(projectId, { write: true });
  if (!g.ok) return g.response;

  const requested = typeof body?.slug === "string" ? toSlug(body.slug) : "";
  const preset = BRIEF_PRESETS.find((p) => p.key === body?.preset) ?? null;
  const brief = await prisma.brief.create({
    data: {
      workspaceId: g.workspaceId,
      projectId,
      name,
      slug: await uniqueSlug(requested || toSlug(name)),
      intro: typeof body?.intro === "string" ? body.intro.slice(0, 200) : "",
    },
  });
  if (preset) {
    await applyPreset(brief.id, preset);
    // 첫 수집을 바로 돌린다 — 만들자마자 빈 목록을 보여 주지 않게. 실패해도 생성은 성공이다.
    await collectBrief(brief.id).catch(() => null);
  }
  return NextResponse.json({ brief: { ...brief, publicUrl: publicBriefUrl(request, brief.slug) } }, { status: 201 });
}
