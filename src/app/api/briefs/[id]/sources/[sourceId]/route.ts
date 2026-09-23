import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardBrief } from "@/lib/brief/server";
import { isSourceKind, normalizeSourceCategory, normalizeSourceConfig } from "@/lib/brief/sources";

type Ctx = { params: Promise<{ id: string; sourceId: string }> };

/** URL 이 지목한 브리프의 소스인지 — 다른 브리프의 소스 id 를 끼워 넣는 걸 막는다. */
function owned(briefId: string, sourceId: string) {
  return prisma.briefSource.findFirst({ where: { id: sourceId, briefId } });
}

export async function PATCH(request: Request, { params }: Ctx) {
  const { id, sourceId } = await params;
  const g = await guardBrief(id, { write: true });
  if (!g.ok) return g.response;
  const current = await owned(id, sourceId);
  if (!current || !isSourceKind(current.kind)) return NextResponse.json({ error: "찾을 수 없어요" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim().slice(0, 40);
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if ("category" in body) data.category = normalizeSourceCategory(body.category);
  if (body.config && typeof body.config === "object") {
    // 일부만 보내도 되게 — 기존 설정 위에 덮고 다시 정규화한다.
    data.config = normalizeSourceConfig(current.kind, { ...(current.config as object), ...(body.config as object) }) as object;
  }
  const source = await prisma.briefSource.update({ where: { id: sourceId }, data });
  return NextResponse.json({ source });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { id, sourceId } = await params;
  const g = await guardBrief(id, { write: true });
  if (!g.ok) return g.response;
  if (!(await owned(id, sourceId))) return NextResponse.json({ error: "찾을 수 없어요" }, { status: 404 });
  // 이 소스로 들어온 링크는 남는다(sourceId 만 비워짐) — 이미 채택·발행된 것일 수 있다.
  await prisma.briefSource.delete({ where: { id: sourceId } });
  return NextResponse.json({ ok: true });
}
