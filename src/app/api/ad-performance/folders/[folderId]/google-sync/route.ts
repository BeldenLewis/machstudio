import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getAdFolderAccess } from "@/lib/ad-folder-access";
import { decryptGoogleToken, googleAccessToken, googleAdsRequest, googleCustomerId } from "@/lib/google-ads";

type Context = { params: Promise<{ folderId: string }> };
type Account = { platform: string; accountId: string; accountName?: string };
type GoogleRow = { customer?: { id?: string; descriptiveName?: string; currencyCode?: string }; campaign?: { id?: string; name?: string }; adGroup?: { id?: string; name?: string }; segments?: { date?: string }; metrics?: { costMicros?: string; impressions?: string; clicks?: string; ctr?: number; averageCpc?: string; averageCpm?: string; conversions?: number; costPerConversion?: number } };
function dateOnly(date: Date) { const kst = new Date(date.getTime() + 9 * 60 * 60_000); return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`; }
const micros = (value: string | undefined) => Number(value || 0) / 1_000_000;

export async function POST(_request: Request, context: Context) {
  const { folderId } = await context.params;
  const access = await getAdFolderAccess(folderId, true);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const connection = await prisma.googleAdConnection.findUnique({ where: { projectId: access.folder.projectId } });
  if (!connection) return NextResponse.json({ error: "Google Ads 계정이 연결되지 않았습니다." }, { status: 400 });
  const accounts = ((Array.isArray(access.folder.mediaAccounts) ? access.folder.mediaAccounts : []) as Account[]).filter((account) => account.platform === "GOOGLE" && account.accountId);
  if (!accounts.length) return NextResponse.json({ error: "먼저 Google Ads 광고 계정을 폴더에 추가해주세요." }, { status: 400 });
  try {
    const token = await googleAccessToken(decryptGoogleToken(connection.encryptedRefreshToken));
    const since = dateOnly(access.folder.reportStart); const until = dateOnly(access.folder.reportEnd);
    const rows: GoogleRow[] = [];
    const query = `SELECT customer.id, customer.descriptive_name, customer.currency_code, campaign.id, campaign.name, ad_group.id, ad_group.name, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.average_cpm, metrics.conversions, metrics.cost_per_conversion FROM ad_group WHERE segments.date BETWEEN '${since}' AND '${until}'`;
    for (const account of accounts) {
      let pageToken: string | undefined;
      do {
        const result = await googleAdsRequest<{ results?: GoogleRow[]; nextPageToken?: string }>(`customers/${googleCustomerId(account.accountId)}/googleAds:search`, token, { method: "POST", body: JSON.stringify({ query, pageSize: 10000, ...(pageToken ? { pageToken } : {}) }) });
        rows.push(...(result.results ?? [])); pageToken = result.nextPageToken;
      } while (pageToken);
    }
    const batch = await prisma.$transaction(async (tx) => {
      await tx.adPerformanceImportBatch.deleteMany({ where: { folderId, sourceType: "GOOGLE", fileName: "google-api-sync" } });
      const created = await tx.adPerformanceImportBatch.create({ data: { workspaceId: access.folder.workspaceId, projectId: access.folder.projectId, folderId, uploadedById: access.user.id, sourceType: "GOOGLE", sourceName: "Google Ads", fileName: "google-api-sync", rowCount: rows.length, reportStart: access.folder.reportStart, reportEnd: access.folder.reportEnd } });
      for (let offset = 0; offset < rows.length; offset += 1000) await tx.adPerformanceRecord.createMany({ data: rows.slice(offset, offset + 1000).map((row) => { const cost = micros(row.metrics?.costMicros); const conversions = Number(row.metrics?.conversions || 0); const day = row.segments?.date || since; return { id: crypto.randomUUID(), batchId: created.id, workspaceId: access.folder.workspaceId, projectId: access.folder.projectId, folderId, sourceType: "GOOGLE", accountId: row.customer?.id ?? null, accountName: row.customer?.descriptiveName ?? null, campaignId: row.campaign?.id ?? null, campaignName: row.campaign?.name || "이름 없는 캠페인", adGroupId: row.adGroup?.id ?? null, adGroupName: row.adGroup?.name ?? null, reportDate: new Date(`${day}T00:00:00+09:00`), reportStart: new Date(`${day}T00:00:00+09:00`), reportEnd: new Date(`${day}T23:59:59+09:00`), currency: row.customer?.currencyCode || access.folder.currency, cost, impressions: Number(row.metrics?.impressions || 0), clicks: Number(row.metrics?.clicks || 0), ctr: Number(row.metrics?.ctr || 0) * 100, cpc: micros(row.metrics?.averageCpc), cpm: micros(row.metrics?.averageCpm), conversions, costPerConversion: row.metrics?.costPerConversion == null ? (conversions ? cost / conversions : null) : micros(String(row.metrics.costPerConversion)), conversionRate: Number(row.metrics?.clicks || 0) ? conversions / Number(row.metrics?.clicks || 0) * 100 : null, resultType: "conversions", resultBucket: "result", raw: row as unknown as Prisma.InputJsonValue }; }) });
      await tx.googleAdConnection.update({ where: { id: connection.id }, data: { lastSyncedAt: new Date(), status: "CONNECTED", lastSyncError: null } });
      await tx.adPerformanceFolder.update({ where: { id: folderId }, data: { lastSyncedAt: new Date() } });
      return created;
    });
    return NextResponse.json({ ok: true, batchId: batch.id, rowCount: rows.length });
  } catch (error) { const message = error instanceof Error ? error.message : "Google Ads 동기화에 실패했습니다."; await prisma.googleAdConnection.update({ where: { id: connection.id }, data: { status: "ERROR", lastSyncError: message } }); return NextResponse.json({ error: message }, { status: 502 }); }
}
