import { describe, expect, it } from "vitest";
import { selectVisibleCtas } from "@/lib/expo/cta";

const placements = [
  { id: "later", label: { ko: "나중" }, destinationId: "later", variant: "primary", audience: "all", campaignIds: ["campaign"], priority: 1, fallback: false, enabled: true },
  { id: "first", label: { ko: "먼저" }, destinationId: "first", variant: "primary", audience: "exhibitor", campaignIds: ["campaign"], priority: 1, fallback: false, enabled: true },
  { id: "visitor", label: { ko: "방문객" }, destinationId: "visitor", variant: "primary", audience: "visitor", campaignIds: ["campaign"], priority: 0, fallback: false, enabled: true },
  { id: "fallback", label: { ko: "소개" }, destinationId: "fallback", variant: "secondary", audience: "all", campaignIds: [], priority: 9, fallback: true, enabled: true },
  { id: "disabled", label: { ko: "꺼짐" }, destinationId: "disabled", variant: "outline", audience: "all", campaignIds: ["campaign"], priority: -1, fallback: false, enabled: false },
] as const;

describe("CTA selection", () => {
  it("applies audience, destination, campaign, stable priority/order, and a hard max of two", () => {
    const result = selectVisibleCtas(placements, {
      audience: "all",
      activeCampaignIds: new Set(["campaign"]),
      validDestinationIds: new Set(["later", "first", "visitor", "fallback", "disabled"]),
      limit: 99,
    });
    expect(result.map((row) => row.id)).toEqual(["visitor", "later"]);
  });

  it("uses fallback only when no campaign is active and never returns an actionless row", () => {
    const result = selectVisibleCtas(placements, {
      audience: "exhibitor",
      activeCampaignIds: new Set(),
      validDestinationIds: new Set(["fallback"]),
      limit: 2,
    });
    expect(result.map((row) => row.id)).toEqual(["fallback"]);
  });

  it("matches all-or-location audience outside an all-audience placement", () => {
    const result = selectVisibleCtas(placements, {
      audience: "exhibitor",
      activeCampaignIds: new Set(["campaign"]),
      validDestinationIds: new Set(["later", "first", "visitor"]),
      limit: 2,
    });
    expect(result.map((row) => row.id)).toEqual(["later", "first"]);
  });
});
