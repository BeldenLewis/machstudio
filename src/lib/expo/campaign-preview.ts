import type { CampaignPreviewMode } from "@/lib/expo/types";

const MODES = new Set<CampaignPreviewMode>(["current", "exhibitor", "visitor", "both", "ended"]);

export function campaignPreviewMode(value: string | null): CampaignPreviewMode {
  return value && MODES.has(value as CampaignPreviewMode) ? value as CampaignPreviewMode : "current";
}

export function forcedCampaignsForPreview(mode: CampaignPreviewMode): Readonly<Record<string, boolean>> | undefined {
  if (mode === "current") return undefined;
  if (mode === "exhibitor") return { "exhibitor-recruitment": true, "visitor-registration": false };
  if (mode === "visitor") return { "exhibitor-recruitment": false, "visitor-registration": true };
  if (mode === "both") return { "exhibitor-recruitment": true, "visitor-registration": true };
  return { "exhibitor-recruitment": false, "visitor-registration": false };
}
