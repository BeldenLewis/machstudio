import { EXPO_V2_RULES, type AudienceId } from "@/lib/expo/types";

export interface SelectVisibleCtasOptions {
  audience: AudienceId;
  activeCampaignIds: ReadonlySet<string>;
  validDestinationIds: ReadonlySet<string>;
  limit: number;
}

type SelectableCta = {
  readonly destinationId: string;
  readonly audience: AudienceId;
  readonly campaignIds: readonly string[];
  readonly priority: number;
  readonly fallback: boolean;
  readonly enabled: boolean;
};

export function selectVisibleCtas<T extends SelectableCta>(
  placements: readonly T[],
  options: SelectVisibleCtasOptions,
): T[] {
  const hasActiveCampaign = options.activeCampaignIds.size > 0;
  const limit = Math.max(0, Math.min(EXPO_V2_RULES.maxVisibleCtas, Math.floor(options.limit)));
  return placements
    .map((placement, index) => ({ placement, index }))
    .filter(({ placement }) => placement.enabled && options.validDestinationIds.has(placement.destinationId))
    .filter(({ placement }) => options.audience === "all" || placement.audience === "all" || placement.audience === options.audience)
    .filter(({ placement }) => hasActiveCampaign
      ? !placement.fallback && placement.campaignIds.some((id) => options.activeCampaignIds.has(id))
      : placement.fallback)
    .sort((a, b) => a.placement.priority - b.placement.priority || a.index - b.index)
    .slice(0, limit)
    .map(({ placement }) => placement);
}
