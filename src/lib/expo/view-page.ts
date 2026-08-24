/**
 * 섹션 목록을 실제 노드로 조립한다 — **수명이 있는 둘까지 포함해서.**
 *
 * 정적인 네 가지는 `view-sections.ts` 가 그리고 끝난다. 등록 폼과 직접 넣은 코드는
 * 스크립트를 붙이거나 iframe 을 만들고 **정리할 것이 남는다**. 그래서 이 파일은
 * 노드만 돌려주지 않고 `dispose()` 를 함께 돌려준다.
 *
 * ── 정리를 빠뜨리면 무엇이 남나 ───────────────────────────────────────
 * 폼 예약이 남으면 날아오던 `/f/{sourceId}` 스크립트가 떼어진 자리를 보고 문서 탐색
 * 경로로 떨어져 **다른 섹션이나 라이브 등록 자리에 폼을 하나 더** 만든다(중복 제출).
 * 모달이 남으면 파트너의 body 가 `position:fixed` 로 굳어 **그들 사이트가 스크롤되지
 * 않는다.** 둘 다 우리 화면이 아니라 남의 화면에서 벌어진다.
 */
import { h } from "@/lib/dom/h";
import { attachExpoForm, type ExpoFormBridgeHandle } from "@/lib/expo/form-bridge";
import { mountExpoCustomCode, type ExpoCustomCodeHandle } from "@/lib/expo/custom-code";
import { openExpoModal, type ExpoModalHandle } from "@/lib/expo/overlay";
import { renderStaticSection, sectionShell, type PayloadSection } from "@/lib/expo/view-sections";
import type { FormMountMode } from "@/lib/collect-form/target-registry";

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export interface RenderSectionsContext {
  /** 폼 스크립트·서체를 받아 올 절대 주소. */
  origin: string;
  /** 부작용을 내도 되는가. 미리보기면 저장·추적이 전부 꺼진다. */
  mode: FormMountMode;
  /** 포털이 자기 레이어에 얹을 색. */
  themeVars: Record<string, string>;
  /** 이 임베드의 ShadowRoot — 폼이 여기에 자기 스타일을 넣는다. */
  styleRoot: ShadowRoot;
  /**
   * 폼 인스턴스 열쇠의 접두사. 같은 소스를 한 페이지에 두 번 놓을 수 있으므로
   * 페이지·섹션을 구분하는 안정된 값이어야 한다.
   */
  instancePrefix: string;
  /** 붙여넣은 코드를 실행해도 되는가. 라이브는 항상 true. */
  allowCustomCode: boolean;
  /** 미리보기 자리표의 "실행" 버튼. */
  onRequestCustomCodeRun?: () => void;
  /** 모달을 닫을 때 되돌릴 포커스가 아무것도 없을 때의 마지막 후보. */
  fallbackFocus?: HTMLElement | null;
  doc?: Document;
}

export interface RenderedSections {
  nodes: HTMLElement[];
  /**
   * 노드를 ShadowRoot 안에 **넣은 뒤에** 부른다.
   *
   * 폼 예약(`attachExpoForm`)은 붙어 있는 자리에만 걸 수 있다 — `getFormTarget` 은
   * 컨테이너가 떼어져 있으면 그 예약을 지우고, 그러면 폼이 문서 탐색 경로로 떨어져
   * 엉뚱한 자리에 앉는다. 그래서 조립과 예약을 두 단계로 나눈다.
   */
  attach(): void;
  dispose(): void;
}

/** 등록 폼 섹션의 공통 앞부분 — 제목과 안내. */
function formIntro(section: PayloadSection) {
  const heading = str(section.content.heading);
  const note = str(section.content.note);
  return {
    heading,
    nodes: [
      heading ? h("h2", { class: "msx-heading" }, heading) : null,
      // 운영자가 쓴 안내다 — 줄바꿈을 보존한다.
      note ? h("div", { class: "msx-form-note msx-prose" }, note) : null,
    ],
  };
}

export function renderExpoSections(
  sections: readonly PayloadSection[],
  ctx: RenderSectionsContext,
): RenderedSections {
  const nodes: HTMLElement[] = [];
  /** 붙은 뒤에 할 일 — 폼 예약이 여기 모인다. */
  const deferred: Array<() => void> = [];

  const bridges: ExpoFormBridgeHandle[] = [];
  const codes: ExpoCustomCodeHandle[] = [];
  let openModal: ExpoModalHandle | null = null;

  for (const section of sections) {
    if (section.type === "register-form") {
      const sourceId = str(section.content.sourceRef);
      // 소스가 안 붙어 있으면 그릴 것이 없다 — 빈 껍데기를 내보내지 않는다.
      if (!sourceId) continue;

      const intro = formIntro(section);
      const variant = section.variant === "cta" ? "cta" : "inline";

      if (variant === "inline") {
        const slot = h("div", { class: "msx-form-slot" });
        const el = sectionShell(
          section,
          ...intro.nodes,
          h("div", { class: "msx-form", "data-variant": "inline" }, slot),
        );
        nodes.push(el);
        deferred.push(() => {
          const bridge = attachExpoForm({
            sourceId, view: "form", mode: ctx.mode,
            container: slot, styleRoot: ctx.styleRoot, origin: ctx.origin,
            instanceKey: `${ctx.instancePrefix}:${section.sid}`,
            doc: ctx.doc,
          });
          if (bridge) bridges.push(bridge);
        });
        continue;
      }

      // 요약 + 버튼 — 폼은 body 직계 포털에서만 연다.
      const button = h("button", { class: "msx-btn", type: "button" }, "사전등록 신청하기");
      const el = sectionShell(
        section,
        ...intro.nodes,
        h("div", { class: "msx-form", "data-variant": "cta" }, button),
      );
      button.addEventListener("click", () => {
        // 이미 열려 있으면 두 번 열지 않는다 — 스크롤 잠금이 두 겹 쌓인다.
        if (openModal) return;
        let bridge: ExpoFormBridgeHandle | null = null;
        const modal = openExpoModal({
          themeVars: ctx.themeVars,
          sid: section.sid,
          label: intro.heading || "사전등록",
          fallbackFocus: ctx.fallbackFocus ?? button,
          doc: ctx.doc,
          // DOM 이 지워지기 **전에** 예약을 끊는다.
          onClose: () => {
            bridge?.destroy();
            bridge = null;
            openModal = null;
          },
        });
        if (!modal) return;
        openModal = modal;
        bridge = attachExpoForm({
          sourceId, view: "form", mode: ctx.mode,
          container: modal.body, styleRoot: modal.styleRoot, origin: ctx.origin,
          // 같은 소스의 인라인 폼과 **다른 열쇠**여야 서로의 자리를 뺏지 않는다.
          instanceKey: `${ctx.instancePrefix}:${section.sid}:modal`,
          doc: ctx.doc,
        });
      });
      nodes.push(el);
      continue;
    }

    if (section.type === "custom-code") {
      const code = typeof section.content.code === "string" ? section.content.code : "";
      const handle = mountExpoCustomCode({
        code,
        allowRun: ctx.allowCustomCode,
        onRequestRun: ctx.onRequestCustomCodeRun,
        doc: ctx.doc,
      });
      if (!handle) continue;
      codes.push(handle);
      const heading = str(section.content.heading);
      nodes.push(sectionShell(
        section,
        heading ? h("h2", { class: "msx-heading" }, heading) : null,
        h("div", { class: "msx-code" }, handle.el),
      ));
      continue;
    }

    const el = renderStaticSection(section);
    if (el) nodes.push(el);
  }

  return {
    nodes,

    attach() {
      for (const fn of deferred.splice(0)) {
        try {
          fn();
        } catch {
          // 한 섹션의 폼이 안 붙어도 나머지 구획은 보여야 한다.
        }
      }
    },

    dispose() {
      // 모달이 먼저다 — 안 닫으면 파트너 사이트가 스크롤되지 않는다.
      openModal?.close();
      openModal = null;
      for (const bridge of bridges.splice(0)) bridge.destroy();
      for (const code of codes.splice(0)) code.destroy();
      deferred.length = 0;
    },
  };
}
