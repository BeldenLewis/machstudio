// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePageAutosave, type ExpoSaveOutcome, type PageAutosave } from "@/lib/expo/use-page-autosave";

/**
 * 페이지 초안 자동저장.
 *
 * ── 이 파일이 붙잡는 것 ───────────────────────────────────────────────
 * `draftRevision` 은 **저장할 때마다 바뀐다.** 그 번호를 직렬화되는 값에 넣으면 성공한
 * 저장이 값을 바꾸고, 그게 곧바로 두 번째 저장을 일으켜 **한 번 타이핑에 PATCH 가
 * 끝없이** 나간다. 그래서 번호는 전송 전용 ref 에 있어야 하고, 그 사실을 여기서 못 박는다.
 *
 * 그리고 409 는 재시도하지 않는다 — 덮으면 남의 편집이 사라진다. 로컬 초안을 그대로
 * 보존하는 것이 이 화면에서 가장 중요한 성질이다.
 */

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

interface Harness {
  api: PageAutosave;
  setValue: (v: unknown) => void;
  setPage: (id: string, revision: number) => void;
}

let harness: Harness;
let host: HTMLDivElement;
let root: Root;

/** 저장 호출을 기록하고, 결과를 테스트가 정한다. */
function recorder(outcomes: ExpoSaveOutcome[]) {
  const calls: Array<{ value: unknown; revision: number }> = [];
  let i = 0;
  const save = vi.fn(async (value: unknown, revision: number) => {
    calls.push({ value, revision });
    return outcomes[Math.min(i++, outcomes.length - 1)];
  });
  return { calls, save };
}

/** 지연 가능한 저장 — 진행 중 타이핑을 재현할 때 쓴다. */
function deferredRecorder() {
  const calls: Array<{ value: unknown; revision: number }> = [];
  const gates: Array<(o: ExpoSaveOutcome) => void> = [];
  const save = vi.fn((value: unknown, revision: number) => {
    calls.push({ value, revision });
    return new Promise<ExpoSaveOutcome>((resolve) => gates.push(resolve));
  });
  return { calls, gates, save };
}

/** 실제 하니스 — 훅을 띄우고 값·페이지를 바꿀 손잡이를 노출한다. */
function makeHarness(opts: {
  save: (v: unknown, r: number) => Promise<ExpoSaveOutcome>;
  initialRevision?: number;
  enabled?: boolean;
  debounceMs?: number;
}) {
  function Probe() {
    const [value, setValue] = React.useState<unknown>({ title: "처음" });
    const [page, setPage] = React.useState({ id: "pg1", revision: opts.initialRevision ?? 0 });
    const api = usePageAutosave({
      pageId: page.id,
      value,
      initialRevision: page.revision,
      save: opts.save,
      debounceMs: opts.debounceMs ?? 10,
      enabled: opts.enabled ?? true,
    });
    harness = {
      api,
      setValue,
      setPage: (id, revision) => setPage({ id, revision }),
    };
    return null;
  }
  return Probe;
}

async function render(opts: Parameters<typeof makeHarness>[0]) {
  const Probe = makeHarness(opts);
  host = document.createElement("div");
  document.body.appendChild(host);
  await act(async () => {
    root = createRoot(host);
    root.render(<Probe />);
  });
}

/** 디바운스를 넘겨 저장이 돌게 한다. */
const settle = async (ms = 40) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};

beforeEach(() => { vi.clearAllMocks(); });

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  host?.remove();
});

describe("성공한 저장은 두 번 나가지 않는다", () => {
  /**
   * **핵심.** 번호가 직렬화 대상에 있으면 성공이 값을 바꾸고, 그게 두 번째 PATCH 를
   * 일으켜 끝없이 돈다.
   */
  it("한 번 고치면 PATCH 는 한 번이다", async () => {
    const { calls, save } = recorder([{ kind: "saved", revision: 1 }]);
    await render({ save, initialRevision: 0 });

    await act(async () => { harness.setValue({ title: "고침" }); });
    await settle();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ value: { title: "고침" }, revision: 0 });
    expect(harness.api.state).toBe("saved");
    expect(harness.api.dirty).toBe(false);
  });

  /** 서버가 번호만 올려 보내도 값이 그대로면 다시 보낼 이유가 없다. */
  it("번호만 바뀐 응답은 추가 PATCH 를 만들지 않는다", async () => {
    const { calls, save } = recorder([{ kind: "saved", revision: 99 }]);
    await render({ save, initialRevision: 0 });
    await act(async () => { harness.setValue({ title: "한 번" }); });
    await settle();
    await settle();
    expect(calls).toHaveLength(1);
  });

  it("다음 저장은 서버가 준 새 번호로 나간다", async () => {
    const { calls, save } = recorder([
      { kind: "saved", revision: 1 },
      { kind: "saved", revision: 2 },
    ]);
    await render({ save, initialRevision: 0 });

    await act(async () => { harness.setValue({ title: "첫 번째" }); });
    await settle();
    await act(async () => { harness.setValue({ title: "두 번째" }); });
    await settle();

    expect(calls.map((c) => c.revision)).toEqual([0, 1]);
  });

  /** 처음 마운트한 값은 기준선이다 — 사용자가 고쳐야 저장한다. */
  it("마운트만으로는 저장하지 않는다", async () => {
    const { calls, save } = recorder([{ kind: "saved", revision: 1 }]);
    await render({ save });
    await settle();
    expect(calls).toHaveLength(0);
    expect(harness.api.state).toBe("idle");
  });
});

describe("저장 중 타이핑", () => {
  /** 겹쳐 보내면 나중 요청이 앞 요청의 번호로 나가 409 가 된다. */
  it("진행 중에는 겹쳐 보내지 않고, 끝난 뒤 정확히 한 번 더 보낸다", async () => {
    const { calls, gates, save } = deferredRecorder();
    await render({ save, initialRevision: 0 });

    await act(async () => { harness.setValue({ title: "첫" }); });
    await settle();
    expect(calls).toHaveLength(1);

    // 저장이 아직 안 끝난 상태에서 두 번 더 타이핑한다.
    await act(async () => { harness.setValue({ title: "둘" }); });
    await act(async () => { harness.setValue({ title: "셋" }); });
    await settle();
    expect(calls).toHaveLength(1);

    // 첫 저장을 완료시킨다 — 후속 저장이 한 번만, 최신 값과 새 번호로.
    await act(async () => { gates[0]({ kind: "saved", revision: 1 }); });
    await settle();

    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({ value: { title: "셋" }, revision: 1 });
  });

  it("후속 저장까지 끝나면 깨끗해진다", async () => {
    const { gates, save } = deferredRecorder();
    await render({ save, initialRevision: 0 });
    await act(async () => { harness.setValue({ title: "첫" }); });
    await settle();
    await act(async () => { harness.setValue({ title: "둘" }); });
    await act(async () => { gates[0]({ kind: "saved", revision: 1 }); });
    await settle();
    await act(async () => { gates[1]({ kind: "saved", revision: 2 }); });
    await settle();
    expect(harness.api.dirty).toBe(false);
    expect(harness.api.state).toBe("saved");
  });
});

describe("409 — 재시도하지 않는다", () => {
  /** 덮으면 남의 편집이 사라진다. W1 은 페이지 통짜 JSON 을 자동 병합하지 않는다. */
  it("충돌 뒤 아무것도 보내지 않는다", async () => {
    const { calls, save } = recorder([{ kind: "conflict", revision: 7 }]);
    await render({ save, initialRevision: 3 });

    await act(async () => { harness.setValue({ title: "내 편집" }); });
    await settle();
    expect(calls).toHaveLength(1);
    expect(harness.api.conflict).toEqual({ revision: 7 });
    expect(harness.api.state).toBe("error");

    // 계속 타이핑해도 더 나가지 않는다.
    await act(async () => { harness.setValue({ title: "내 편집 2" }); });
    await settle();
    await act(async () => { harness.api.retry(); });
    await settle();
    expect(calls).toHaveLength(1);
  });

  /** 사용자가 방금까지 타이핑한 것이고, 그걸 잃는 것이 최악의 결과다. */
  it("로컬 초안을 건드리지 않는다", async () => {
    const { save } = recorder([{ kind: "conflict", revision: 7 }]);
    await render({ save, initialRevision: 3 });
    await act(async () => { harness.setValue({ title: "내 편집" }); });
    await settle();
    // 훅은 값을 소유하지 않는다 — 되돌릴 방법이 없어야 정상이다.
    expect(harness.api.dirty).toBe(true);
  });

  it("서버 번호를 화면에 준다", async () => {
    const { save } = recorder([{ kind: "conflict", revision: 42 }]);
    await render({ save, initialRevision: 1 });
    await act(async () => { harness.setValue({ title: "x" }); });
    await settle();
    expect(harness.api.conflict?.revision).toBe(42);
  });

  it("사람이 해소하면 다시 돈다", async () => {
    const { calls, save } = recorder([
      { kind: "conflict", revision: 42 },
      { kind: "saved", revision: 43 },
    ]);
    await render({ save, initialRevision: 1 });
    await act(async () => { harness.setValue({ title: "x" }); });
    await settle();

    await act(async () => { harness.api.resolveConflict(42); });
    expect(harness.api.conflict).toBeNull();
    expect(harness.api.state).toBe("idle");

    await act(async () => { harness.setValue({ title: "y" }); });
    await settle();
    expect(calls).toHaveLength(2);
    expect(calls[1].revision).toBe(42);
  });
});

describe("실패는 재시도한다", () => {
  /** 네트워크·5xx 는 덮을 위험이 없다 — 기준선을 유지해 다음 기회에 다시 보낸다. */
  it("다음 변경에서 다시 보낸다", async () => {
    const { calls, save } = recorder([{ kind: "failed" }, { kind: "saved", revision: 1 }]);
    await render({ save, initialRevision: 0 });

    await act(async () => { harness.setValue({ title: "첫" }); });
    await settle();
    expect(harness.api.state).toBe("error");

    await act(async () => { harness.setValue({ title: "둘" }); });
    await settle();
    expect(calls).toHaveLength(2);
    expect(harness.api.state).toBe("saved");
  });

  it("retry 로도 다시 보낸다", async () => {
    const { calls, save } = recorder([{ kind: "failed" }, { kind: "saved", revision: 1 }]);
    await render({ save, initialRevision: 0 });
    await act(async () => { harness.setValue({ title: "첫" }); });
    await settle();
    await act(async () => { await harness.api.retry(); });
    await settle();
    expect(calls).toHaveLength(2);
  });

  it("실패는 같은 번호로 다시 보낸다", async () => {
    const { calls, save } = recorder([{ kind: "failed" }, { kind: "saved", revision: 1 }]);
    await render({ save, initialRevision: 5 });
    await act(async () => { harness.setValue({ title: "첫" }); });
    await settle();
    await act(async () => { harness.setValue({ title: "둘" }); });
    await settle();
    expect(calls.map((c) => c.revision)).toEqual([5, 5]);
  });
});

describe("flush — 페이지 전환 전에 부른다", () => {
  it("깨끗하면 아무것도 보내지 않는다", async () => {
    const { calls, save } = recorder([{ kind: "saved", revision: 1 }]);
    await render({ save });
    let result: string | undefined;
    await act(async () => { result = await harness.api.flush(); });
    expect(result).toBe("clean");
    expect(calls).toHaveLength(0);
  });

  it("대기분이 있으면 즉시 보내고 결과를 알려 준다", async () => {
    const { calls, save } = recorder([{ kind: "saved", revision: 1 }]);
    await render({ save, debounceMs: 10_000 });
    await act(async () => { harness.setValue({ title: "고침" }); });

    let result: string | undefined;
    await act(async () => { result = await harness.api.flush(); });
    expect(result).toBe("saved");
    expect(calls).toHaveLength(1);
  });

  /**
   * **이 케이스가 빠져 있었다.** 기존 flush 테스트 셋은 전부 유휴 상태에서 시작해서,
   * 진행 중일 때 flush 가 즉시 반환하는 것을 아무도 못 잡았다.
   *
   * 그게 왜 사고인가: 호출부는 페이지를 넘기기 전에 flush 를 부르고 결과를 보고 넘어간다.
   * 즉시 "saved" 를 받으면 페이지를 넘기고, 그 뒤 완료된 저장은 페이지가 바뀐 것을 보고
   * 후속 저장을 버린다 — **전환 직전에 친 글자가 사라진다.**
   */
  it("진행 중이면 그 저장이 끝날 때까지 기다린다", async () => {
    const { calls, gates, save } = deferredRecorder();
    await render({ save, initialRevision: 0, debounceMs: 5 });

    await act(async () => { harness.setValue({ title: "첫" }); });
    await settle();
    expect(calls).toHaveLength(1);

    // 저장이 도는 동안 한 글자 더 친다 — 이게 지켜져야 하는 편집이다.
    await act(async () => { harness.setValue({ title: "첫둘" }); });

    let settled = false;
    let result: string | undefined;
    await act(async () => {
      const pending = harness.api.flush().then((r) => { settled = true; result = r; });
      await Promise.resolve();
      // 아직 서버가 응답하지 않았다 — flush 가 여기서 끝나면 안 된다.
      expect(settled).toBe(false);

      gates[0]({ kind: "saved", revision: 1 });
      await new Promise((r) => setTimeout(r, 0));
      // 후속 저장이 나갔고, flush 는 그것까지 기다린다.
      expect(calls).toHaveLength(2);
      expect(settled).toBe(false);

      gates[1]({ kind: "saved", revision: 2 });
      await pending;
    });

    expect(settled).toBe(true);
    expect(result).toBe("saved");
    // 진행 중에 친 글자가 실제로 서버에 갔다.
    expect(calls[1].value).toEqual({ title: "첫둘" });
    expect(harness.api.dirty).toBe(false);
  });

  /** 진행 중 flush 가 요청을 하나 더 겹쳐 보내면 뒤엣것이 옛 번호로 나가 409 가 된다. */
  it("진행 중 flush 가 요청을 겹쳐 보내지 않는다", async () => {
    const { calls, gates, save } = deferredRecorder();
    await render({ save, initialRevision: 0, debounceMs: 5 });
    await act(async () => { harness.setValue({ title: "첫" }); });
    await settle();

    await act(async () => {
      void harness.api.flush();
      void harness.api.flush();
      await Promise.resolve();
    });
    expect(calls).toHaveLength(1);

    await act(async () => { gates[0]({ kind: "saved", revision: 1 }); });
    await settle();
    expect(calls).toHaveLength(1);
  });

  /** 실패·충돌이면 화면이 그 자리에 머물러야 한다 — 넘어가면 변경이 사라진다. */
  it("실패와 충돌을 구분해 알려 준다", async () => {
    const failed = recorder([{ kind: "failed" }]);
    await render({ save: failed.save, debounceMs: 10_000 });
    await act(async () => { harness.setValue({ title: "x" }); });
    let r1: string | undefined;
    await act(async () => { r1 = await harness.api.flush(); });
    expect(r1).toBe("failed");

    await act(async () => { root.unmount(); });
    host.remove();

    const conflicted = recorder([{ kind: "conflict", revision: 9 }]);
    await render({ save: conflicted.save, debounceMs: 10_000 });
    await act(async () => { harness.setValue({ title: "y" }); });
    let r2: string | undefined;
    await act(async () => { r2 = await harness.api.flush(); });
    expect(r2).toBe("conflict");
  });
});

describe("페이지 전환", () => {
  /**
   * **핵심.** 페이지 id 를 안 보면 앞 페이지의 대기분이 새 페이지 id 로 나가서
   * 남의 페이지를 덮는다.
   */
  it("전환 뒤에는 앞 페이지의 대기분을 보내지 않는다", async () => {
    const { calls, save } = recorder([{ kind: "saved", revision: 1 }]);
    await render({ save, debounceMs: 10_000, initialRevision: 0 });

    await act(async () => { harness.setValue({ title: "pg1 편집" }); });
    // flush 없이 페이지를 바꾼다 — 대기분은 버려져야 한다.
    await act(async () => { harness.setPage("pg2", 5); });
    await settle();

    expect(calls).toHaveLength(0);
    expect(harness.api.dirty).toBe(false);
  });

  it("새 페이지의 번호로 갈아탄다", async () => {
    const { calls, save } = recorder([{ kind: "saved", revision: 6 }]);
    await render({ save, initialRevision: 0 });
    await act(async () => { harness.setPage("pg2", 5); });
    await act(async () => { harness.setValue({ title: "pg2 편집" }); });
    await settle();
    expect(calls[0].revision).toBe(5);
  });

  /** 앞 페이지에서 409 를 만났다고 새 페이지 편집이 막혀서는 안 된다. */
  it("전환하면 충돌 잠금이 풀린다", async () => {
    const { calls, save } = recorder([
      { kind: "conflict", revision: 9 },
      { kind: "saved", revision: 6 },
    ]);
    await render({ save, initialRevision: 0 });
    await act(async () => { harness.setValue({ title: "pg1" }); });
    await settle();
    expect(harness.api.conflict).not.toBeNull();

    await act(async () => { harness.setPage("pg2", 5); });
    await act(async () => { harness.setValue({ title: "pg2" }); });
    await settle();
    expect(calls).toHaveLength(2);
  });
});

describe("뷰어에게는 아무것도 붙지 않는다", () => {
  it("저장하지 않는다", async () => {
    const { calls, save } = recorder([{ kind: "saved", revision: 1 }]);
    await render({ save, enabled: false });
    await act(async () => { harness.setValue({ title: "고침" }); });
    await settle();
    expect(calls).toHaveLength(0);
    expect(harness.api.state).toBe("idle");
  });

  it("flush 도 아무것도 하지 않는다", async () => {
    const { calls, save } = recorder([{ kind: "saved", revision: 1 }]);
    await render({ save, enabled: false });
    await act(async () => { harness.setValue({ title: "고침" }); });
    let result: string | undefined;
    await act(async () => { result = await harness.api.flush(); });
    expect(result).toBe("disabled");
    expect(calls).toHaveLength(0);
  });

  /** 읽기 전용 화면이 beforeunload 를 잡고 있을 이유가 없다. */
  it("언마운트에서도 보내지 않는다", async () => {
    const { calls, save } = recorder([{ kind: "saved", revision: 1 }]);
    await render({ save, enabled: false });
    await act(async () => { harness.setValue({ title: "고침" }); });
    await act(async () => { root.unmount(); });
    await settle();
    expect(calls).toHaveLength(0);
  });
});

describe("언마운트", () => {
  /** 자동저장이므로 화면을 떠날 때 대기분은 항상 영속화한다. */
  it("대기분을 밀어 넣는다", async () => {
    const { calls, save } = recorder([{ kind: "saved", revision: 1 }]);
    await render({ save, debounceMs: 10_000 });
    await act(async () => { harness.setValue({ title: "고침" }); });
    await act(async () => { root.unmount(); });
    await settle();
    expect(calls).toHaveLength(1);
  });
});
