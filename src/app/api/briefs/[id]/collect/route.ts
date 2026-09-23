/**
 * "지금 수집" — 매일 아침 크론을 기다리지 않고 바로 돌린다. sourceId 를 주면 그 소스 하나만.
 * 바깥 사이트를 여러 번 여는 일이라 사람당 분당 횟수를 묶는다.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardBrief } from "@/lib/brief/server";
import { collectBrief, runSource } from "@/lib/brief/collect";
import { rateLimitAsync } from "@/lib/ratelimit";

export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guardBrief(id, { write: true });
  if (!g.ok) return g.response;
  const limit = await rateLimitAsync(`brief-collect:${g.userId}`, { limit: 6, windowMs: 60_000 });
  if (!limit.allowed) return NextResponse.json({ error: "잠시 후 다시 눌러 주세요" }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { sourceId?: unknown };
  if (typeof body.sourceId === "string") {
    const src = await prisma.briefSource.findFirst({ where: { id: body.sourceId, briefId: id }, select: { id: true } });
    if (!src) return NextResponse.json({ error: "찾을 수 없어요" }, { status: 404 });
    const r = await runSource(src.id);
    return NextResponse.json({ added: r.added, results: [r] });
  }
  const r = await collectBrief(id);
  return NextResponse.json({ added: r.added, results: r.results });
}
