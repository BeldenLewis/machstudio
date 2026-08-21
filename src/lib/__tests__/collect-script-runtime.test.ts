// @vitest-environment node
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { buildCollectScripts, type CollectFieldMapping } from "@/lib/collect-script";

/**
 * 연동형 수집 스크립트를 **생성된 실물 그대로 실행해** 동작을 고정한다.
 *
 * ── 왜 문자열 스냅샷이 아니라 실행인가 ────────────────────────────────
 * 스크립트 본문은 모든 소스가 공유하는 한 벌이라, 대행 사이트 지원을 넣으면 **텍스트는
 * 반드시 바뀐다.** 바뀌면 안 되는 것은 텍스트가 아니라 **아임웹 폼에서 나오는 결과**다.
 * 그래서 실제 DOM 을 만들고 스크립트를 돌려 전송 payload 를 비교한다.
 *
 * ── 왜 케이스마다 새 JSDOM 인가 ───────────────────────────────────────
 * 이 스크립트는 `document` 에 캡처 리스너를 건다. 한 문서에서 두 번 실행하면 **앞 케이스의
 * 인스턴스가 살아남아 뒤 케이스의 클릭을 자기 매핑으로 가로챈다**(처음에 그렇게 짰다가
 * 다음 테스트가 앞 테스트의 키로 데이터를 보내는 것을 보고 알았다). 창을 매번 새로 판다.
 *
 * 이 테스트가 지키는 것: THE MOST(16,897건, 지금도 수집 중)와 STK(35,390건)가 쓰는
 * `.form-group` + 위치 인덱스 경로. 여기가 흔들리면 실제 전시 등록이 유실된다.
 */

const BASE = "https://machstudio.vercel.app";

function buildScript(fieldMappings: CollectFieldMapping[], patterns: string[] = []) {
  return buildCollectScripts({
    source: {
      id: "src_test",
      apiKey: "key_test",
      successTrigger: "정상적으로 접수되었습니다",
      redirectUrl: null,
      formPagePatterns: patterns,
    },
    fieldMappings,
    baseUrl: BASE,
  }).script;
}

interface Harness {
  window: ReturnType<typeof makeWindow>;
  doc: Document;
  sent: Array<Record<string, unknown>>;
  /** 제출 클릭 → 페이지 이탈. 실제 사용자의 경로와 같은 순서. */
  submitAndLeave(): Promise<void>;
}

/**
 * 새 창을 열고, 폼을 그리고, 생성된 스크립트를 그 안에서 실행한다.
 * `url` 은 폼 페이지 패턴 판정에 쓰인다.
 */
function makeWindow(html: string, url: string) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    url,
    runScripts: "dangerously",
    pretendToBeVisual: true,
  });
  return dom.window as unknown as Window & typeof globalThis;
}

function mount(html: string, script: string, url = "https://example.com/pre-registration"): Harness {
  const w = makeWindow(html, url);
  const sent: Array<Record<string, unknown>> = [];

  const record = (body: unknown) => {
    try { sent.push(JSON.parse(String(body))); } catch { /* 우리 payload 가 아니면 무시 */ }
  };
  // 전송 경로 둘 다 잡는다 — 스크립트는 sendBeacon 이 있으면 그쪽, 없으면 fetch 로 간다.
  Object.defineProperty(w.navigator, "sendBeacon", {
    configurable: true,
    value: (_u: string, blob: { text?: () => Promise<string> }) => {
      blob.text?.().then(record);
      return true;
    },
  });
  (w as unknown as { fetch: unknown }).fetch = (_u: unknown, init?: { body?: unknown }) => {
    record(init?.body);
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  };

  w.eval(script);

  return {
    window: w,
    doc: w.document,
    sent,
    async submitAndLeave() {
      const go = w.document.getElementById("go");
      go?.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
      w.dispatchEvent(new w.Event("pagehide"));
      // sendBeacon 의 blob.text() 가 마이크로태스크라 한 틱 넘긴다.
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}

/** 아임웹이 만드는 모양 — 라벨 + 입력이 `.form-group` 으로 묶인다(실물 확인: THE MOST 18개). */
function imwebForm(fields: Array<{ label: string; html: string }>) {
  return `<form id="f">${fields
    .map((f) => `<div class="form-group"><label>${f.label}</label>${f.html}</div>`)
    .join("")}<button type="submit" id="go">확인</button></form>`;
}

const LEGACY_MAPPINGS: CollectFieldMapping[] = [
  { index: 0, key: "name", label: "이름" },
  { index: 1, key: "email", label: "이메일" },
  { index: 2, key: "phone", label: "연락처" },
  { index: 3, key: "agree", label: "동의" },
];

const FILLED = imwebForm([
  { label: "이름", html: `<input name="fullname" value="홍길동">` },
  { label: "이메일", html: `<input name="email" value="hong@example.com">` },
  // 아임웹 전화 3분할 — 숫자만 있는 여러 칸은 붙여서 저장하는 것이 현행 동작이다.
  { label: "연락처", html: `<input value="010"><input value="1234"><input value="5678">` },
  { label: "동의", html: `<label><input type="checkbox" checked>개인정보 수집 동의</label>` },
]);

describe("아임웹 경로 — 오늘의 동작을 고정한다", () => {
  it("`.form-group` 순서대로 값을 읽어 보낸다", async () => {
    const h = mount(FILLED, buildScript(LEGACY_MAPPINGS));
    await h.submitAndLeave();

    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].data).toEqual({
      name: "홍길동",
      email: "hong@example.com",
      // 숫자만 있는 여러 칸은 구분자 없이 이어 붙인다(현행 collectData 규칙).
      phone: "01012345678",
      // 체크박스는 감싼 라벨의 텍스트로 저장된다.
      agree: "개인정보 수집 동의",
    });
  });

  /**
   * 실물에서 `.form-group` 개수(18)와 매핑 개수(8·15)가 다르다 — 입력 없는 블록이 섞여 있다.
   * 그 블록은 건너뛰고 나머지는 그대로 읽어야 한다.
   */
  it("입력이 없는 블록이 섞여 있어도 나머지를 읽는다", async () => {
    const h = mount(
      imwebForm([
        { label: "이름", html: `<input value="홍길동">` },
        { label: "구분선", html: `<p>안내 문구만 있는 블록</p>` },
        { label: "이메일", html: `<input value="hong@example.com">` },
      ]),
      buildScript([
        { index: 0, key: "name", label: "이름" },
        { index: 2, key: "email", label: "이메일" },
      ]),
    );
    await h.submitAndLeave();

    expect(h.sent[0]?.data).toEqual({ name: "홍길동", email: "hong@example.com" });
  });

  /** 값이 하나도 없으면 캡처 자체가 일어나지 않는다. */
  it("빈 폼은 전송하지 않는다", async () => {
    const h = mount(imwebForm([{ label: "이름", html: `<input value="">` }]), buildScript(LEGACY_MAPPINGS));
    await h.submitAndLeave();

    expect(h.sent).toHaveLength(0);
  });

  /** 발견(discoveredFields)의 출처 — 이 값이 바뀌면 운영자 화면의 필드 목록이 통째로 바뀐다. */
  it("필드 메타를 `.form-group` 에서 뽑아 함께 보낸다", async () => {
    const h = mount(FILLED, buildScript(LEGACY_MAPPINGS));
    await h.submitAndLeave();

    expect(h.sent[0]._fieldMeta).toEqual([
      { index: 0, label: "이름", type: "text" },
      { index: 1, label: "이메일", type: "text" },
      { index: 2, label: "연락처", type: "text" },
      { index: 3, label: "동의", type: "checkbox" },
    ]);
  });

  it("패턴 밖 페이지에서는 폼 감지가 꺼진다", async () => {
    const h = mount(FILLED, buildScript(LEGACY_MAPPINGS, ["/somewhere-else"]));
    await h.submitAndLeave();

    expect(h.sent).toHaveLength(0);
  });
});

/**
 * 대행전시(비아임웹) — 실물 마크업으로 검증한다.
 * 아래 HTML 은 edtechkorea.or.kr/fairVst2.do 에서 그대로 가져온 모양이다(2026-08-21 확인):
 * `.form-group` 이 하나도 없고 `div.field` + `label.field-label` + 안정적인 input name.
 */
describe("대행전시 경로 — 앵커로 지목해 읽는다", () => {
  const edtechForm = `<form id="frmRegist">
    <div class="field row1 fr_mod3808_in1">
      <label class="field-label main-label" for="mod3808_in1"><span>성명<i>*</i></span></label>
      <div id="i_mod3808_in1" class="input-area f_text">
        <input type="text" name="mod3808_in1" id="mod3808_in1" value="김에듀">
      </div>
    </div>
    <div class="field row1 fr_mod3808_in6">
      <label class="field-label main-label" for="mod3808_in6"><span>e-mail<i>*</i></span></label>
      <div id="i_mod3808_in6" class="input-area f_text">
        <input type="text" name="mod3808_in6" id="mod3808_in6" value="kim@example.com">
      </div>
    </div>
    <div class="field row1 fr_mod3810_in1">
      <label class="field-label main-label"><span>관람 목적<i>*</i></span></label>
      <div id="i_mod3810_in1" class="input-area f_checkbox">
        <label><input type="checkbox" name="mod3810_in1" value="Y" checked>제품 구매</label>
        <label><input type="checkbox" name="mod3810_in1" value="Y">정보 수집</label>
      </div>
    </div>
    <a href="javascript: f_regist()" class="btn1 common btn_submit" id="go"><span>확인</span></a>
  </form>`;

  const ANCHORED: CollectFieldMapping[] = [
    { index: 0, key: "name", label: "성명", matchBy: "name", matchValue: "mod3808_in1" },
    { index: 1, key: "email", label: "e-mail", matchBy: "name", matchValue: "mod3808_in6" },
    { index: 2, key: "purpose", label: "관람 목적", matchBy: "name", matchValue: "mod3810_in1" },
  ];

  it("`.form-group` 이 없어도 name 으로 찾아 읽는다", async () => {
    const h = mount(edtechForm, buildScript(ANCHORED, ["/fairVst2.do"]), "https://edtechkorea.or.kr/fairVst2.do");
    await h.submitAndLeave();

    expect(h.sent[0]?.data).toEqual({
      name: "김에듀",
      email: "kim@example.com",
      // 체크박스는 감싼 라벨 텍스트로 — 아임웹 경로와 같은 규칙이다.
      purpose: "제품 구매",
    });
  });

  it("id 앵커는 감싼 요소 안의 입력을 찾는다", async () => {
    const h = mount(
      edtechForm,
      buildScript([{ index: 0, key: "name", label: "성명", matchBy: "id", matchValue: "i_mod3808_in1" }], ["/fairVst2.do"]),
      "https://edtechkorea.or.kr/fairVst2.do",
    );
    await h.submitAndLeave();
    expect(h.sent[0]?.data).toEqual({ name: "김에듀" });
  });

  /**
   * 에듀테크는 **같은 URL 에 동의 화면과 등록 폼이 순서대로** 나온다(동의 후 POST 로 폼이 렌더).
   * 동의 화면에서 앵커가 하나도 안 풀리므로 아무것도 보내면 안 된다 —
   * 이게 없으면 1필드짜리 쓰레기 레코드가 쌓인다.
   */
  it("같은 URL 의 동의 화면에서는 아무것도 보내지 않는다", async () => {
    const agreeScreen = `<form id="frmRegist" class="agree-container">
      <div class="chkArea"><label><input type="checkbox" class="necessary" name="agree_yn">동의합니다</label></div>
      <a href="javascript: f_confirm_vst()" class="btn_submit" id="go"><span>확인</span></a>
    </form>`;
    const h = mount(agreeScreen, buildScript(ANCHORED, ["/fairVst2.do"]), "https://edtechkorea.or.kr/fairVst2.do");
    await h.submitAndLeave();

    expect(h.sent).toHaveLength(0);
  });

  /** 앵커 절반 미만만 풀리면 우리 폼이 아니다 — 부분 일치로 반쪽 레코드를 만들지 않는다. */
  it("앵커가 일부만 걸리는 페이지에서는 보내지 않는다", async () => {
    const partial = `<form><input name="mod3808_in1" value="어쩌다 같은 이름"><button id="go">확인</button></form>`;
    const h = mount(partial, buildScript(ANCHORED, ["/fairVst2.do"]), "https://edtechkorea.or.kr/fairVst2.do");
    await h.submitAndLeave();

    expect(h.sent).toHaveLength(0);
  });

  /** name 에 셀렉터 메타문자가 들어와도 깨지지 않아야 한다(querySelector 보간 금지의 이유). */
  it("name 에 대괄호·따옴표가 있어도 찾는다", async () => {
    const weird = `<form><input name='data["x"][0]' value="값"><input name="b" value="2"><button id="go">확인</button></form>`;
    const h = mount(
      weird,
      buildScript([
        { index: 0, key: "x", label: "X", matchBy: "name", matchValue: 'data["x"][0]' },
        { index: 1, key: "b", label: "B", matchBy: "name", matchValue: "b" },
      ], ["/fairVst2.do"]),
      "https://edtechkorea.or.kr/fairVst2.do",
    );
    await h.submitAndLeave();

    expect(h.sent[0]?.data).toEqual({ x: "값", b: "2" });
  });
});

describe("생성물 자체의 안전장치", () => {
  /**
   * 템플릿 리터럴 안의 백틱·`${` 는 스크립트를 끊는다 — 실제로 한 번 그렇게 깨졌다.
   * 생성물에 백틱이 남는 것 자체는 무해하다(주석 안에 설명용으로 들어간다).
   * 깨졌는지는 **파싱되는가**로 본다.
   */
  it("문법이 유효하다", () => {
    expect(() => new Function(buildScript(LEGACY_MAPPINGS))).not.toThrow();
  });

  /**
   * 값이 스크립트 본문을 깨고 나오지 못하는지 — 라벨은 운영자가 자유롭게 적는 문자열이다.
   * (생성물에 백틱이나 `${` 가 남는 것 자체는 정상이다: 주석 설명과 정규식 문자 클래스
   *  `/[.+?^${}()|[\]\\]/` 에 들어 있다. 그래서 "포함 안 함" 이 아니라 "파싱된다" 로 본다.)
   */
  it("따옴표·줄바꿈이 든 라벨이 스크립트를 깨뜨리지 않는다", () => {
    const nasty = buildScript([
      { index: 0, key: "k", label: `"); alert(1); //` },
      { index: 1, key: "k2", label: "줄\n바꿈\u2028과 </script>" },
    ]);
    expect(() => new Function(nasty)).not.toThrow();
  });
});
