/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CampaignPicker } from "@/components/expo/fields/CampaignPicker";
import { DestinationPicker } from "@/components/expo/fields/DestinationPicker";
import { sectionEditorFor } from "@/components/expo/section-editors/registry";
import { instantiateStkHomeV1 } from "@/lib/expo/presets/stk-home-v1";
import type { SectionEditorProps } from "@/lib/expo/types";

const config = instantiateStkHomeV1({ randomUUID: (() => { let n = 0; return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`; })() });
config.settings = {
  campaigns: [
    { id: "exhibitor-recruitment", label: "참가기업", startsAt: "2026-09-01T00:00:00+09:00", endsAt: "2027-06-23T00:00:00+09:00", override: "auto", enabled: true },
    { id: "visitor-registration", label: "참관객", startsAt: "2027-01-01T00:00:00+09:00", endsAt: "2027-06-23T00:00:00+09:00", override: "auto", enabled: true },
  ],
  destinations: [
    { id: "ready", label: "사용 가능", action: { type: "anchor", target: "overview" }, enabled: true },
    { id: "disabled", label: "비활성", action: { type: "anchor", target: "overview" }, enabled: false },
    { id: "invalid", label: "주소 오류", action: { type: "url", href: "http://localhost/private" }, enabled: true },
  ],
};

describe("STK section editors", () => {
  it("dispatches exactly the six client-only editors", () => {
    expect(config.sections.map((section) => sectionEditorFor(section.type)?.displayName)).toEqual([
      "CampaignHeroEditor", "ExhibitionGridEditor", "AudienceLinksEditor",
      "SpeakerCarouselEditor", "SponsorMarqueeEditor", "CtaBandEditor",
    ]);
    expect(sectionEditorFor("kv")).toBeNull();
  });

  it("disables invalid destinations and supports two independent campaign selections", async () => {
    const user = userEvent.setup();
    const destinationChange = vi.fn();
    const campaignChange = vi.fn();
    const { rerender } = render(<DestinationPicker label="목적지" destinations={config.settings!.destinations!} value="" onChange={destinationChange} />);
    expect(screen.getByRole("option", { name: /비활성/ })).toBeDisabled();
    expect(screen.getByRole("option", { name: /주소 오류/ })).toBeDisabled();
    rerender(<CampaignPicker label="캠페인" campaigns={config.settings!.campaigns!} value={[]} onChange={campaignChange} />);
    await user.click(screen.getByRole("checkbox", { name: "참가기업" }));
    expect(campaignChange).toHaveBeenLastCalledWith(["exhibitor-recruitment"]);
    rerender(<CampaignPicker label="캠페인" campaigns={config.settings!.campaigns!} value={["exhibitor-recruitment"]} onChange={campaignChange} />);
    await user.click(screen.getByRole("checkbox", { name: "참관객" }));
    expect(campaignChange).toHaveBeenLastCalledWith(["exhibitor-recruitment", "visitor-registration"]);
  });

  it.each(config.sections)("renders the $type editor and disables its controls for viewers", (section) => {
    const Editor = sectionEditorFor(section.type)!;
    const props: SectionEditorProps = { siteId: "site-1", locale: "ko", sources: [], pages: [], section, config, issues: [], canEdit: false, onChange: vi.fn() };
    render(<Editor {...props} />);
    expect(screen.getByTestId(`${section.type}-editor`)).toBeInTheDocument();
    expect([...screen.getAllByRole("button"), ...screen.getAllByRole("textbox")].every((control) => (control as HTMLButtonElement).disabled)).toBe(true);
  });
});
