"use client";

// 랜딩 상세페이지(공개) — 이 파일은 얇은 셸이다.
// 마크업·CSS·인터랙션은 전부 src/lib/landing 에 있고, 단독 페이지 / 어드민 미리보기 /
// 외부 사이트(아임웹) 임베드가 **같은 렌더러**를 쓴다(두 벌 유지로 인한 드리프트 방지).
//
// 레거시 iframe 임베드 경로는 전환 기간 동안만 유지한다:
//  - auto-height iframe 안에서는 100svh 가 문서 전체 높이가 되어 무한 성장하므로,
//    호스트가 postMessage 로 넘겨준 뷰포트 높이를 --lnd-vh 로 받아 히어로 높이를 잡는다.
//  - 호스트 DOM 직접 마운트로 완전히 넘어가면 이 브리지는 삭제한다.

import { use, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { mountLanding } from "@/lib/landing/mount";
import type { LandingWebinar } from "@/lib/landing/types";

export default function WebinarLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [webinar, setWebinar] = useState<LandingWebinar | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/webinar/${slug}/info`);
        const data = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok || !data?.webinar) {
          setError(data?.error ?? "웨비나를 찾을 수 없어요");
          return;
        }
        setWebinar(data.webinar as LandingWebinar);
      } catch {
        if (alive) setError("불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  useEffect(() => {
    if (webinar?.name) document.title = `${webinar.name} — 사전 등록`;
  }, [webinar?.name]);

  // 렌더 + 정리. StrictMode 이중 호출에도 안전하도록 destroy 는 멱등.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !webinar) return;
    const embedded = window.self !== window.top;
    const handle = mountLanding({
      mount: host,
      webinar,
      embedded,
      isPreview: new URLSearchParams(window.location.search).has("preview"),
      origin: window.location.origin,
      legacyIframe: embedded,
    });
    return () => handle.destroy();
  }, [webinar]);

  // 레거시 iframe 브리지 — 문서 높이를 부모로, 호스트 뷰포트 높이를 --lnd-vh 로.
  useEffect(() => {
    if (typeof window === "undefined" || window.self === window.top || !webinar) return;
    let raf = 0;
    const post = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        window.parent.postMessage(
          { type: "machstudio:landing-height", slug, height: document.documentElement.scrollHeight },
          "*",
        );
      });
    };
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; vh?: number; top?: number } | null;
      if (d?.type === "machstudio:host-viewport" && typeof d.vh === "number") {
        const top = typeof d.top === "number" ? d.top : 0;
        const usable = Math.max(480, Math.min(1400, Math.round(d.vh - top)));
        document.querySelector<HTMLElement>(".lnd")?.style.setProperty("--lnd-vh", `${usable}px`);
        post();
      }
    };
    const ro = new ResizeObserver(post);
    ro.observe(document.documentElement);
    window.addEventListener("message", onMsg);
    window.parent.postMessage({ type: "machstudio:landing-ready", slug }, "*");
    post();
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.removeEventListener("message", onMsg);
    };
  }, [slug, webinar]);

  if (error) {
    return (
      <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", background: "#06080d", color: "#abb5c7", fontFamily: "Pretendard, sans-serif", padding: 24, textAlign: "center" }}>
        {error}
      </div>
    );
  }

  return (
    <div ref={hostRef} style={{ minHeight: "100svh", background: "#06080d" }}>
      {!webinar && (
        <div style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#abb5c7" }} />
        </div>
      )}
    </div>
  );
}
