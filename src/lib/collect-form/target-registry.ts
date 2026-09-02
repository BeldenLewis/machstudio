/**
 * 등록 폼이 **어디에 붙을지**를 미리 예약해 두는 곳.
 *
 * ── 왜 필요한가 ───────────────────────────────────────────────────────
 * 지금까지 폼은 문서에서 `[data-mach-form]` 을 **찾아서** 붙었다. 홈페이지 섹션 안에서는
 * 그게 통하지 않는다 — 마운트 지점이 Shadow 안에 있어서 `document.querySelector` 로는
 * 보이지 않고, 보이더라도 같은 페이지의 다른 섹션과 자리를 다툰다.
 *
 * 그래서 홈페이지 런타임이 **먼저 자리를 예약하고**, 폼 스크립트를 붙일 때 그 열쇠를
 * `data-ms-form-target` 으로 넘긴다. 폼 런타임은 열쇠가 있으면 탐색을 건너뛰고 그 자리에
 * 바로 붙는다. 열쇠가 없으면 지금까지의 탐색 경로를 **그대로** 탄다.
 *
 * ── 왜 window 에 매다나 ───────────────────────────────────────────────
 * 홈페이지 런타임과 폼 런타임은 **따로 번들된 IIFE** 다. 모듈 지역 Map 은 서로 보이지
 * 않는다 — 예약해 둔 자리를 폼 쪽에서 못 찾는다. 창이 둘이 공유하는 유일한 공간이다.
 */

export const FORM_TARGET_REGISTRY_KEY = "__MACH_FORM_TARGETS_V1__";

/**
 * 어떤 성격의 마운트인가.
 *
 * `FormBootConfig.view`(form|check)와 **다른 축**이다. view 는 "무엇을 그리나",
 * mode 는 "부작용을 내도 되나" 다. 미리보기 두 종류를 나눠 두는 이유는 화면 문구가
 * 다르기 때문이고, 부작용 차단은 둘 다 같다.
 */
export type FormMountMode = "live" | "preview-draft" | "preview-published";

export function isPreviewMode(mode: FormMountMode): boolean {
  return mode !== "live";
}

/**
 * 화면 위에 **떠야 하는 것**(동의 전문 팝업)을 놓을 빌린 자리.
 *
 * 예약한 쪽이 준다 — 폼은 이 자리가 어디서 왔는지 모른다. 엑스포는
 * `acquireExpoPortal()` 의 임대를 그대로 넘기고(구조가 이미 이 모양이다), 단독 `/f` 와
 * 아임웹 직접 임베드는 아무것도 안 넘겨 지금처럼 `document.body` 로 간다.
 */
export interface FormOverlaySlot {
  /** 이미 화면을 덮게 배치된 레이어. 여기에 붙인다. */
  readonly layer: HTMLElement;
  /** 그 자리에 스타일이 닿는 루트. */
  readonly root: Document | ShadowRoot;
  release(): void;
}

/**
 * 자리를 하나 빌린다. 못 빌리면 null — 폼은 문서 경로로 떨어진다.
 * `onLost` 는 자리가 사라졌을 때(파트너가 body 를 갈아엎었다) 폼이 자기 정리를 하도록.
 */
export type FormOverlayOpener = (onLost: () => void) => FormOverlaySlot | null;

export interface FormTargetRecord {
  /** 폼 DOM 이 들어갈 자리. Shadow 안일 수 있다. */
  container: HTMLElement;
  /** 스타일을 넣을 루트. Shadow 안이면 그 ShadowRoot 다. */
  styleRoot: Document | ShadowRoot;
  mode: FormMountMode;
  /** 예약한 쪽이 정리되면 끊는다 — 폼이 죽은 자리에 붙지 않게. */
  disposeSignal?: AbortSignal;
  /**
   * 전문 팝업을 놓을 자리. **영원히 선택 필드**이고 레지스트리 키를 올리지 않는다 —
   * 두 런타임은 따로 배포·따로 캐시되므로 구/신 혼재가 정상 상태다. 옛 폼 런타임은
   * 이 필드를 모른 채 `document.body` 로 떨어진다(=오늘 동작).
   */
  overlay?: FormOverlayOpener;
}

type Registry = Record<string, FormTargetRecord>;
type RegistryHost = { [FORM_TARGET_REGISTRY_KEY]?: Registry };

function registry(host?: RegistryHost): Registry {
  const target = host ?? (globalThis as unknown as RegistryHost);
  return (target[FORM_TARGET_REGISTRY_KEY] = target[FORM_TARGET_REGISTRY_KEY] ?? {});
}

/**
 * 열쇠. 같은 소스를 한 페이지에 두 번 놓을 수 있으므로(섹션 두 개, 또는 폼 + 모달)
 * `instanceKey` 까지 넣어야 서로의 자리를 뺏지 않는다.
 */
export function formTargetKey(input: {
  sourceId: string;
  view: "form" | "check";
  mode: FormMountMode;
  instanceKey: string;
}): string {
  return `${input.sourceId}:${input.view}:${input.mode}:${input.instanceKey}`;
}

export function registerFormTarget(key: string, record: FormTargetRecord, host?: RegistryHost): void {
  registry(host)[key] = record;
}

export interface FormTargetLease {
  /** 이 임대가 아직 현재 예약일 때만 놓고, 살아 있는 이전 예약은 복원한다. */
  release(): void;
}

/**
 * staged remount용 소유권 있는 예약.
 *
 * 새 shell은 이전 shell이 살아 있는 동안 같은 안정 key를 먼저 예약한다. 실패하면 이전
 * 예약을 돌려놓고, 성공 뒤 이전 shell이 정리될 때는 그 정리가 새 예약을 지우지 못해야
 * 한다. 단순 `register`/`unregister` 쌍으로는 둘을 구분할 수 없어 record identity를 쓴다.
 */
export function leaseFormTarget(
  key: string,
  record: FormTargetRecord,
  host?: RegistryHost,
): FormTargetLease {
  const reg = registry(host);
  const previous = reg[key] ?? null;
  reg[key] = record;
  let released = false;

  return {
    release() {
      if (released) return;
      released = true;
      // 이미 다음 소유자가 왔으면 이 임대는 그 예약을 만지지 않는다.
      if (reg[key] !== record) return;
      const previousAlive = previous
        && previous.disposeSignal?.aborted !== true
        && previous.container.isConnected;
      if (previousAlive) reg[key] = previous;
      else delete reg[key];
    },
  };
}

/**
 * 예약을 찾는다. **죽은 자리는 없는 것으로 답한다** — 정리된 섹션에 폼을 붙이면
 * 보이지 않는 곳에 폼이 살아 남아 제출까지 받는다.
 */
export function getFormTarget(key: string, host?: RegistryHost): FormTargetRecord | null {
  const reg = registry(host);
  const record = reg[key];
  if (!record) return null;
  const gone = record.disposeSignal?.aborted === true || record.container.isConnected === false;
  if (gone) {
    delete reg[key];
    return null;
  }
  return record;
}

export function unregisterFormTarget(key: string, host?: RegistryHost): void {
  delete registry(host)[key];
}

/** 이전 런타임 정리가 같은 key의 후속 staged 예약을 지우지 못하게 한다. */
export function unregisterOwnedFormTarget(
  key: string,
  record: FormTargetRecord,
  host?: RegistryHost,
): void {
  const reg = registry(host);
  if (reg[key] === record) delete reg[key];
}

/** 테스트·재진입 검증용. */
export function resetFormTargets(host?: RegistryHost): void {
  const target = host ?? (globalThis as unknown as RegistryHost);
  delete target[FORM_TARGET_REGISTRY_KEY];
}
