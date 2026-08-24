// @vitest-environment node
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { expoCustomCodeDigest, expoPreviewCodeDigest, previewSections } from "@/lib/expo/code-digest";

/**
 * 붙여넣은 코드 실행 허가 — **두 곳이 같은 값을 봐야 성립한다.**
 *
 * 편집기가 "이 코드 실행" 을 요청할 때 보내는 지문(`api/expo/pages/[pageId]`)과
 * 미리보기 라우트가 계산하는 지문(`app/hp/[token]`)이 같아야 실행이 허용된다.
 * 어긋나면 운영자에게는 **"눌렀는데 자리표만 나온다"** 로 보이고, 화면에는 단서가 없다.
 *
 * 그래서 두 라우트가 같은 함수를 부르고, 이 파일이 그 함수의 성질을 못 박는다.
 */

const SID_A = "11111111-1111-1111-1111-111111111111";
const SID_B = "22222222-2222-2222-2222-222222222222";

const code = (sid: string, source: string, over: Record<string, unknown> = {}) => ({
  sid, type: "custom-code", variant: "boxed", enabled: true, embedEnabled: false,
  design: {}, content: { code: source }, ...over,
});

const kv = (over: Record<string, unknown> = {}) => ({
  sid: SID_A, type: "kv", variant: "column", enabled: true, embedEnabled: false,
  design: {}, content: { title: { ko: "제목" } }, ...over,
});

describe("미리보기가 그리는 목록", () => {
  it("내용이 없는 구획은 빼고", () => {
    const sections = previewSections({ sections: [kv({ content: {} })] });
    expect(sections).toHaveLength(0);
  });

  /**
   * 공개 로더가 `enabled` 로 거른다(`renderableSections`). 미리보기만 보여 주면
   * 꺼 놓은 구획이 미리보기에는 있고 발행본에는 없다 — 미리보기가 거짓말을 한다.
   */
  it("페이지에 표시를 끈 구획도 뺀다", () => {
    expect(previewSections({ sections: [kv({ enabled: false })] })).toHaveLength(0);
    expect(previewSections({ sections: [kv()] })).toHaveLength(1);
  });

  /** 이 화면은 아직 안 켠 것을 보려고 여는 곳이다. */
  it("따로 내보내기 스위치는 보지 않는다", () => {
    expect(previewSections({ sections: [kv({ embedEnabled: false })] })).toHaveLength(1);
  });
});

describe("지문", () => {
  it("미리보기 목록에서 뽑은 것과 같다", () => {
    const raw = { sections: [kv(), code(SID_B, "<b>지도</b>")] };
    expect(expoPreviewCodeDigest(raw)).toBe(expoCustomCodeDigest(previewSections(raw)));
  });

  it("코드가 바뀌면 지문도 바뀐다", () => {
    const before = expoPreviewCodeDigest({ sections: [code(SID_B, "<b>지도</b>")] });
    const after = expoPreviewCodeDigest({ sections: [code(SID_B, "<b>약도</b>")] });
    expect(after).not.toBe(before);
  });

  /** 제목 한 글자 고칠 때마다 다시 "실행" 을 누르게 하면 아무도 안 쓴다. */
  it("코드와 무관한 편집은 지문을 바꾸지 않는다", () => {
    const before = expoPreviewCodeDigest({ sections: [code(SID_B, "<b>지도</b>")] });
    const after = expoPreviewCodeDigest({
      sections: [code(SID_B, "<b>지도</b>", { variant: "full", design: { bg: "dark" } })],
    });
    expect(after).toBe(before);
  });

  /**
   * 꺼 놓은 코드 구획은 미리보기에 그려지지 않는다 — 지문에도 없어야 한다.
   * 있으면 **실행되지도 않을 코드 때문에** 허가가 낡아 다시 확인을 요구하게 된다.
   */
  it("꺼 놓은 코드 구획은 지문에 안 들어간다", () => {
    const off = expoPreviewCodeDigest({ sections: [code(SID_B, "<b>지도</b>", { enabled: false })] });
    expect(off).toBe("");
  });

  it("코드 구획이 없으면 지문도 없다 — 허가할 대상이 없다", () => {
    expect(expoPreviewCodeDigest({ sections: [kv()] })).toBe("");
    expect(expoPreviewCodeDigest(null)).toBe("");
  });

  /** 순서가 바뀌면 실행되는 순서가 바뀐다 — 그것도 다시 확인할 일이다. */
  it("구획 순서가 바뀌면 지문도 바뀐다", () => {
    const a = expoPreviewCodeDigest({
      sections: [code(SID_A, "<b>하나</b>"), code(SID_B, "<b>둘</b>")],
    });
    const b = expoPreviewCodeDigest({
      sections: [code(SID_B, "<b>둘</b>"), code(SID_A, "<b>하나</b>")],
    });
    expect(b).not.toBe(a);
  });
});

/**
 * 이 파일은 **남의 코드를 실행할지 정한다.** 그런데 구분자를 날 제어문자로 적어 두면
 * git 이 파일 전체를 바이너리로 보고 diff 를 아예 안 보여 준다(실측: numstat 이 `-  -`).
 * 변경이 눈에 안 보이는 것 자체가 위험이라, 이스케이프로만 적는다.
 *
 * 문자는 같으므로 지문 값은 바뀌지 않는다 — 위 검사들이 그걸 지킨다.
 */
describe("소스가 텍스트로 남아 있다", () => {
  it("날 제어문자가 없다", () => {
    const src = readFileSync(
      join(resolve(__dirname, "../../../.."), "src/lib/expo/code-digest.ts"),
      "utf8",
    );
    const bad = [...src].filter((c) => c.codePointAt(0)! < 32 && c !== "\n" && c !== "\t");
    expect(bad.map((c) => "U+" + c.codePointAt(0)!.toString(16).padStart(4, "0"))).toEqual([]);
  });
});
