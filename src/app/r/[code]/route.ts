import { after, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clickChannel, clientIp, isBotUserAgent, visitorKey } from "@/lib/brief/click";

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const shortLink = await prisma.shortLink.findUnique({
    where: { code },
    select: { id: true, longUrl: true },
  });

  if (!shortLink) {
    return new NextResponse("Short link not found", { status: 404 });
  }

  // 클릭 기록은 응답을 보낸 뒤에 한다 — 사람을 기록 때문에 기다리게 하지 않는다.
  // 실패해도 이동은 이미 끝났으니 조용히 넘긴다(집계 하나 빠지는 것 < 링크가 느려지는 것).
  const ua = request.headers.get("user-agent") ?? "";
  if (!isBotUserAgent(ua)) {
    const channel = clickChannel(new URL(request.url).searchParams);
    const key = visitorKey(clientIp(request.headers), ua);
    after(async () => {
      try {
        await prisma.shortLinkClick.create({ data: { shortLinkId: shortLink.id, channel, visitorKey: key } });
      } catch (error) {
        console.warn("[r] click record failed", error);
      }
    });
  }

  return NextResponse.redirect(shortLink.longUrl, 302);
}
