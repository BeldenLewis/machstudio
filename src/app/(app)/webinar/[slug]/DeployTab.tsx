"use client";

// 배포 탭 — 아임웹 부착의 단일 창구.
// 사이트 연결(1회) → 스니펫 복사 → 마운트 마커 배치 → 연결 배지 확인.
// 전시 전환은 "이 웨비나 노출"만 바꾸면 된다 (코드 재부착 없음).

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Cable,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Loader2,
  Megaphone,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/contexts/workspace";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { getPublicAppOrigin } from "@/lib/app-url";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

interface EmbedSite {
  id: string;
  name: string;
  siteUrl: string | null;
  livePageUrl: string | null;
  bannerPagePatterns: string[];
  lastSeenAt: string | null;
  lastSeenOrigin: string | null;
  isActive: boolean;
  activeWebinar: { id: string; name: string; slug: string } | null;
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <motion.button
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.96 }}
      transition={spring}
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          toast.success("복사했어요");
          setTimeout(() => setCopied(false), 1600);
        });
      }}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs transition-colors hover:bg-secondary"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
      {label ?? "복사"}
    </motion.button>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="flex items-start gap-2">
      <pre className="min-w-0 flex-1 overflow-x-auto rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-[11.5px] leading-relaxed">
        <code>{code}</code>
      </pre>
      <CopyButton text={code} />
    </div>
  );
}

function ConnectionBadge({ lastSeenAt }: { lastSeenAt: string | null }) {
  if (!lastSeenAt) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/50 px-2.5 py-1 text-[11px] text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" /> 아직 부착 안 됨
      </span>
    );
  }
  const ageMs = Date.now() - new Date(lastSeenAt).getTime();
  const fresh = ageMs < 5 * 60_000;
  const mins = Math.floor(ageMs / 60_000);
  const ageText = mins < 1 ? "방금 전" : mins < 60 ? `${mins}분 전` : mins < 60 * 24 ? `${Math.floor(mins / 60)}시간 전` : `${Math.floor(mins / 1440)}일 전`;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
        fresh
          ? "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
          : "border-border bg-secondary/50 text-muted-foreground"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${fresh ? "animate-pulse bg-green-500" : "bg-muted-foreground/40"}`} />
      {fresh ? "연결됨" : "마지막 확인"} · {ageText}
    </span>
  );
}

const MOUNT_MARKERS = [
  {
    key: "hero-button",
    title: "히어로 버튼",
    desc: "상세페이지 히어로 영역 — 상태에 따라 사전등록 → 입장하기 → 종료 CTA로 자동 전환돼요.",
    code: '<div data-mach-webinar-mount="hero-button"></div>',
  },
  {
    key: "register-form",
    title: "사전등록 폼",
    desc: "등록 폼이 이 자리에 렌더되고 제출 데이터는 mach studio로 바로 들어와요 (UTM 자동 첨부).",
    code: '<div data-mach-webinar-mount="register-form"></div>',
  },
  {
    key: "live",
    title: "라이브 시청",
    desc: "라이브 전용 페이지에 배치 — 인증·시청·Q&A·공지가 이 안에서 동작해요. 배치한 페이지 주소를 아래 \"라이브 페이지 URL\"에 등록해주세요.",
    code: '<div data-mach-webinar-mount="live"></div>',
  },
] as const;

// 랜딩 임베드 스니펫 — 로더 스크립트 한 줄.
// 로더가 ①랜딩을 자동높이 iframe 으로 삽입(호스트가 자연 스크롤 → 중첩 스크롤 없음)
// ②웨비나 상태(등록중/라이브중/종료)에 맞춘 고정 하단 배너를 아임웹 페이지에 주입한다.
// 히어로 버튼은 랜딩 안에서 상태별로 자동 전환. (기존 /w/{siteId} + 마운트 마커 방식은 그대로 유지)
function buildLandingEmbedSnippet(origin: string, slug: string) {
  return `<!-- machstudio 웨비나 랜딩(상태연동 배너 포함) -->
<script async src="${origin}/webinar/${slug}/embed"></script>`;
}

export default function DeployTab({ webinarId, slug }: { webinarId: string; slug: string }) {
  const confirm = useConfirm();
  const { workspace, currentProject } = useWorkspace();
  const [sites, setSites] = useState<EmbedSite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSiteUrl, setNewSiteUrl] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  // 비개발자 온보딩: 부착 순서 가이드를 기본으로 펼치고(핵심 절차), 마운트 마커(코드 참조)는 접어 둔다
  const [markersOpen, setMarkersOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(true);
  const [liveUrlDrafts, setLiveUrlDrafts] = useState<Record<string, string>>({});
  const [bannerDrafts, setBannerDrafts] = useState<Record<string, string>>({});
  const hasLoadedRef = useRef(false);

  // 스니펫은 파트너 사이트에 그대로 박히므로 배포 URL 기준이어야 한다.
  // 접속 중인 호스트(localhost·프리뷰 배포)를 쓰면 곧 죽는 주소가 남는다.
  const origin = getPublicAppOrigin();

  const fetchSites = useCallback(async () => {
    if (!workspace || !currentProject) return;
    if (!hasLoadedRef.current) setIsLoading(true);
    try {
      const res = await fetch(`/api/webinar-embed-sites?workspaceId=${workspace.id}&projectId=${currentProject.id}`);
      const data = await res.json().catch(() => null);
      if (res.ok && data?.sites) {
        setSites(data.sites);
        hasLoadedRef.current = true;
      }
    } finally {
      setIsLoading(false);
    }
  }, [workspace, currentProject]);

  useEffect(() => { void fetchSites(); }, [fetchSites]);

  // 연결 배지 갱신 — 10초 폴링 + 탭 숨김 가드
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      void fetchSites();
    }, 30_000);
    return () => clearInterval(id);
  }, [fetchSites]);

  const createSite = async () => {
    if (!workspace || !currentProject || !newName.trim() || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/webinar-embed-sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspace.id,
          projectId: currentProject.id,
          name: newName.trim(),
          siteUrl: newSiteUrl.trim(),
          activeWebinarId: webinarId,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "사이트 생성에 실패했어요");
      toast.success("사이트가 연결됐어요. 스니펫을 아임웹에 붙여넣어 주세요.");
      setNewName("");
      setNewSiteUrl("");
      setShowCreate(false);
      void fetchSites();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "사이트 생성에 실패했어요");
    } finally {
      setCreating(false);
    }
  };

  const patchSite = async (siteId: string, patch: Record<string, unknown>, successMsg: string) => {
    const res = await fetch(`/api/webinar-embed-sites/${siteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      toast.error(data?.error ?? "저장에 실패했어요");
      return false;
    }
    toast.success(successMsg);
    void fetchSites();
    return true;
  };

  const deleteSite = async (site: EmbedSite) => {
    if (!(await confirm({ title: "사이트 연결을 삭제할까요?", description: `"${site.name}"\n부착된 스크립트는 더 이상 아무것도 표시하지 않아요.`, confirmLabel: "삭제", tone: "danger" }))) return;
    const res = await fetch(`/api/webinar-embed-sites/${site.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("삭제했어요");
      void fetchSites();
    } else {
      toast.error("삭제에 실패했어요");
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const landingUrl = `${origin}/webinar/${slug}/landing`;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-3xl space-y-6">
      {/* 랜딩 페이지 임베드 — 사이트 연결(추적)과 독립적으로 바로 쓸 수 있다 */}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Megaphone className="h-4 w-4 text-violet-500" /> 랜딩 페이지 임베드
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          아임웹 HTML 위젯에 아래 코드를 붙이면 헤더 아래에 상세페이지가 그대로 들어가요. 높이는 자동으로 맞춰지고,
          만들기 → 랜딩 페이지에서 수정하면 재부착 없이 즉시 반영돼요.
        </p>
        <div className="mt-4 space-y-3">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">직접 링크</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-xl border border-border bg-secondary/40 px-3 py-2.5 text-[11.5px]">{landingUrl}</code>
              <CopyButton text={landingUrl} />
              <a
                href={landingUrl}
                target="_blank"
                rel="noopener"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs transition-colors hover:bg-secondary"
              >
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /> 열기
              </a>
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">임베드 코드 (아임웹 HTML 위젯)</p>
            <CodeBlock code={buildLandingEmbedSnippet(origin, slug)} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            비공개 상태면 방문자에게 “아직 공개되지 않은 페이지” 안내만 보여요 — 만들기 → 랜딩 페이지에서 공개로 켜세요.
          </p>
        </div>
      </section>

      {/* ① 사이트 연결 */}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Cable className="h-4 w-4 text-violet-500" /> 아임웹 사이트 연결
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              사이트당 코드를 한 번만 붙이면, 이후 문구·일정·상태 변경은 여기서만 하면 돼요.
            </p>
          </div>
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={spring}
            onClick={() => setShowCreate((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-violet-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-600"
          >
            <Plus className="h-3.5 w-3.5" /> 새 사이트 연결
          </motion.button>
        </div>

        <AnimatePresence>
          {showCreate && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="mt-4 space-y-2 rounded-xl border border-border bg-background p-4">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="사이트 이름 (예: 스마트테크코리아)"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-violet-400"
                />
                <input
                  value={newSiteUrl}
                  onChange={(e) => setNewSiteUrl(e.target.value)}
                  placeholder="사이트 주소 (선택 — 예: https://smarttechkorea.com)"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-violet-400"
                />
                <motion.button
                  whileTap={{ scale: 0.98 }}
                  onClick={createSite}
                  disabled={!newName.trim() || creating}
                  className="w-full rounded-xl bg-violet-500 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
                >
                  {creating ? "연결 중…" : "이 웨비나로 연결하기"}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {sites.length === 0 && !showCreate && (
          <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
            아직 연결된 사이트가 없어요. &ldquo;새 사이트 연결&rdquo;로 시작해주세요.
          </p>
        )}

        <div className="mt-4 space-y-4">
          {sites.map((site) => {
            const isThisWebinar = site.activeWebinar?.id === webinarId;
            const snippet = `<script async src="${origin}/w/${site.id}"></script>`;
            return (
              <div key={site.id} className={`rounded-xl border p-4 transition-colors ${isThisWebinar ? "border-violet-500/40 bg-violet-500/[0.04]" : "border-border bg-background"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">{site.name}</span>
                    <ConnectionBadge lastSeenAt={site.lastSeenAt} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    {site.siteUrl && (
                      <a href={site.siteUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary" aria-label="사이트 열기">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button onClick={() => deleteSite(site)} className="rounded-lg border border-border p-1.5 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-500" aria-label="삭제">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {isThisWebinar ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-500">
                      <Check className="h-3 w-3" /> 이 웨비나 노출 중
                    </span>
                  ) : (
                    <>
                      <span className="text-muted-foreground">
                        현재 노출: {site.activeWebinar ? site.activeWebinar.name : "없음"}
                      </span>
                      <button
                        onClick={() => patchSite(site.id, { activeWebinarId: webinarId }, "이 웨비나가 노출되도록 전환했어요")}
                        className="rounded-lg border border-violet-500/40 px-2.5 py-1 text-[11px] font-medium text-violet-500 transition-colors hover:bg-violet-500/10"
                      >
                        이 웨비나 노출하기
                      </button>
                    </>
                  )}
                </div>

                <div className="mt-3 space-y-2">
                  <p className="text-[11px] font-medium text-muted-foreground">부착 스니펫 (아임웹 환경설정 → 코드 삽입, 1회)</p>
                  <CodeBlock code={snippet} />
                </div>

                <div className="mt-3 space-y-1.5">
                  <p className="text-[11px] font-medium text-muted-foreground">라이브 페이지 URL (아임웹에 만든 라이브 전용 페이지 주소)</p>
                  <div className="flex items-center gap-2">
                    <input
                      value={liveUrlDrafts[site.id] ?? site.livePageUrl ?? ""}
                      onChange={(e) => setLiveUrlDrafts((prev) => ({ ...prev, [site.id]: e.target.value }))}
                      placeholder="https://example.com/webinarlive"
                      className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none transition-colors focus:border-violet-400"
                    />
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      onClick={() => {
                        const draft = (liveUrlDrafts[site.id] ?? site.livePageUrl ?? "").trim();
                        void patchSite(site.id, { livePageUrl: draft }, "라이브 페이지 URL을 저장했어요");
                      }}
                      className="shrink-0 rounded-xl border border-border px-3 py-2 text-xs transition-colors hover:bg-secondary"
                    >
                      저장
                    </motion.button>
                  </div>
                </div>

                {/* 하단 배너 표시 범위 — 스니펫이 전 페이지에서 로드되므로 배너 노출 경로를 제한 */}
                {(() => {
                  const patterns = site.bannerPagePatterns ?? [];
                  const specific = patterns.length > 0;
                  const draft = bannerDrafts[site.id] ?? patterns.join(", ");
                  return (
                    <div className="mt-3 space-y-1.5">
                      <p className="text-[11px] font-medium text-muted-foreground">하단 배너 표시 범위</p>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={specific ? "specific" : "all"}
                          onChange={(e) => {
                            if (e.target.value === "all") {
                              setBannerDrafts((prev) => ({ ...prev, [site.id]: "" }));
                              void patchSite(site.id, { bannerPagePatterns: [] }, "모든 페이지에 배너를 표시해요");
                            } else {
                              const next = draft.trim() || "/webinar";
                              setBannerDrafts((prev) => ({ ...prev, [site.id]: next }));
                              void patchSite(
                                site.id,
                                { bannerPagePatterns: next.split(",").map((s) => s.trim()).filter(Boolean) },
                                "지정한 페이지에서만 배너를 표시해요",
                              );
                            }
                          }}
                          className="rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none transition-colors focus:border-violet-400"
                        >
                          <option value="all">모든 페이지</option>
                          <option value="specific">특정 페이지에서만</option>
                        </select>
                        {specific && (
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <input
                              value={draft}
                              onChange={(e) => setBannerDrafts((prev) => ({ ...prev, [site.id]: e.target.value }))}
                              placeholder="/webinar"
                              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs outline-none transition-colors focus:border-violet-400"
                            />
                            <motion.button
                              whileTap={{ scale: 0.96 }}
                              onClick={() =>
                                void patchSite(
                                  site.id,
                                  { bannerPagePatterns: draft.split(",").map((s) => s.trim()).filter(Boolean) },
                                  "배너 표시 페이지를 저장했어요",
                                )
                              }
                              className="shrink-0 rounded-xl border border-border px-3 py-2 text-xs transition-colors hover:bg-secondary"
                            >
                              저장
                            </motion.button>
                          </div>
                        )}
                      </div>
                      <p className="text-[10px] leading-relaxed text-muted-foreground">
                        {specific
                          ? "쉼표로 여러 경로 지정 가능. 끝에 * 를 붙이면 하위 경로 포함 (예: /webinar 는 사전등록 페이지, /webinar* 는 그 하위까지)."
                          : "지금은 스니펫이 부착된 모든 페이지에 배너가 떠요. 사전등록 페이지에서만 띄우려면 '특정 페이지에서만'을 선택하세요."}
                      </p>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </section>

      {/* ② 마운트 마커 */}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <button onClick={() => setMarkersOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
          <div>
            <h2 className="text-sm font-semibold">컴포넌트 위치 지정 (마운트 마커)</h2>
            <p className="mt-1 text-xs text-muted-foreground">버튼·폼이 들어갈 자리에 아임웹 &ldquo;코드&rdquo; 위젯으로 붙여넣으세요. 하단 배너는 마커 없이 자동 표시돼요.</p>
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${markersOpen ? "rotate-180" : ""}`} />
        </button>
        <AnimatePresence>
          {markersOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="mt-4 space-y-4">
                {MOUNT_MARKERS.map((marker) => (
                  <div key={marker.key}>
                    <p className="text-xs font-medium">{marker.title}</p>
                    <p className="mb-1.5 mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{marker.desc}</p>
                    <CodeBlock code={marker.code} />
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* ③ 부착 순서 가이드 */}
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <button onClick={() => setGuideOpen((v) => !v)} className="flex w-full items-center justify-between text-left">
          <h2 className="text-sm font-semibold">아임웹 부착 순서</h2>
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${guideOpen ? "rotate-180" : ""}`} />
        </button>
        <AnimatePresence>
          {guideOpen && (
            <motion.ol
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="mt-3 list-decimal space-y-2 overflow-hidden pl-4 text-xs leading-relaxed text-muted-foreground"
            >
              <li>위에서 사이트를 연결하고 <b className="text-foreground">부착 스니펫</b>을 복사해요.</li>
              <li>아임웹 관리자 → <b className="text-foreground">환경설정 → 코드 삽입(헤더)</b>에 스니펫을 붙여넣어요. <b className="text-foreground">사이트당 딱 한 번</b>이에요.</li>
              <li>웨비나 상세페이지에서 버튼·폼이 들어갈 자리에 <b className="text-foreground">코드 위젯</b>을 추가하고 마운트 마커를 붙여넣어요.</li>
              <li>라이브 전용 페이지를 하나 만들고 <b className="text-foreground">라이브 마커</b>를 배치한 뒤, 그 페이지 주소를 위 &ldquo;라이브 페이지 URL&rdquo;에 저장해요.</li>
              <li>페이지를 열면 위 연결 배지가 <b className="text-foreground">&ldquo;연결됨&rdquo;</b>으로 바뀌어요. 이후 모든 변경은 mach studio에서!</li>
            </motion.ol>
          )}
        </AnimatePresence>
      </section>
      </div>
    </div>
  );
}
