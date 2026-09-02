import type { CampaignConfig, ResolvedCampaignState } from "@/lib/expo/types";

export function isCampaignActive(campaign: CampaignConfig, now: Date): boolean {
  if (!campaign.enabled) return false;
  if (campaign.override === "force-on") return true;
  if (campaign.override === "force-off") return false;
  const timestamp = now.getTime();
  return timestamp >= Date.parse(campaign.startsAt) && timestamp < Date.parse(campaign.endsAt);
}

export function resolveCampaignStates(
  campaigns: readonly CampaignConfig[],
  now: Date,
  forced: Readonly<Record<string, boolean>> = {},
): ResolvedCampaignState[] {
  return campaigns.map((campaign) => ({
    id: campaign.id,
    label: campaign.label,
    active: campaign.enabled
      && (Object.hasOwn(forced, campaign.id) ? forced[campaign.id] === true : isCampaignActive(campaign, now)),
  }));
}
