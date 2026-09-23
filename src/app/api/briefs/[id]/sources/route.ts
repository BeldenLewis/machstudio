/**
 * 브리프 자동 수집 소스 — 목록·추가·프리셋 적용.
 * 소스 주소(rss)는 사람이 넣지만, 실제로 여는 건 collect.ts 의 safeFetchText 라 내부망으로 못 간다.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyPreset, guardBrief } from "@/lib/brief/server";
import { BRIEF_PRESETS, isSourceKind, normalizeSourceCategory, normalizeSourceConfig } from "@/lib/brief/sources";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guardBrief(id, { write: false });
  if (!g.ok) return g.response;
  const sources = await prisma.briefSource.findMany({
    where: { briefId: id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({
    canWrite: g.canWrite,
    sources,
    presets: BRIEF_PRESETS.map((p) => ({ key: p.key, label: p.label, description: p.description })),
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guardBrief(id, { write: true });
  if (!g.ok) return g.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (typeof body?.preset === "string") {
    const preset = BRIEF_PRESETS.find((p) => p.key === body.preset);
    if (!preset) return NextResponse.json({ error: "없는 세트예요" }, { status: 400 });
    const added = await applyPreset(id, preset);
    return NextResponse.json({ added }, { status: 201 });
  }

  const kind = body?.kind;
  if (!isSourceKind(kind)) return NextResponse.json({ error: "소스 종류를 골라주세요" }, { status: 400 });
  const last = await prisma.briefSource.findFirst({ where: { briefId: id }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const source = await prisma.briefSource.create({
    data: {
      briefId: id,
      kind,
      name: typeof body?.name === "string" ? body.name.trim().slice(0, 40) : "",
      category: normalizeSourceCategory(body?.category ?? (kind === "googlenews" ? "news" : "auto")),
      config: normalizeSourceConfig(kind, body?.config) as object,
      sortOrder: (last?.sortOrder ?? -1) + 1,
    },
  });
  return NextResponse.json({ source }, { status: 201 });
}
