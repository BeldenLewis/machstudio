import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getAdFolderAccess } from "@/lib/ad-folder-access";
import {
  decryptGoogleToken,
  googleAccessToken,
  googleAdsRequest,
  googleCustomerId,
} from "@/lib/google-ads";

type Context = { params: Promise<{ folderId: string }> };
type Account = { platform: string; accountId: string; accountName?: string };
type AssetRef = { asset?: string };
type GoogleAd = {
  id?: string;
  name?: string;
  type?: string;
  imageAd?: { imageUrl?: string; previewImageUrl?: string; name?: string };
  responsiveDisplayAd?: {
    marketingImages?: AssetRef[];
    squareMarketingImages?: AssetRef[];
    youtubeVideos?: AssetRef[];
  };
  videoAd?: { video?: AssetRef };
  videoResponsiveAd?: { videos?: AssetRef[] };
};
type GoogleRow = {
  customer?: { id?: string; descriptiveName?: string; currencyCode?: string };
  campaign?: { id?: string; name?: string };
  adGroup?: { id?: string; name?: string };
  adGroupAd?: { status?: string; ad?: GoogleAd };
  segments?: { date?: string };
  metrics?: {
    costMicros?: string;
    impressions?: string;
    clicks?: string;
    ctr?: number;
    averageCpc?: string;
    averageCpm?: string;
    conversions?: number;
    costPerConversion?: string;
  };
};
type GoogleAsset = {
  asset?: {
    resourceName?: string;
    name?: string;
    type?: string;
    imageAsset?: { fullSize?: { url?: string } };
    youtubeVideoAsset?: { youtubeVideoId?: string };
  };
};
type Creative = {
  name?: string;
  url?: string;
  type?: string;
  videoId?: string;
};

function dateOnly(date: Date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60_000);
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
}
const micros = (value: string | undefined) => Number(value || 0) / 1_000_000;

function assetRefs(ad?: GoogleAd) {
  return [
    ...(ad?.responsiveDisplayAd?.marketingImages ?? []),
    ...(ad?.responsiveDisplayAd?.squareMarketingImages ?? []),
    ...(ad?.responsiveDisplayAd?.youtubeVideos ?? []),
    ...(ad?.videoResponsiveAd?.videos ?? []),
    ...(ad?.videoAd?.video ? [ad.videoAd.video] : []),
  ]
    .map((item) => item.asset)
    .filter((name): name is string => Boolean(name));
}

async function fetchAccountRows(
  customerId: string,
  token: string,
  query: string,
) {
  const rows: GoogleRow[] = [];
  let pageToken: string | undefined;
  do {
    const result = await googleAdsRequest<{
      results?: GoogleRow[];
      nextPageToken?: string;
    }>(`customers/${customerId}/googleAds:search`, token, {
      method: "POST",
      body: JSON.stringify({ query, ...(pageToken ? { pageToken } : {}) }),
    });
    rows.push(...(result.results ?? []));
    pageToken = result.nextPageToken;
  } while (pageToken);
  return rows;
}

async function fetchAssets(customerId: string, token: string, names: string[]) {
  const assets = new Map<string, Creative>();
  for (let offset = 0; offset < names.length; offset += 100) {
    const list = names
      .slice(offset, offset + 100)
      .map((name) => `'${name.replaceAll("'", "\\'")}'`)
      .join(",");
    const query = `SELECT asset.resource_name, asset.name, asset.type, asset.image_asset.full_size.url, asset.youtube_video_asset.youtube_video_id FROM asset WHERE asset.resource_name IN (${list})`;
    const result = await googleAdsRequest<{ results?: GoogleAsset[] }>(
      `customers/${customerId}/googleAds:search`,
      token,
      { method: "POST", body: JSON.stringify({ query }) },
    );
    for (const row of result.results ?? []) {
      const asset = row.asset;
      if (!asset?.resourceName) continue;
      const videoId = asset.youtubeVideoAsset?.youtubeVideoId;
      assets.set(asset.resourceName, {
        name: asset.name,
        type: asset.type,
        videoId,
        url:
          asset.imageAsset?.fullSize?.url ||
          (videoId
            ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
            : undefined),
      });
    }
  }
  return assets;
}

export async function POST(_request: Request, context: Context) {
  const { folderId } = await context.params;
  const access = await getAdFolderAccess(folderId, true);
  if ("error" in access)
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
  const connection = await prisma.googleAdConnection.findUnique({
    where: { projectId: access.folder.projectId },
  });
  if (!connection)
    return NextResponse.json(
      { error: "Google Ads 계정이 연결되지 않았습니다." },
      { status: 400 },
    );
  const accounts = (
    (Array.isArray(access.folder.mediaAccounts)
      ? access.folder.mediaAccounts
      : []) as Account[]
  ).filter((account) => account.platform === "GOOGLE" && account.accountId);
  if (!accounts.length)
    return NextResponse.json(
      { error: "먼저 Google Ads 광고 계정을 폴더에 추가해주세요." },
      { status: 400 },
    );

  try {
    const token = await googleAccessToken(
      decryptGoogleToken(connection.encryptedRefreshToken),
    );
    const since = dateOnly(access.folder.reportStart);
    const until = dateOnly(access.folder.reportEnd);
    const rows: GoogleRow[] = [];
    const creatives = new Map<string, Creative>();
    const query = `SELECT customer.id, customer.descriptive_name, customer.currency_code, campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group_ad.status, ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, ad_group_ad.ad.image_ad.name, ad_group_ad.ad.image_ad.image_url, ad_group_ad.ad.image_ad.preview_image_url, ad_group_ad.ad.responsive_display_ad.marketing_images, ad_group_ad.ad.responsive_display_ad.square_marketing_images, ad_group_ad.ad.responsive_display_ad.youtube_videos, ad_group_ad.ad.video_ad.video, ad_group_ad.ad.video_responsive_ad.videos, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.average_cpm, metrics.conversions, metrics.cost_per_conversion FROM ad_group_ad WHERE segments.date BETWEEN '${since}' AND '${until}'`;

    for (const account of accounts) {
      const customerId = googleCustomerId(account.accountId);
      const accountRows = await fetchAccountRows(customerId, token, query);
      rows.push(...accountRows);
      const names = [
        ...new Set(accountRows.flatMap((row) => assetRefs(row.adGroupAd?.ad))),
      ];
      if (names.length)
        for (const [name, asset] of await fetchAssets(customerId, token, names))
          creatives.set(name, asset);
    }

    const batch = await prisma.$transaction(async (tx) => {
      await tx.adPerformanceImportBatch.deleteMany({
        where: { folderId, sourceType: "GOOGLE", fileName: "google-api-sync" },
      });
      const created = await tx.adPerformanceImportBatch.create({
        data: {
          workspaceId: access.folder.workspaceId,
          projectId: access.folder.projectId,
          folderId,
          uploadedById: access.user.id,
          sourceType: "GOOGLE",
          sourceName: "Google Ads",
          fileName: "google-api-sync",
          rowCount: rows.length,
          reportStart: access.folder.reportStart,
          reportEnd: access.folder.reportEnd,
        },
      });
      for (let offset = 0; offset < rows.length; offset += 1000) {
        await tx.adPerformanceRecord.createMany({
          data: rows.slice(offset, offset + 1000).map((row) => {
            const cost = micros(row.metrics?.costMicros);
            const conversions = Number(row.metrics?.conversions || 0);
            const clicks = Number(row.metrics?.clicks || 0);
            const day = row.segments?.date || since;
            const ad = row.adGroupAd?.ad;
            const refs = assetRefs(ad);
            const creative = refs
              .map((name) => creatives.get(name))
              .find((item) => item?.url);
            const isVideo = Boolean(
              ad?.type?.includes("VIDEO") ||
              refs.some((name) => creatives.get(name)?.videoId),
            );
            const adName =
              ad?.name ||
              ad?.imageAd?.name ||
              (ad?.id ? `Google 광고 ${ad.id}` : "이름 없는 광고");
            return {
              id: crypto.randomUUID(),
              batchId: created.id,
              workspaceId: access.folder.workspaceId,
              projectId: access.folder.projectId,
              folderId,
              sourceType: "GOOGLE",
              accountId: row.customer?.id ?? null,
              accountName: row.customer?.descriptiveName ?? null,
              campaignId: row.campaign?.id ?? null,
              campaignName: row.campaign?.name || "이름 없는 캠페인",
              adGroupId: row.adGroup?.id ?? null,
              adGroupName: row.adGroup?.name ?? null,
              adId: ad?.id ?? null,
              adName,
              creativeId: refs[0] ?? ad?.id ?? null,
              creativeName: creative?.name ?? adName,
              thumbnailUrl:
                ad?.imageAd?.previewImageUrl ||
                ad?.imageAd?.imageUrl ||
                creative?.url ||
                null,
              creativeType: isVideo
                ? "VIDEO"
                : ad?.imageAd || creative?.url
                  ? "IMAGE"
                  : (ad?.type ?? null),
              status: row.adGroupAd?.status ?? null,
              reportDate: new Date(`${day}T00:00:00+09:00`),
              reportStart: new Date(`${day}T00:00:00+09:00`),
              reportEnd: new Date(`${day}T23:59:59+09:00`),
              currency: row.customer?.currencyCode || access.folder.currency,
              cost,
              impressions: Number(row.metrics?.impressions || 0),
              clicks,
              ctr: Number(row.metrics?.ctr || 0) * 100,
              cpc: micros(row.metrics?.averageCpc),
              cpm: micros(row.metrics?.averageCpm),
              conversions,
              costPerConversion:
                row.metrics?.costPerConversion == null
                  ? conversions
                    ? cost / conversions
                    : null
                  : micros(row.metrics.costPerConversion),
              conversionRate: clicks ? (conversions / clicks) * 100 : null,
              resultType: "conversions",
              resultBucket: "result",
              raw: row as unknown as Prisma.InputJsonValue,
            };
          }),
        });
      }
      await tx.googleAdConnection.update({
        where: { id: connection.id },
        data: {
          lastSyncedAt: new Date(),
          status: "CONNECTED",
          lastSyncError: null,
        },
      });
      await tx.adPerformanceFolder.update({
        where: { id: folderId },
        data: { lastSyncedAt: new Date() },
      });
      return created;
    });
    return NextResponse.json({
      ok: true,
      batchId: batch.id,
      rowCount: rows.length,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Google Ads 동기화에 실패했습니다.";
    await prisma.googleAdConnection.update({
      where: { id: connection.id },
      data: { status: "ERROR", lastSyncError: message },
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
