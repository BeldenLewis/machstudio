import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdFolderAccess } from "@/lib/ad-folder-access";

type Context = { params: Promise<{ folderId: string }> };

export async function GET(_request: Request, context: Context) {
  const { folderId } = await context.params;
  const access = await getAdFolderAccess(folderId);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  return NextResponse.json({ folder: access.folder, project: access.project });
}

export async function PATCH(request: Request, context: Context) {
  const { folderId } = await context.params;
  const access = await getAdFolderAccess(folderId, true);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const body = await request.json().catch(() => null);
  const data: { name?: string; description?: string | null; mediaAccounts?: object[] } = {};
  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 100);
  if (typeof body?.description === "string") data.description = body.description.trim().slice(0, 500) || null;
  if (Array.isArray(body?.mediaAccounts)) data.mediaAccounts = body.mediaAccounts.slice(0, 20);
  const folder = await prisma.adPerformanceFolder.update({ where: { id: folderId }, data });
  return NextResponse.json({ folder });
}

export async function DELETE(_request: Request, context: Context) {
  const { folderId } = await context.params;
  const access = await getAdFolderAccess(folderId, true);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  await prisma.adPerformanceFolder.delete({ where: { id: folderId } });
  return NextResponse.json({ ok: true });
}
