/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ExpoPageSettings, joinScheduleValue, splitScheduleValue } from "@/components/expo/ExpoPageSettings";
import type { ExpoPageConfigV2 } from "@/lib/expo/types";

const config: ExpoPageConfigV2 = {
  schemaVersion: 2,
  settings: {
    event: { edition: 2027, startsAt: "2027-06-23T09:30:00+09:00", endsAt: "2027-06-26T18:00:00+09:00", facts: { companies: 400 } },
    campaigns: [
      { id: "exhibitor-recruitment", label: "참가기업", startsAt: "2026-09-01T00:00:00+09:00", endsAt: "2027-06-23T00:00:00+09:00", override: "auto", enabled: true },
      { id: "visitor-registration", label: "참관객", startsAt: "2027-01-01T00:00:00Z", endsAt: "2027-06-23T00:00:00Z", override: "force-off", enabled: true },
    ],
    destinations: [{ id: "booth-inquiry", label: "부스 문의", action: { type: "url", href: "https://example.com/booth" }, analytics: { eventName: "select_content", contentId: "booth" }, enabled: true }],
  },
  sections: [],
};

describe("ExpoPageSettings", () => {
  it("round-trips date, time, and numeric offsets without Date conversion", () => {
    expect(splitScheduleValue("2027-06-23T09:30:00+09:00")).toEqual({ date: "2027-06-23", time: "09:30:00", offsetHours: 9 });
    expect(splitScheduleValue("2027-01-01T00:00:00Z")).toEqual({ date: "2027-01-01", time: "00:00:00", offsetHours: 0 });
    expect(joinScheduleValue("2027-06-23", "09:30:00", 9)).toBe("2027-06-23T09:30:00+09:00");
    expect(joinScheduleValue("2027-01-01", "00:00:00", 0)).toBe("2027-01-01T00:00:00Z");
  });

  it("updates one campaign override and switches destination action independently", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<ExpoPageSettings config={config} issues={[]} canEdit onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText("참가기업 상태 재정의"), "force-on");
    const next = onChange.mock.calls.at(-1)?.[0] as ExpoPageConfigV2;
    expect(next.settings?.campaigns?.map((campaign) => campaign.override)).toEqual(["force-on", "force-off"]);
    rerender(<ExpoPageSettings config={next} issues={[]} canEdit onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText("부스 문의 동작"), "imweb-modal");
    expect((onChange.mock.calls.at(-1)?.[0] as ExpoPageConfigV2).settings?.destinations?.[0].action).toEqual({ type: "imweb-modal", modalId: "" });
  });

  it("renders exact field-path errors and allowlisted analytics", () => {
    render(<ExpoPageSettings config={config} canEdit onChange={vi.fn()} issues={[{ path: "settings.event.endsAt", code: "invalid-date", message: "종료 시각 오류", severity: "error" }]} />);
    expect(screen.getByText("종료 시각 오류")).toHaveAttribute("data-field-path", "settings.event.endsAt");
    const analytics = screen.getByLabelText("부스 문의 분석 이벤트") as HTMLSelectElement;
    expect([...analytics.options].map((option) => option.value)).toEqual(["", "select_content", "generate_lead"]);
  });
});
