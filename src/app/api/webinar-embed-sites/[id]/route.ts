import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

async function loadSiteWithAuth(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "인증 필요" }, { status: 401 }) };

  const site = await prisma.webinarEmbedSite.findUnique({ where: { id } });
  if (!site || site.deletedAt) return { error: NextResponse.json({ error: "사이트를 찾을 수 없어요" }, { status: 404 }) };

  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: user.id, workspaceId: site.workspaceId } },
  });
  if (!membership) return { error: NextResponse.json({ error: "접근 권한 없음" }, { status: 403 }) };

  return { site };
}

function cleanStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 20);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await loadSiteWithAuth(id);
  if ("error" in auth) return auth.error;
  const { site } = auth;

  const body = await request.json();
  const data: Record<string, unknown> = {};

  // 이 URL 들은 파트너 사이트의 a[href]·window.open 으로 들어간다 →
  // javascript: 같은 스킴이 저장되면 남의 도메인 컨텍스트에서 실행된다. http(s) 만 허용.
  const safeUrl = (v: string) => {
    const s = v.trim();
    if (!s) return null;
    try {
      const u = new URL(s);
      return u.protocol === "http:" || u.protocol === "https:" ? s : null;
    } catch {
      return null; // 상대경로·형식 오류는 저장하지 않는다
    }
  };

  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.siteUrl === "string") data.siteUrl = safeUrl(body.siteUrl);
  if (typeof body.livePageUrl === "string") data.livePageUrl = safeUrl(body.livePageUrl);
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;

  // allowedOrigins — config 라우트에서 실제로 강제한다(설정 시 미일치 오리진은 403).
  const allowedOrigins = cleanStringArray(body.allowedOrigins);
  if (allowedOrigins !== undefined) data.allowedOrigins = allowedOrigins;
  const bannerPagePatterns = cleanStringArray(body.bannerPagePatterns);
  if (bannerPagePatterns !== undefined) data.bannerPagePatterns = bannerPagePatterns;

  if ("activeWebinarId" in body) {
    if (body.activeWebinarId === null || body.activeWebinarId === "") {
      data.activeWebinarId = null;
    } else if (typeof body.activeWebinarId === "string") {
      const webinar = await prisma.webinar.findFirst({
        where: { id: body.activeWebinarId, workspaceId: site.workspaceId },
        select: { id: true },
      });
      if (!webinar) return NextResponse.json({ error: "노출할 웨비나를 찾을 수 없어요" }, { status: 400 });
      data.activeWebinarId = webinar.id;
    }
  }

  if (!Object.keys(data).length) return NextResponse.json({ error: "변경할 내용이 없어요" }, { status: 400 });

  const updated = await prisma.webinarEmbedSite.update({
    where: { id: site.id },
    data,
    include: { activeWebinar: { select: { id: true, name: true, slug: true } } },
  });

  return NextResponse.json({ site: updated });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await loadSiteWithAuth(id);
  if ("error" in auth) return auth.error;

  await prisma.webinarEmbedSite.update({
    where: { id: auth.site.id },
    data: { deletedAt: new Date(), isActive: false },
  });

  return NextResponse.json({ ok: true });
}
