import { describe, it, expect } from "vitest";
import { decideExternalSync, diffPatch } from "../use-autosave";

/**
 * 만들기 탭 ↔ 운영 콘솔이 같은 키(components.chatEnabled·qaMode)를 공유할 때
 * "상대의 변경이 되돌아가는" 드리프트를 막는 두 장치의 회귀 테스트.
 */

describe("diffPatch — 바뀐 키만 보낸다", () => {
  it("아무것도 안 바꿨으면 빈 패치", () => {
    const server = { chatEnabled: true, qaMode: "open" };
    expect(diffPatch(server, { ...server })).toEqual({});
  });

  it("바꾼 키만 담는다", () => {
    const patch = diffPatch(
      { chatEnabled: true, qaMode: "open" },
      { chatEnabled: false, qaMode: "open" },
    );
    expect(patch).toEqual({ chatEnabled: false });
    expect("qaMode" in patch).toBe(false);
  });

  /**
   * 핵심: diffPatch 의 비교 기준(server 인자)은 **폼이 초기화될 때 함께 받은 props 스냅샷**이다.
   * DB 의 진짜 값이 아니다. 그래서 props 가 낡아도 폼과 기준이 같이 낡아 움직이고,
   * "내가 건드린 키"만 정확히 골라낼 수 있다 — 이게 드리프트를 막는 원리다.
   */
  it("드리프트 시나리오: props 가 낡았어도 내가 안 건드린 키는 패치에 담기지 않는다", () => {
    // 만들기 탭을 열어둔 창의 props 스냅샷(콘솔 변경 전 = open)
    const snapshotWhenOpened = { chatEnabled: true, qaMode: "open" };
    // 그 사이 콘솔에서 폐쇄형으로 바꿨다 → DB = closed (이 창은 아직 모른다)
    const actualDb = { chatEnabled: true, qaMode: "closed" };

    // 이 창에서 채팅만 껐다 → 폼 = { chatEnabled: false, qaMode: "open"(손대지 않은 낡은 값) }
    const patch = diffPatch(snapshotWhenOpened, { chatEnabled: false, qaMode: "open" });

    // qaMode 는 패치에 없다 → PATCH 가 그 키를 안 보내고, 서버 병합이 DB 의 closed 를 유지한다
    expect(patch).toEqual({ chatEnabled: false });
    expect("qaMode" in patch).toBe(false);
    expect(actualDb.qaMode).toBe("closed"); // 살아남는다
  });

  it("예전 동작(폼 전체를 항상 전송)과의 대조 — 그때는 콘솔 변경이 되돌아갔다", () => {
    const formWithStaleQa = { chatEnabled: false, qaMode: "open" };

    // 예전: components: { chatEnabled, qaMode } 를 무조건 실어 보냈다
    const oldPayload = { ...formWithStaleQa };
    expect(oldPayload.qaMode).toBe("open"); // ← DB 의 closed 를 open 으로 되돌린다

    // 지금: 안 건드린 키는 빠진다
    const snapshotWhenOpened = { chatEnabled: true, qaMode: "open" };
    const newPayload = diffPatch(snapshotWhenOpened, formWithStaleQa);
    expect("qaMode" in newPayload).toBe(false);
    expect(newPayload).toEqual({ chatEnabled: false });
  });

  it("내가 정말로 qaMode 를 바꿨으면 당연히 보낸다", () => {
    const snapshot = { chatEnabled: true, qaMode: "open" };
    expect(diffPatch(snapshot, { chatEnabled: true, qaMode: "closed" })).toEqual({ qaMode: "closed" });
  });
});

describe("decideExternalSync — 외부 변경을 따라가되 편집 중이면 대기", () => {
  const s = (o: unknown) => JSON.stringify(o);

  it("외부 변경이 없으면 아무것도 하지 않는다", () => {
    const base = s({ qaMode: "open" });
    expect(decideExternalSync(base, base, false)).toEqual({ baseline: base, adopt: false });
  });

  it("깨끗한 상태에서 외부 변경이 오면 채택한다", () => {
    const base = s({ qaMode: "open" });
    const next = s({ qaMode: "closed" });
    expect(decideExternalSync(base, next, false)).toEqual({ baseline: next, adopt: true });
  });

  it("편집 중이면 채택하지 않고 **기준값을 유지**한다 (놓치지 않기 위해)", () => {
    const base = s({ qaMode: "open" });
    const next = s({ qaMode: "closed" });
    const d = decideExternalSync(base, next, true);
    expect(d.adopt).toBe(false);
    expect(d.baseline).toBe(base); // 갱신하면 이 변경을 영구히 놓친다
  });

  it("편집 중 들어온 변경이 저장 후(dirty 해제) 반영된다", () => {
    let baseline = s({ qaMode: "open" });
    const incoming = s({ qaMode: "closed" });

    // 1) 편집 중 — 보류
    let d = decideExternalSync(baseline, incoming, true);
    baseline = d.baseline;
    expect(d.adopt).toBe(false);

    // 2) 저장이 끝나 dirty 해제 — 같은 incoming 으로 다시 판정되면 이제 채택
    d = decideExternalSync(baseline, incoming, false);
    baseline = d.baseline;
    expect(d.adopt).toBe(true);
    expect(baseline).toBe(incoming);

    // 3) 이후 같은 값이 또 와도 다시 채택하지 않는다(무한 루프 방지)
    expect(decideExternalSync(baseline, incoming, false).adopt).toBe(false);
  });

  it("내 저장 결과가 props 로 돌아와도 한 번만 채택하고 멈춘다", () => {
    let baseline = s({ name: "옛 이름" });
    const mine = s({ name: "새 이름" });
    let d = decideExternalSync(baseline, mine, false);
    baseline = d.baseline;
    expect(d.adopt).toBe(true);
    expect(decideExternalSync(baseline, mine, false).adopt).toBe(false);
  });
});
