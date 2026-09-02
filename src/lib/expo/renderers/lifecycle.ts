/**
 * 렌더러가 결과를 반환하기 전에 만든 listener·timer의 수명 경계.
 * 조립 중 예외와 정상 dispose가 같은 idempotent 정리 경로를 사용한다.
 */
export interface RendererLifecycle {
  readonly signal: AbortSignal;
  addCleanup(cleanup: () => void): void;
  dispose(): void;
  guard<T>(build: () => T): T;
}

export function createRendererLifecycle(doc: Document): RendererLifecycle {
  const Controller = doc.defaultView?.AbortController ?? AbortController;
  const controller = new Controller();
  const cleanups: Array<() => void> = [() => controller.abort()];
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const cleanup of cleanups.splice(0).reverse()) {
      try { cleanup(); } catch { /* 한 정리 실패가 나머지 listener 해제를 막지 않는다. */ }
    }
  };

  return {
    signal: controller.signal,
    addCleanup(cleanup) {
      if (disposed) {
        try { cleanup(); } catch { /* 이미 닫힌 경계에는 자원을 남기지 않는다. */ }
        return;
      }
      cleanups.push(cleanup);
    },
    dispose,
    guard<T>(build: () => T): T {
      try {
        return build();
      } catch (error) {
        dispose();
        throw error;
      }
    },
  };
}
