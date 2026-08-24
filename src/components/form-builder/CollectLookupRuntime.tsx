"use client";

/**
 * 등록 확인 런타임을 React 화면에 올리는 **얇은 껍데기**.
 * 그리는 일은 전부 `mountCollectLookup` 이 한다 — 임베드가 파트너 사이트에서 돌리는 그 함수다.
 */
import { useEffect, useRef } from "react";
import { mountCollectLookup } from "@/lib/collect-form/lookup-mount";
import type { CollectFormConfig } from "@/lib/collect-form-config";

export function CollectLookupRuntime({
  config,
  sourceId,
  preview = true,
}: {
  config: CollectFormConfig;
  sourceId: string;
  /** 기본이 미리보기다 — 이 컴포넌트가 쓰이는 자리는 조회하면 안 되는 화면이다. */
  preview?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const handle = mountCollectLookup({ mount: host, config, origin: "", sourceId, preview });
    return () => handle.destroy();
  }, [config, sourceId, preview]);

  return <div ref={hostRef} />;
}
