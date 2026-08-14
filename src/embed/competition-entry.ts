/**
 * 대회 임베드 런타임 — 아임웹 코드블럭에 한 줄로 붙는다.
 *
 *   <script async src="https://…/c/{competitionId}"></script>
 *   <div data-mach-competition></div>
 *
 * 공고 페이지를 그리고, 신청 버튼을 누르면 팝업으로 신청 폼을 띄운다.
 * 렌더는 어드민 미리보기와 **같은 함수**(competition-render)를 쓴다.
 *
 * 전체 try/catch — 실패해도 호스트 페이지를 건드리지 않고 조용히 끝낸다.
 */
import type { CompetitionConfig } from "@/lib/competition-config";
import {
  buildCompetitionCss,
  escapeHtml,
  renderFormModalHtml,
  renderNoticeHtml,
  type CompetitionTheme,
} from "@/lib/competition-render";
import type { CompetitionPhase } from "@/lib/competition-status";

interface BootPayload {
  competitionId: string;
  competitionName: string;
  origin: string;
  phase: CompetitionPhase;
  canApply: boolean;
  theme: CompetitionTheme;
  config: CompetitionConfig;
  /** 미리보기 모드 — 제출·업로드를 실제로 하지 않는다. */
  preview?: boolean;
}

const STYLE_ID = "mc-styles";

function warn(message: string, error?: unknown) {
  try {
    if (typeof console !== "undefined" && console.warn) console.warn("[mach competition] " + message, error ?? "");
  } catch {
    /* 로깅 실패는 무시 */
  }
}

export function boot(payload: BootPayload) {
  try {
    render(payload);
  } catch (error) {
    warn("render failed", error);
  }
}

function injectStyles(theme: CompetitionTheme) {
  const css = buildCompetitionCss(theme);
  const existing = document.getElementById(STYLE_ID);
  if (existing) {
    existing.textContent = css;
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = css;
  document.head.appendChild(style);
}

function findMount(): HTMLElement | null {
  const marked = document.querySelector<HTMLElement>("[data-mach-competition]");
  if (marked) return marked;
  // 마운트 div 를 빠뜨리는 실수가 잦다 — 스크립트 태그 자리에 직접 만든다.
  const current = document.currentScript as HTMLScriptElement | null;
  const scripts = current ? [current] : Array.from(document.querySelectorAll("script[src*='/c/']"));
  const script = scripts[scripts.length - 1] as HTMLScriptElement | undefined;
  if (!script || !script.parentNode) return null;
  const host = document.createElement("div");
  host.setAttribute("data-mach-competition", "");
  script.parentNode.insertBefore(host, script.nextSibling);
  return host;
}

function render(payload: BootPayload) {
  const mount = findMount();
  if (!mount) {
    warn("마운트 지점을 찾지 못했어요 — <div data-mach-competition></div> 를 넣어주세요.");
    return;
  }
  injectStyles(payload.theme);

  mount.innerHTML = renderNoticeHtml({
    config: payload.config,
    competitionName: payload.competitionName,
    phase: payload.phase,
    canApply: payload.canApply,
    preview: payload.preview,
  });

  const applyBtn = mount.querySelector<HTMLButtonElement>("[data-mc-apply]");
  if (applyBtn) applyBtn.addEventListener("click", () => openForm(payload));
}

/* ── 신청 폼 팝업 ───────────────────────────────────────────── */

function openForm(payload: BootPayload) {
  const existing = document.getElementById("mc-form-overlay");
  if (existing) { existing.style.display = "flex"; return; }

  const overlay = document.createElement("div");
  overlay.id = "mc-form-overlay";
  overlay.className = "mc mc-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");

  const form = document.createElement("form");
  form.className = "mc-modal";
  form.noValidate = true;
  form.innerHTML = renderFormModalHtml(payload.config);

  overlay.appendChild(form);
  document.body.appendChild(overlay);

  const close = () => { overlay.style.display = "none"; };
  form.querySelector(".mc-modal-close")?.addEventListener("click", close);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  document.addEventListener("keydown", function onKey(event) {
    if (event.key !== "Escape") return;
    if (!document.body.contains(overlay)) { document.removeEventListener("keydown", onKey); return; }
    close();
  });

  bindConsentPopups(form, payload);
  const uploaded = bindImageInputs(form, payload);
  bindSubmit(form, payload, uploaded, close);

  form.querySelector<HTMLInputElement>("input,select,textarea")?.focus();
}

/** 동의 문구 클릭 → 전문 팝업. 웨비나 로더의 openTerms 와 같은 동작. */
function bindConsentPopups(form: HTMLFormElement, payload: BootPayload) {
  form.querySelectorAll<HTMLElement>("[data-mc-terms]").forEach((node) => {
    node.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const kind = node.getAttribute("data-mc-terms");
      const body = kind === "privacy" ? payload.config.form.privacyBody : payload.config.form.marketingBody;
      if (!body) return;
      const checkbox = node.parentElement?.querySelector<HTMLInputElement>("input[type=checkbox]");

      const ov = document.createElement("div");
      ov.className = "mc mc-overlay";
      ov.style.zIndex = "999960";
      ov.innerHTML = `<div class="mc-modal" style="max-width:520px">
        <div class="mc-modal-head"><h3 class="mc-modal-title">${escapeHtml(node.textContent || "약관")}</h3></div>
        <div class="mc-modal-body"><p class="mc-text">${escapeHtml(body)}</p></div>
        <div style="display:flex;gap:8px;padding:14px 18px;border-top:1px solid rgba(120,120,128,.18)">
          <button type="button" class="mc-btn" style="flex:1;background:rgba(120,120,128,.16)!important;color:inherit!important;-webkit-text-fill-color:currentColor!important" data-mc-close>닫기</button>
          <button type="button" class="mc-btn" style="flex:1" data-mc-agree>동의합니다</button>
        </div></div>`;
      document.body.appendChild(ov);
      const remove = () => ov.remove();
      ov.querySelector("[data-mc-close]")?.addEventListener("click", remove);
      ov.querySelector("[data-mc-agree]")?.addEventListener("click", () => {
        if (checkbox) checkbox.checked = true;
        remove();
      });
      ov.addEventListener("click", (e) => { if (e.target === ov) remove(); });
    });
  });
}

/**
 * 사진 업로드 — **1장당 요청 1번**. 여러 장을 한 요청에 담으면 요청 본문 상한을 넘는다.
 * 미리보기에서는 실제로 올리지 않는다(부작용 차단).
 */
function bindImageInputs(form: HTMLFormElement, payload: BootPayload): Map<string, string[]> {
  const uploaded = new Map<string, string[]>();

  form.querySelectorAll<HTMLInputElement>("[data-mc-image]").forEach((input) => {
    const key = input.getAttribute("data-mc-key") ?? "";
    const max = Number(input.getAttribute("data-mc-max") || 3);
    const gallery = input.parentElement?.querySelector<HTMLElement>("[data-mc-files]");
    uploaded.set(key, []);

    input.addEventListener("change", async () => {
      const files = Array.from(input.files ?? []);
      input.value = "";
      const current = uploaded.get(key) ?? [];

      for (const file of files) {
        if (current.length >= max) { alert(`이미지는 최대 ${max}장까지 올릴 수 있어요.`); break; }
        // 상한을 넘는 파일은 요청을 보내기 전에 거른다 — 서버까지 갔다가 실패하면 기다린 시간이 아깝다.
        if (file.size > 4 * 1024 * 1024) { alert(`'${file.name}' 은 4MB를 넘어요.`); continue; }

        if (payload.preview) {
          current.push(URL.createObjectURL(file));
          uploaded.set(key, current);
          renderThumbs(gallery, key, uploaded);
          continue;
        }

        try {
          const body = new FormData();
          body.append("file", file);
          const res = await fetch(`${payload.origin}/api/competitions/${payload.competitionId}/entry-image`, { method: "POST", body });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) { alert(data.error || "업로드에 실패했어요."); continue; }
          current.push(data.url);
          uploaded.set(key, current);
          renderThumbs(gallery, key, uploaded);
        } catch {
          alert("업로드 중 네트워크 오류가 발생했어요.");
        }
      }
    });
  });

  return uploaded;
}

function renderThumbs(gallery: HTMLElement | null | undefined, key: string, uploaded: Map<string, string[]>) {
  if (!gallery) return;
  const urls = uploaded.get(key) ?? [];
  gallery.innerHTML = urls
    .map((url, i) => `<div class="mc-thumb"><img src="${escapeHtml(url)}" alt=""><button type="button" data-i="${i}">&times;</button></div>`)
    .join("");
  gallery.querySelectorAll<HTMLButtonElement>("button[data-i]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.getAttribute("data-i"));
      const next = (uploaded.get(key) ?? []).filter((_, i) => i !== index);
      uploaded.set(key, next);
      renderThumbs(gallery, key, uploaded);
    });
  });
}

function bindSubmit(
  form: HTMLFormElement,
  payload: BootPayload,
  uploaded: Map<string, string[]>,
  close: () => void,
) {
  const msg = form.querySelector<HTMLElement>("[data-mc-msg]");
  const submitBtn = form.querySelector<HTMLButtonElement>("[data-mc-submit]");

  const show = (kind: "error" | "success", text: string) => {
    if (!msg) return;
    msg.className = `mc-msg mc-msg-${kind}`;
    msg.textContent = text;
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!submitBtn || submitBtn.disabled) return;

    const privacy = form.querySelector<HTMLInputElement>("[data-mc-privacy]");
    if (privacy && !privacy.checked) { show("error", "개인정보 수집 및 이용에 동의해주세요."); return; }

    const data: Record<string, string> = {};
    for (const field of payload.config.form.fields) {
      if (!field.enabled) continue;
      if (field.type === "image") continue;
      const node = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        `[data-mc-key="${CSS.escape(field.key)}"]`,
      );
      if (!node) continue;
      let value = "";
      if (field.type === "checkbox") {
        value = (node as HTMLInputElement).checked ? "동의" : "";
      } else if (field.type === "multiple" && node instanceof HTMLSelectElement) {
        // 복수 선택은 ", " 로 합쳐 저장한다 — 웨비나 등록 폼과 같은 계약.
        value = Array.from(node.selectedOptions).map((o) => o.value).join(", ");
      } else {
        value = String(node.value ?? "").trim();
      }
      if (field.required && !value) { show("error", `${field.label} 항목을 입력해주세요.`); return; }
      if (value) data[field.key] = value;
    }

    const media = Array.from(uploaded.entries()).flatMap(([, urls]) =>
      urls.map((url, i) => ({ kind: "image" as const, url, sortOrder: i })),
    );

    if (payload.preview) {
      show("success", "미리보기라 저장되지 않았어요. 실제 배포 후에는 정상 접수됩니다.");
      return;
    }

    submitBtn.disabled = true;
    const originalLabel = submitBtn.textContent;
    submitBtn.textContent = "제출 중...";
    try {
      const res = await fetch(`${payload.origin}/api/competitions/${payload.competitionId}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data,
          media,
          agreePrivacy: true,
          agreeMarketing: form.querySelector<HTMLInputElement>("[data-mc-marketing]")?.checked ?? false,
          _hp: form.querySelector<HTMLInputElement>("[data-mc-hp]")?.value ?? "",
        }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        show("error", result.error || "접수에 실패했어요. 잠시 후 다시 시도해주세요.");
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
        return;
      }
      show("success", `${result.message || "신청이 접수되었어요."} (참가번호 ${result.entryNo})`);
      form.querySelectorAll("input,select,textarea,button").forEach((node) => {
        (node as HTMLInputElement).disabled = true;
      });
      setTimeout(close, 2500);
    } catch {
      show("error", "네트워크 오류가 발생했어요.");
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });
}
