import { describe, expect, it } from "vitest";
import { normalizeCompetitionConfig } from "@/lib/competition-config";

/**
 * 투표 화면 소개 블록(voteIntro) 정규화.
 *
 * 운영자가 색·크기를 직접 입력하는 자리라, 저장 시점에 가두지 않으면 잘못된 값(빈 문자열,
 * 음수, 터무니없이 큰 숫자)이 그대로 공개 화면 인라인 style 에 꽂혀 레이아웃이 깨지거나
 * 색이 안 먹는 채로 나간다.
 */
describe("voteIntro 정규화", () => {
  it("아무것도 안 넣으면 꺼진 채, 빈 문구, 기본 크기로 떨어진다", () => {
    const config = normalizeCompetitionConfig({});
    expect(config.voteIntro.enabled).toBe(false);
    expect(config.voteIntro.title).toBe("");
    expect(config.voteIntro.body).toBe("");
    expect(config.voteIntro.textColor).toBe("");
    expect(config.voteIntro.titleFontSize).toBe(22);
    expect(config.voteIntro.bodyFontSize).toBe(15);
  });

  it("정상 값은 그대로 저장된다", () => {
    const config = normalizeCompetitionConfig({
      voteIntro: { enabled: true, title: "투표해주세요!", body: "줄바꿈\n보존", textColor: "#FF8500", titleFontSize: 28, bodyFontSize: 16 },
    });
    expect(config.voteIntro).toEqual({
      enabled: true, title: "투표해주세요!", body: "줄바꿈\n보존", textColor: "#FF8500", titleFontSize: 28, bodyFontSize: 16,
    });
  });

  it("색 형식이 아니면 빈 값(테마 기본색 상속)으로 떨어진다", () => {
    expect(normalizeCompetitionConfig({ voteIntro: { textColor: "orange" } }).voteIntro.textColor).toBe("");
    expect(normalizeCompetitionConfig({ voteIntro: { textColor: "#fff" } }).voteIntro.textColor).toBe("");
    expect(normalizeCompetitionConfig({ voteIntro: { textColor: "#FF8500" } }).voteIntro.textColor).toBe("#FF8500");
  });

  it("글자 크기는 범위를 벗어나면 저장 시점에 가둔다 — 공개 화면 레이아웃이 깨지면 안 된다", () => {
    expect(normalizeCompetitionConfig({ voteIntro: { titleFontSize: 5 } }).voteIntro.titleFontSize).toBe(14);
    expect(normalizeCompetitionConfig({ voteIntro: { titleFontSize: 999 } }).voteIntro.titleFontSize).toBe(48);
    expect(normalizeCompetitionConfig({ voteIntro: { bodyFontSize: 1 } }).voteIntro.bodyFontSize).toBe(11);
    expect(normalizeCompetitionConfig({ voteIntro: { bodyFontSize: 999 } }).voteIntro.bodyFontSize).toBe(28);
  });
});
