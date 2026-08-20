import { describe, expect, it } from "vitest";
import { normalizeCompetitionConfig } from "@/lib/competition-config";
import { renderFormFieldsHtml, renderFormModalHtml } from "@/lib/competition-render";

/**
 * 신청 폼의 **시스템 문구**가 언어를 따르는가.
 *
 * 항목 이름은 운영자가 직접 쓰지만, 그 밑에 붙는 안내("장당 4MB 이하", "비공개 영상은
 * 재생되지 않아요")는 우리가 넣는 것이라 손댈 수가 없었다. 영문 폼에 그 두 줄만 한글로
 * 남았고, 운영자 눈에는 고칠 방법이 없는 자리였다 — 공고에서 겪은 것과 같은 문제다.
 */
const fields = [
  { id: "f-image", key: "images", label: "Team image", type: "image", enabled: true, required: false, options: [], maxFiles: 3 },
  { id: "f-video", key: "video_link", label: "Video link", type: "youtube", enabled: true, required: true, options: [] },
  { id: "f-pick", key: "size", label: "Size", type: "select", enabled: true, required: false, options: ["S", "M"] },
];
const configFor = (language?: string) =>
  normalizeCompetitionConfig({ form: { fields }, ...(language ? { language } : {}) }, { includeDisabled: true });

const hintsOf = (html: string) => [...html.matchAll(/<p class="mc-hint">([^<]*)<\/p>/g)].map((m) => m[1]);
const hasHangul = (value: string) => /[가-힣]/.test(value);

describe("신청 폼 문구 언어", () => {
  it("영어면 파일·영상 안내에 한글이 없다", () => {
    const hints = hintsOf(renderFormFieldsHtml(configFor("en")));
    expect(hints).toHaveLength(2);
    for (const hint of hints) expect(hasHangul(hint), hint).toBe(false);
  });

  it("한국어면 그대로 한글 — 사전이 통째로 영어로 굳으면 안 된다", () => {
    const hints = hintsOf(renderFormFieldsHtml(configFor("ko")));
    expect(hints.some(hasHangul)).toBe(true);
  });

  it("선택 항목의 기본 안내도 언어를 따른다", () => {
    expect(renderFormFieldsHtml(configFor("en"))).toContain("Please select");
    expect(renderFormFieldsHtml(configFor("ko"))).toContain("선택해주세요");
  });

  /** 운영자가 제목을 안 적었을 때 우리가 넣는 기본값 — 여기도 언어를 따라야 한다. */
  it("팝업 제목 기본값도 언어를 따른다", () => {
    expect(renderFormModalHtml(configFor("en"))).toContain("Apply");
    expect(renderFormModalHtml(configFor("ko"))).toContain("참가 신청");
  });

  /**
   * 언어를 대회 전체 설정으로 올리면서, 공고에만 정해 둔 기존 대회가 리셋되면 안 된다.
   * 저장 한 번에 영문 공고가 한글로 돌아가는 종류의 사고다.
   */
  it("공고에만 정해 둔 언어를 이어받는다", () => {
    const legacy = normalizeCompetitionConfig(
      { form: { fields }, noticePage: { language: "en" } },
      { includeDisabled: true },
    );
    expect(legacy.language).toBe("en");
  });

  it("아무 데도 안 적혔으면 한국어", () => {
    expect(configFor().language).toBe("ko");
  });
});
