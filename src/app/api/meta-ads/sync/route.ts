import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma";
import { decryptMetaToken, metaGraph, metricValue } from "@/lib/meta-ads";

const INSIGHT_FIELDS = [
  "date_start", "date_stop", "account_currency", "campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name",
  "spend", "impressions", "reach", "frequency", "clicks", "unique_clicks", "inline_link_clicks", "outbound_clicks",
  "cpm", "cpc", "ctr", "cpp", "actions", "action_values", "cost_per_action_type", "purchase_roas", "website_purchase_roas",
  "video_play_actions", "video_p25_watched_actions", "video_p50_watched_actions", "video_p75_watched_actions", "video_p100_watched_actions",
].join(",");

type Insight = Record<string, unknown> & { date_start: string; date_stop: string; campaign_id: string; campaign_name: string; adset_id?: string; adset_name?: string; ad_id?: string; ad_name?: string };

function preferredAction(row: Insight) {
  for (const key of ["offsite_conversion.fb_pixel_lead", "lead", "onsite_conversion.lead_grouped", "purchase", "offsite_conversion.fb_pixel_purchase", "complete_registration"]) {
    const value = metricValue(row.actions, key);
    if (value > 0) return { key, value };
  }
  return { key: "", value: 0 };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { workspaceId?: string; projectId?: string; since?: string; until?: string };
  if (!body.workspaceId || !body.projectId) return NextResponse.json({ error: "프로젝트 정보가 필요합니다." }, { status: 400 });
  const [membership, project, connection] = await Promise.all([
    prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId: user.id, workspaceId: body.workspaceId } } }),
    prisma.project.findUnique({ where: { id: body.projectId }, select: { workspaceId: true } }),
    prisma.metaAdConnection.findUnique({ where: { projectId: body.projectId } }),
  ]);
  if (!membership || project?.workspaceId !== body.workspaceId) return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 403 });
  if (!connection?.adAccountId) return NextResponse.json({ error: "Meta 광고 계정을 먼저 선택해주세요." }, { status: 400 });

  const until = /^\d{4}-\d{2}-\d{2}$/.test(body.until || "") ? body.until! : new Date().toISOString().slice(0, 10);
  const fallbackSince = new Date(`${until}T00:00:00Z`); fallbackSince.setUTCDate(fallbackSince.getUTCDate() - 89);
  const since = /^\d{4}-\d{2}-\d{2}$/.test(body.since || "") ? body.since! : fallbackSince.toISOString().slice(0, 10);
  try {
    const token = decryptMetaToken(connection.encryptedAccessToken);
    const rows: Insight[] = [];
    let next: string | null = null;
    do {
      const page: { data: Insight[]; paging?: { next?: string } } = next
        ? await (async () => { const res = await fetch(next!, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }); const json = await res.json(); if (!res.ok) throw new Error(json?.error?.message || "Meta Insights 조회 실패"); return json; })()
        : await metaGraph(`${connection.adAccountId}/insights`, token, { fields: INSIGHT_FIELDS, level: "ad", time_increment: "1", time_range: JSON.stringify({ since, until }), limit: "500" });
      rows.push(...page.data);
      next = page.paging?.next || null;
    } while (next && rows.length < 50_000);

    await prisma.$transaction(async (tx) => {
      await tx.adPerformanceRecord.deleteMany({ where: { projectId: body.projectId, sourceType: "META", reportDate: { gte: new Date(`${since}T00:00:00Z`), lte: new Date(`${until}T23:59:59Z`) } } });
      const batch = await tx.adPerformanceImportBatch.create({ data: { workspaceId: body.workspaceId!, projectId: body.projectId!, uploadedById: user.id, sourceType: "META", sourceName: connection.adAccountName || connection.adAccountId!, fileName: `meta-api-${since}-${until}`, rowCount: rows.length, reportStart: new Date(`${since}T00:00:00Z`), reportEnd: new Date(`${until}T00:00:00Z`) } });
      for (let i = 0; i < rows.length; i += 500) {
        await tx.adPerformanceRecord.createMany({ data: rows.slice(i, i + 500).map((row) => {
          const action = preferredAction(row);
          const spend = metricValue(row.spend); const impressions = metricValue(row.impressions); const clicks = metricValue(row.outbound_clicks) || metricValue(row.inline_link_clicks) || metricValue(row.clicks);
          const purchaseValue = metricValue(row.action_values, "offsite_conversion.fb_pixel_purchase") || metricValue(row.action_values, "purchase");
          const key = `${connection.adAccountId}:${row.date_start}:${row.campaign_id}:${row.adset_id || ""}:${row.ad_id || ""}`;
          return { id: randomUUID(), batchId: batch.id, workspaceId: body.workspaceId!, projectId: body.projectId!, sourceType: "META", campaignName: row.campaign_name, adGroupName: row.adset_name || row.ad_name || null, reportDate: new Date(`${row.date_start}T00:00:00Z`), reportStart: new Date(`${row.date_start}T00:00:00Z`), reportEnd: new Date(`${row.date_stop}T00:00:00Z`), currency: String(row.account_currency || connection.currency || ""), cost: spend, impressions: Math.round(impressions), reach: Math.round(metricValue(row.reach)), clicks: Math.round(clicks), cpm: metricValue(row.cpm), cpc: clicks ? spend / clicks : 0, ctr: impressions ? clicks / impressions * 100 : 0, conversions: action.value, costPerConversion: action.value ? spend / action.value : null, conversionRate: clicks ? action.value / clicks * 100 : null, purchaseValue, roas: spend ? purchaseValue / spend : null, resultType: action.key || null, resultBucket: action.value ? "conversion" : null, externalCampaignId: row.campaign_id, externalAdGroupId: row.adset_id || null, externalAdId: row.ad_id || null, providerRecordKey: createHash("sha256").update(key).digest("hex"), raw: row as Prisma.InputJsonValue };
        }) });
      }
    }, { timeout: 30_000 });
    await prisma.metaAdConnection.update({ where: { id: connection.id }, data: { status: "CONNECTED", lastSyncedAt: new Date(), lastSyncError: null } });
    return NextResponse.json({ rowCount: rows.length, since, until });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Meta 동기화 실패";
    await prisma.metaAdConnection.update({ where: { id: connection.id }, data: { status: "ERROR", lastSyncError: message.slice(0, 500) } });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
