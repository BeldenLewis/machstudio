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

  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.siteUrl === "string") data.siteUrl = body.siteUrl.trim() || null;
  if (typeof body.livePageUrl === "string") data.livePageUrl = body.livePageUrl.trim() || null;
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;

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
