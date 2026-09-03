import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdFolderAccess } from "@/lib/ad-folder-access";

type Context = { params: Promise<{ folderId: string }> };
type Level = "campaign" | "adGroup" | "ad";

export async function GET(request: Request, context: Context) {
  const { folderId } = await context.params;
  const access = await getAdFolderAccess(folderId);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { searchParams } = new URL(request.url);
  const level: Level = searchParams.get("level") === "ad" ? "ad" : searchParams.get("level") === "adGroup" ? "adGroup" : "campaign";
  const sourceType = searchParams.get("sourceType");
  const campaignId = searchParams.get("campaignId");
  const adGroupId = searchParams.get("adGroupId");
  const records = await prisma.adPerformanceRecord.findMany({
    where: {
      folderId,
      ...(sourceType && sourceType !== "ALL" ? { sourceType } : {}),
      ...(campaignId ? { campaignId } : {}),
      ...(adGroupId ? { adGroupId } : {}),
    },
    select: {
      sourceType: true, campaignId: true, campaignName: true, adGroupId: true, adGroupName: true,
      adId: true, adName: true, creativeId: true, creativeName: true, thumbnailUrl: true, creativeType: true, status: true,
      cost: true, impressions: true, reach: true, clicks: true, conversions: true,
    },
    take: 50_000,
  });

  const grouped = new Map<string, {
    id: string; sourceType: string; name: string; campaignId: string | null; campaignName: string;
    adGroupId: string | null; adGroupName: string | null; adId: string | null; creativeId: string | null; creativeName: string | null;
    thumbnailUrl: string | null; creativeType: string | null; status: string | null; cost: number; impressions: number; reach: number; clicks: number; conversions: number;
  }>();
  for (const row of records) {
    const id = level === "campaign" ? row.campaignId || row.campaignName : level === "adGroup" ? row.adGroupId || row.adGroupName || "-" : row.adId || row.adName || row.creativeId || "-";
    const key = `${row.sourceType}:${id}`;
    const current = grouped.get(key) ?? {
      id, sourceType: row.sourceType,
      name: level === "campaign" ? row.campaignName : level === "adGroup" ? row.adGroupName || "이름 없는 광고 세트" : row.adName || row.creativeName || "이름 없는 광고",
      campaignId: row.campaignId, campaignName: row.campaignName, adGroupId: row.adGroupId, adGroupName: row.adGroupName, adId: row.adId,
      creativeId: row.creativeId, creativeName: row.creativeName, thumbnailUrl: row.thumbnailUrl, creativeType: row.creativeType, status: row.status,
      cost: 0, impressions: 0, reach: 0, clicks: 0, conversions: 0,
    };
    current.cost += row.cost ?? 0; current.impressions += row.impressions ?? 0; current.reach += row.reach ?? 0;
    current.clicks += row.clicks ?? 0; current.conversions += row.conversions ?? 0;
    grouped.set(key, current);
  }
  const rows = [...grouped.values()].map(row => ({
    ...row,
    ctr: row.impressions ? row.clicks / row.impressions * 100 : 0,
    cpc: row.clicks ? row.cost / row.clicks : 0,
    cpm: row.impressions ? row.cost / row.impressions * 1000 : 0,
    costPerConversion: row.conversions ? row.cost / row.conversions : 0,
  })).sort((a,b) => b.cost - a.cost);
  return NextResponse.json({ level, rows, truncated: records.length === 50_000 });
}
