/**
 * 링크 미리보기 — 추가 폼에서 주소를 붙여넣는 순간 제목·기관을 채워 보여 준다(저장 전).
 * 운영자가 저장 전에 고칠 수 있어야 해서 추가와 분리했다.
 */
import { NextResponse } from "next/server";
import { guardBrief } from "@/lib/brief/server";
import { isHttpUrl } from "@/lib/brief/model";
import { fetchLinkPreview } from "@/lib/brief/link-preview";
import { rateLimitAsync } from "@/lib/ratelimit";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guardBrief(id, { write: true });
  if (!g.ok) return g.response;

  // 우리 서버가 남의 사이트를 대신 여는 창구라 속도를 묶는다.
  const limit = await rateLimitAsync(`brief-preview:${g.userId}`, { limit: 30, windowMs: 60_000 });
  if (!limit.allowed) return NextResponse.json({ error: "잠시 후 다시 시도해주세요" }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!isHttpUrl(url)) return NextResponse.json({ error: "http(s) 주소를 넣어주세요" }, { status: 400 });

  const preview = await fetchLinkPreview(url);
  return NextResponse.json({ preview });
}
