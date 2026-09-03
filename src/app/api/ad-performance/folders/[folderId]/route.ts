import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdFolderAccess } from "@/lib/ad-folder-access";
import { normalizeAdDetailColumns, normalizeMetaResultMetric } from "@/lib/meta-result-metrics";

type Context = { params: Promise<{ folderId: string }> };

function dateOnly(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00+09:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

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
  const data: { name?: string; description?: string | null; mediaAccounts?: object[]; reportStart?: Date; reportEnd?: Date; resultMetric?: string; detailColumns?: string[] } = {};
  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 100);
  if (typeof body?.description === "string") data.description = body.description.trim().slice(0, 500) || null;
  if (Array.isArray(body?.mediaAccounts)) data.mediaAccounts = body.mediaAccounts.slice(0, 20);
  if (body?.resultMetric !== undefined) data.resultMetric = normalizeMetaResultMetric(body.resultMetric);
  if (body?.detailColumns !== undefined) data.detailColumns = normalizeAdDetailColumns(body.detailColumns);
  if (body?.reportStart !== undefined || body?.reportEnd !== undefined) {
    const reportStart = dateOnly(body?.reportStart) ?? access.folder.reportStart;
    const reportEnd = dateOnly(body?.reportEnd) ?? access.folder.reportEnd;
    if (reportStart > reportEnd) return NextResponse.json({ error: "종료일은 시작일보다 빠를 수 없습니다." }, { status: 400 });
    data.reportStart = reportStart;
    data.reportEnd = reportEnd;
  }
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
