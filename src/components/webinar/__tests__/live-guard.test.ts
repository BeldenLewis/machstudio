import { describe, expect, it } from "vitest";
import { liveOffConfirm } from "../use-live-guard";

const WHAT = "채팅 탭";
const EFFECT = "시청 화면 참여 박스에서 채팅 탭이 사라져요.";

describe("liveOffConfirm", () => {
  it("라이브가 아니면 확인하지 않는다 — 준비 중에는 마음껏 켜고 끈다", () => {
    expect(liveOffConfirm(false, 12, WHAT, EFFECT)).toBeNull();
    // 사람이 남아 있어도(핑이 아직 안 끊긴 종료 직후) 라이브가 아니면 묻지 않는다
    expect(liveOffConfirm(false, null, WHAT, EFFECT)).toBeNull();
  });

  it("라이브면 확인하고, 실제 인원을 문구에 넣는다", () => {
    const o = liveOffConfirm(true, 1234, WHAT, EFFECT);
    expect(o).not.toBeNull();
    // 조사: 탭은 종성이 있어 "을" — objectParticle 이 붙인다
    expect(o!.title).toBe("라이브 중에 채팅 탭을 끌까요?");
    // 천 단위 구분 — 네 자리를 "1234명" 으로 쓰면 한 번 더 읽어야 한다
    expect(o!.description).toContain("지금 1,234명이 보고 있어요.");
    expect(o!.description).toContain(EFFECT);
    expect(o!.tone).toBe("danger");
    expect(o!.confirmLabel).toBe("끄기");
  });

  it("조사를 앞말에 맞춘다 — 종성 없는 말에는 를", () => {
    expect(liveOffConfirm(true, 1, "사전등록 접수", EFFECT)!.title).toBe("라이브 중에 사전등록 접수를 끌까요?");
    expect(liveOffConfirm(true, 1, "랜딩 페이지 공개", EFFECT)!.title).toBe("라이브 중에 랜딩 페이지 공개를 끌까요?");
  });

  it("0명과 '아직 모름' 을 구분한다 — 둘을 같은 문구로 쓰면 0명을 모름으로 읽는다", () => {
    expect(liveOffConfirm(true, 0, WHAT, EFFECT)!.description).toContain("현재 접속자는 0명");
    const unknown = liveOffConfirm(true, null, WHAT, EFFECT)!.description;
    expect(unknown).toContain("지금 방송 중이에요.");
    expect(unknown).not.toContain("0명");
  });
});
