/**
 * 등록 확인(Find My QR) 마운트 — 설계 §10.
 *
 * 아임웹의 별도 코드블럭(`Registration Check` 탭)에 붙고, 미리보기(/p/{token}/check)도
 * 같은 함수를 탄다. 등록 폼과 **같은 스타일·같은 DOM 빌더**를 쓴다 — 두 화면이 나란히
 * 놓이는데 폰트와 모서리가 다르면 그게 곧 "다른 서비스" 로 보인다.
 *
 * 이메일 연동 전에는 등록자가 QR 을 되찾는 **유일한 경로**다(§2). 그래서 이 화면이
 * 조용히 고장 나면 현장 문의가 그대로 늘어난다.
 */
import { h, clearNode } from "@/lib/dom/h";
import { COLLECT_FORM_CSS } from "./css";
import type { CollectFormConfig } from "@/lib/collect-form-config";

const STYLE_ID = "msf-css";

const COPY = {
  title: "Find my QR",
  desc: "Enter what you registered with.",
  email: "Email",
  phone: "Phone",
  submit: "Find my registration",
  searching: "Searching…",
  /** 못 찾았을 때는 **이 문구 하나로만** 끝낸다(§10.2) — 이유를 나누면 열거 힌트가 된다. */
  notFound: "We couldn't find a registration with that information.",
  networkError: "Something went wrong. Please try again.",
  tooMany: "Too many attempts. Please try again in a few minutes.",
  regNoLabel: "Show this at the venue",
  noQr: "Your registration was found. We'll email your ticket again.",
  needBoth: "Enter both your email and phone number.",
  ticketLink: "Open my ticket page →",
  previewFlag: "Preview — nothing is saved",
} as const;

export interface MountLookupOptions {
  mount: HTMLElement;
  config: CollectFormConfig;
  origin: string;
  sourceId: string;
  /** 미리보기 — 조회를 실제로 보내지 않고 표본 결과를 그린다. */
  preview?: boolean;
}

export interface LookupHandle {
  destroy(): void;
}

/** 미리보기용 표본. 체크digit 이 일부러 틀린 값이라 현장 조회에는 걸리지 않는다. */
const PREVIEW_REG_NO = "0000000000000";

function ensureStyles(): void {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = COLLECT_FORM_CSS;
  document.head.appendChild(style);
}

type DataLayerWindow = Window & { dataLayer?: unknown[] };
function track(preview: boolean, event: string): void {
  if (preview) return;
  try {
    const w = window as DataLayerWindow;
    w.dataLayer = w.dataLayer ?? [];
    w.dataLayer.push({ event });
  } catch {
    /* 호스트를 깨뜨리지 않는다 */
  }
}

export function mountCollectLookup(opts: MountLookupOptions): LookupHandle {
  ensureStyles();
  const { config, mount } = opts;
  const preview = opts.preview === true;

  const useEmail = config.lookup.fields.includes("email");
  const usePhone = config.lookup.fields.includes("phone");
  const needBoth = config.lookup.logic === "and";

  const root = h("div", { class: "msf" });
  const stack = h("div", { class: "msf-lookup" });
  root.appendChild(stack);

  let busy = false;
  let destroyed = false;

  const idFor = (k: string) => `msf-lk-${opts.sourceId}-${k}`;

  const emailInput = h("input", {
    class: "msf-input", type: "email", id: idFor("email"),
    autocomplete: "email", placeholder: "you@example.com",
  }) as HTMLInputElement;
  const phoneInput = h("input", {
    class: "msf-input", type: "tel", id: idFor("phone"),
    autocomplete: "tel", placeholder: config.validation.defaultCountry === "US" ? "2025550147" : "",
  }) as HTMLInputElement;
  // 등록 폼과 같은 규칙 — 하이픈·괄호는 타이핑 즉시 지운다(AGENTS.md "입력은 소스에서 정규화").
  phoneInput.inputMode = "tel";
  phoneInput.addEventListener("input", () => {
    const digits = phoneInput.value.replace(/[^0-9+]/g, "");
    if (phoneInput.value !== digits) phoneInput.value = digits;
  });

  const banner = h("div", { class: "msf-banner", role: "alert" });
  banner.style.display = "none";
  const resultHost = h("div", null);
  const submitBtn = h("button", { type: "button", class: "msf-submit" }, COPY.submit) as HTMLButtonElement;

  function showBanner(text: string): void {
    banner.setAttribute("data-tone", "warn");
    banner.textContent = text;
    banner.style.display = "";
  }
  function hideBanner(): void {
    banner.style.display = "none";
  }

  function field(label: string, input: HTMLInputElement): HTMLElement {
    return h("div", { class: "msf-field" },
      h("label", { class: "msf-label", for: input.id }, label),
      input,
    );
  }

  function renderResult(view: { registrationNo: string; name: string; visitorType: string; showQr: boolean }): void {
    clearNode(resultHost);
    const card = h("div", { class: "msf-found" });
    if (view.name) card.appendChild(h("div", { class: "msf-found-name" }, view.name));
    if (view.visitorType) card.appendChild(h("div", { class: "msf-found-type" }, view.visitorType));

    if (view.showQr) {
      /**
       * QR 은 서버에서 그린다 — §9.2 규칙(EC Q·여백 4모듈·불투명 흰 배경)을 완료 화면·
       * 티켓·이메일과 **같은 한 곳**에서 지키기 위해서다.
       */
      card.appendChild(
        h("div", { class: "msf-qr" },
          h("img", {
            src: `${opts.origin}/api/collect/qr/${encodeURIComponent(view.registrationNo)}`,
            alt: `Registration QR for ${view.registrationNo}`,
            width: "200", height: "200",
          }),
        ),
      );
      card.appendChild(h("div", { class: "msf-regno" }, view.registrationNo));
      card.appendChild(h("div", { class: "msf-regno-label" }, COPY.regNoLabel));
      if (!preview) {
        card.appendChild(
          h("a", {
            class: "msf-more",
            href: `${opts.origin}/t/${encodeURIComponent(view.registrationNo)}`,
            target: "_blank", rel: "noopener noreferrer",
            style: { marginTop: "10px", display: "inline-block" },
          }, COPY.ticketLink),
        );
      }
    } else {
      // showQr 이 꺼져 있으면 번호도 보여주지 않는다 — 그 설정의 의도가 "화면에 티켓을
      // 띄우지 않는다" 이기 때문이다(§10.1).
      card.appendChild(h("div", { class: "msf-state-body" }, COPY.noQr));
    }
    resultHost.appendChild(card);
  }

  async function search(): Promise<void> {
    if (busy) return;
    hideBanner();
    clearNode(resultHost);

    const email = useEmail ? emailInput.value.trim() : "";
    const phone = usePhone ? phoneInput.value.trim() : "";
    if (!email && !phone) return;
    if (needBoth && !(email && phone)) {
      showBanner(COPY.needBoth);
      return;
    }

    track(preview, "ms_lookup_request");

    // 미리보기는 조회를 보내지 않는다 — 표본으로 화면만 확인한다(부작용 차단, §16.1).
    if (preview) {
      renderResult({ registrationNo: PREVIEW_REG_NO, name: "Jane Doe", visitorType: "Buyer", showQr: config.lookup.showQr });
      return;
    }

    busy = true;
    submitBtn.disabled = true;
    submitBtn.textContent = COPY.searching;
    try {
      const res = await fetch(`${opts.origin}/api/collect/${encodeURIComponent(opts.sourceId)}/lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({ email, phone }),
      });
      if (res.status === 429) { showBanner(COPY.tooMany); return; }
      const data = (await res.json().catch(() => null)) as
        | { found?: boolean; registrationNo?: string; name?: string; visitorType?: string; showQr?: boolean }
        | null;
      if (!res.ok || !data) { showBanner(COPY.networkError); return; }
      if (!data.found || !data.registrationNo) { showBanner(COPY.notFound); return; }
      renderResult({
        registrationNo: data.registrationNo,
        name: data.name ?? "",
        visitorType: data.visitorType ?? "",
        showQr: data.showQr !== false,
      });
    } catch {
      if (!destroyed) showBanner(COPY.networkError);
    } finally {
      busy = false;
      submitBtn.disabled = false;
      submitBtn.textContent = COPY.submit;
    }
  }

  submitBtn.addEventListener("click", () => { void search(); });
  // Enter 로도 찾는다 — 입력칸이 한둘뿐인 화면에서 버튼까지 가는 건 불필요한 단계다.
  for (const input of [emailInput, phoneInput]) {
    input.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") { e.preventDefault(); void search(); }
    });
  }

  function render(): void {
    clearNode(stack);
    if (preview) stack.appendChild(h("div", { class: "msf-preview-flag" }, COPY.previewFlag));

    // 운영자가 꺼 두면 아무것도 그리지 않는다 — 빈 껍데기를 시청자에게 노출하지 않는다
    // (AGENTS.md §4 "config 토글 ON + 실제 데이터 있음" 이중 게이트).
    if (!config.lookup.enabled) return;

    stack.appendChild(h("div", { class: "msf-state-title" }, COPY.title));
    stack.appendChild(h("div", { class: "msf-hint" }, needBoth ? COPY.needBoth : COPY.desc));
    if (useEmail) stack.appendChild(field(COPY.email, emailInput));
    if (usePhone) stack.appendChild(field(COPY.phone, phoneInput));
    stack.appendChild(submitBtn);
    stack.appendChild(banner);
    stack.appendChild(resultHost);
  }

  clearNode(mount);
  mount.appendChild(root);
  render();

  return {
    destroy() {
      destroyed = true;
      if (root.parentNode) root.parentNode.removeChild(root);
    },
  };
}
