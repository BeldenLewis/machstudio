import { prisma } from "@/lib/prisma";
import { tokenHash } from "@/lib/oauth";

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const hash = tokenHash(token);
  await prisma.$transaction([
    prisma.apiToken.deleteMany({ where: { tokenHash: hash } }),
    prisma.oAuthRefreshToken.updateMany({ where: { tokenHash: hash }, data: { revokedAt: new Date() } }),
  ]);
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}
