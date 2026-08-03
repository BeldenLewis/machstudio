import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const link = await prisma.uTMLink.findFirst({ where: { id, createdById: user.id } });
  if (!link) return NextResponse.json({ error: "찾을 수 없어요" }, { status: 404 });

  const { shortUrl, name, url, utmSource, utmMedium, utmCampaign, utmTerm, utmContent, fullUrl } = body;

  const updated = await prisma.uTMLink.update({
    where: { id },
    data: {
      ...(shortUrl !== undefined && { shortUrl }),
      ...(name !== undefined && { name: name || null }),
      ...(url !== undefined && { url }),
      ...(utmSource !== undefined && { utmSource }),
      ...(utmMedium !== undefined && { utmMedium }),
      ...(utmCampaign !== undefined && { utmCampaign }),
      ...(utmTerm !== undefined && { utmTerm: utmTerm || null }),
      ...(utmContent !== undefined && { utmContent: utmContent || null }),
      ...(fullUrl !== undefined && { fullUrl }),
    },
  });

  /**
   * 단축링크 목적지도 함께 갱신한다.
   *
   * UTMLink 와 ShortLink 는 별개 테이블이고 /r/[code] 는 ShortLink.longUrl 만 보고 리다이렉트한다.
   * 예전엔 여기서 UTMLink 만 고쳐서, UTM 을 수정해도 **이미 배포한 단축링크는 옛 UTM 으로 계속
   * 보냈다** — 인쇄물·QR 에 넣은 링크라면 되돌릴 수 없는 오귀속이다.
   * 두 테이블을 잇는 유일한 단서가 shortUrl 의 마지막 경로 세그먼트(=code)라 그걸로 찾는다.
   */
  const shortCode = (updated.shortUrl ?? "").trim().split("/").filter(Boolean).pop();
  if (fullUrl !== undefined && fullUrl !== link.fullUrl && shortCode) {
    await prisma.shortLink
      .updateMany({ where: { code: shortCode, workspaceId: link.workspaceId }, data: { longUrl: fullUrl } })
      .catch(() => { /* 단축링크가 없거나 다른 워크스페이스면 조용히 넘어간다(UTM 수정 자체는 성공) */ });
  }

  // 변경된 필드만 메타에 기록
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  if (name !== undefined && (name || null) !== link.name) changes.name = { before: link.name, after: name || null };
  if (url !== undefined && url !== link.url) changes.url = { before: link.url, after: url };
  if (utmSource !== undefined && utmSource !== link.utmSource) changes.utmSource = { before: link.utmSource, after: utmSource };
  if (utmMedium !== undefined && utmMedium !== link.utmMedium) changes.utmMedium = { before: link.utmMedium, after: utmMedium };
  if (utmCampaign !== undefined && utmCampaign !== link.utmCampaign) changes.utmCampaign = { before: link.utmCampaign, after: utmCampaign };

  await logActivity({
    workspaceId: link.workspaceId,
    userId: user.id,
    action: "utm.updated",
    meta: {
      utmId: id,
      name: updated.name,
      changes: Object.keys(changes).length > 0 ? changes : undefined,
    },
  });

  return NextResponse.json({ utmLink: updated });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const { id } = await params;

  const membership = await prisma.workspaceMember.findFirst({ where: { userId: user.id } });
  if (membership?.role === "MEMBER") {
    return NextResponse.json({ error: "뷰어는 UTM을 삭제할 수 없어요." }, { status: 403 });
  }

  // 로그를 위해 먼저 조회
  const link = await prisma.uTMLink.findFirst({ where: { id, createdById: user.id } });
  if (!link) return NextResponse.json({ error: "찾을 수 없어요" }, { status: 404 });

  await prisma.uTMLink.deleteMany({ where: { id, createdById: user.id } });

  await logActivity({
    workspaceId: link.workspaceId,
    userId: user.id,
    action: "utm.deleted",
    meta: {
      utmId: id,
      name: link.name,
      utmSource: link.utmSource,
      utmMedium: link.utmMedium,
      utmCampaign: link.utmCampaign,
    },
  });

  return NextResponse.json({ ok: true });
}
