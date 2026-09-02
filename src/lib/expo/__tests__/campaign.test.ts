import { describe, expect, it } from "vitest";
import { isCampaignActive, resolveCampaignStates } from "@/lib/expo/campaign";

const campaign = {
  id: "exhibitor-recruitment",
  label: "참가기업 모집",
  startsAt: "2027-01-01T00:00:00+09:00",
  endsAt: "2027-06-01T00:00:00+09:00",
  override: "auto" as const,
  enabled: true,
};

describe("Expo V2 campaign contract", () => {
  it("uses a half-open schedule interval", () => {
    expect(isCampaignActive(campaign, new Date("2026-12-31T15:00:00.000Z"))).toBe(true);
    expect(isCampaignActive(campaign, new Date("2027-05-31T15:00:00.000Z"))).toBe(false);
  });

  it("lets preview forcing override auto without mutating config", () => {
    const states = resolveCampaignStates([campaign], new Date("2028-01-01T00:00:00.000Z"), { "exhibitor-recruitment": true });
    expect(states).toEqual([{ id: "exhibitor-recruitment", label: "참가기업 모집", active: true }]);
    expect(campaign.override).toBe("auto");
  });

  it("never force-enables a disabled campaign", () => {
    const disabled = { ...campaign, enabled: false };
    expect(resolveCampaignStates([disabled], new Date("2027-02-01T00:00:00.000Z"), { "exhibitor-recruitment": true })[0]?.active).toBe(false);
  });
});
