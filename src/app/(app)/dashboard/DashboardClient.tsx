"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Filter, LayoutDashboard, Loader2, RefreshCw, Share2, X } from "lucide-react";
import { useWorkspace } from "@/contexts/workspace";
import { kstDateString } from "@/lib/datetime";
import DateRangePicker, { DateRange } from "@/components/DateRangePicker";
import RealtimeReport, { type RealtimeReportData } from "./RealtimeReport";
import ProjectSummaryCard from "./ProjectSummaryCard";
import { DashboardShareModal } from "./DashboardShareModal";

const AUTO_REFRESH_MS = 180_000; // 3분 (egress 절감 — 과거 30초였음)
const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

interface DashboardFilters {
  sourceId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  attribution?: "last" | "first";
}

interface SourceOption {
  id: string;
  name: string;
}

function defaultRange(): DateRange {
  const ks = kstDateString(new Date());
  const today = new Date(ks + "T00:00:00+09:00");
  const from = new Date(today.getTime() - 7 * 86400_000);
  const to = new Date(today.getTime() + 86400_000 - 1);
  return { from, to, label: "최근 7일" };
}

function getFilterCount(filters: DashboardFilters) {
  return [filters.sourceId, filters.utmSource, filters.utmMedium, filters.utmCampaign].filter(Boolean).length;
}

export default function DashboardClient() {
  const { workspace, currentProject, isLoading: wsLoading } = useWorkspace();
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [range, setRange] = useState<DateRange>(defaultRange());
  const [filters, setFilters] = useState<DashboardFilters>({ attribution: "last" });
  const [showFilters, setShowFilters] = useState(false);
  const [reportData, setReportData] = useState<RealtimeReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"full" | "summary">("full");

  const filterCount = useMemo(() => getFilterCount(filters), [filters]);
  const hasActiveFilter = filterCount > 0;

  const fetchSources = useCallback(async () => {
    if (!workspace || !currentProject) return;

    setSourcesLoading(true);
    try {
      const res = await fetch(`/api/collect-sources?workspaceId=${workspace.id}&projectId=${currentProject.id}`);
      const data = await res.json().catch(() => ({}));
      setSources((data.sources ?? []).map((source: { id: string; name: string }) => ({
        id: source.id,
        name: source.name,
      })));
    } catch (error) {
      console.error("[dashboard] collect sources failed", error);
      setSources([]);
    } finally {
      setSourcesLoading(false);
    }
  }, [workspace, currentProject]);

  const fetchReport = useCallback(async () => {
    if (!workspace || !currentProject) return;

    setReportLoading(true);
    try {
      const res = await fetch("/api/dashboard-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspace.id,
          projectId: currentProject.id,
          from: range.from.toISOString(),
          to: range.to.toISOString(),
          filters,
        }),
      });
      const data = await res.json().catch(() => null);

      if (res.ok) {
        setReportData(data);
      } else {
        console.error("[dashboard-report] failed", data);
      }
    } catch (error) {
      console.error("[dashboard-report] failed", error);
    } finally {
      setReportLoading(false);
    }
  }, [workspace, currentProject, range, filters]);

  useEffect(() => {
    void Promise.resolve().then(fetchSources);
  }, [fetchSources]);

  useEffect(() => {
    void Promise.resolve().then(fetchReport);
  }, [fetchReport, refreshTick]);

  useEffect(() => {
    // egress 절감: 탭이 보일 때만 자동 새로고침, 백그라운드(숨김)면 중단.
    const id = setInterval(() => {
      if (!document.hidden) setRefreshTick((tick) => tick + 1);
    }, AUTO_REFRESH_MS);
    // 탭으로 돌아오면 1회 즉시 갱신
    const onVisible = () => { if (!document.hidden) setRefreshTick((tick) => tick + 1); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const updateFilter = <Key extends keyof DashboardFilters>(key: Key, value: DashboardFilters[Key] | "") => {
    setFilters((current) => ({
      ...current,
      [key]: value || undefined,
    }));
  };

  const clearFilters = () => {
    setFilters({ attribution: filters.attribution ?? "last" });
  };

  if (wsLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center">
        <LayoutDashboard className="mb-3 h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">프로젝트를 먼저 선택해주세요</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">실시간 보고서</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {currentProject.name}의 등록 흐름과 전시팀 인사이트를 요약합니다
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker value={range} onChange={setRange} />
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.96 }}
            transition={spring}
            onClick={() => setShowFilters((open) => !open)}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
              showFilters || hasActiveFilter
                ? "border-violet-400 bg-violet-500/10 text-violet-600"
                : "border-border bg-background hover:bg-secondary"
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            필터
            {filterCount > 0 && (
              <span className="rounded-full bg-violet-500 px-1.5 py-0.5 text-[10px] leading-none text-white">
                {filterCount}
              </span>
            )}
          </motion.button>
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.96 }}
            transition={spring}
            onClick={() => setShareOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="공유"
          >
            <Share2 className="h-3.5 w-3.5" />
            공유
          </motion.button>
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.96 }}
            transition={spring}
            onClick={() => setRefreshTick((tick) => tick + 1)}
            className="rounded-xl border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary"
            title="새로고침"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${reportLoading ? "animate-spin" : ""}`} />
          </motion.button>
        </div>
      </div>

      <AnimatePresence initial={false}>
      {showFilters && (
        <motion.div
          initial={{ opacity: 0, y: -4, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -4, height: 0 }}
          transition={spring}
          className="overflow-hidden rounded-2xl border border-border bg-background p-4"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">보고서 필터</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">선택한 조건은 실시간 보고서 전체에 적용됩니다.</p>
            </div>
            {hasActiveFilter && (
              <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                transition={spring}
                onClick={clearFilters}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="h-3 w-3" />
                초기화
              </motion.button>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">수집 폼</span>
              <select
                value={filters.sourceId ?? ""}
                onChange={(event) => updateFilter("sourceId", event.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-violet-400"
              >
                <option value="">{sourcesLoading ? "불러오는 중..." : "모든 수집 폼"}</option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>{source.name}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">UTM 소스</span>
              <input
                type="text"
                placeholder="예: google"
                value={filters.utmSource ?? ""}
                onChange={(event) => updateFilter("utmSource", event.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-violet-400"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">UTM 매체</span>
              <input
                type="text"
                placeholder="예: banner"
                value={filters.utmMedium ?? ""}
                onChange={(event) => updateFilter("utmMedium", event.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-violet-400"
              />
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">UTM 캠페인</span>
              <input
                type="text"
                placeholder="예: registration"
                value={filters.utmCampaign ?? ""}
                onChange={(event) => updateFilter("utmCampaign", event.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-violet-400"
              />
            </label>

            <div className="space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">기여 기준</span>
              <div className="relative grid h-10 grid-cols-2 rounded-xl border border-border bg-secondary/30 p-1">
                {(["last", "first"] as const).map((attribution) => {
                  const active = (filters.attribution ?? "last") === attribution;
                  return (
                    <button
                      key={attribution}
                      onClick={() => setFilters((current) => ({ ...current, attribution }))}
                      className={`relative z-10 rounded-lg text-xs font-medium transition-colors ${
                        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                      title={attribution === "last" ? "최종 유입 기준" : "최초 유입 기준"}
                    >
                      {active && (
                        <motion.span
                          layoutId="attribution-pill"
                          transition={spring}
                          className="absolute inset-0 -z-10 rounded-lg bg-background shadow-sm"
                        />
                      )}
                      {attribution === "last" ? "Last" : "First"}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>
      )}
      </AnimatePresence>

      <div className="relative inline-grid grid-cols-2 rounded-xl border border-border bg-secondary/30 p-1 text-sm">
        {(["full", "summary"] as const).map((mode) => {
          const active = viewMode === mode;
          return (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`relative z-10 rounded-lg px-4 py-1.5 font-medium transition-colors ${
                active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="dashboard-view-pill"
                  transition={spring}
                  className="absolute inset-0 -z-10 rounded-lg bg-background shadow-sm"
                />
              )}
              {mode === "full" ? "전체 보기" : "요약 보기"}
            </button>
          );
        })}
      </div>

      {viewMode === "full" ? (
        <RealtimeReport data={reportData} loading={reportLoading} rangeLabel={range.label} />
      ) : reportData ? (
        <ProjectSummaryCard data={reportData} />
      ) : (
        <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-border text-sm text-muted-foreground">
          {reportLoading ? "요약을 불러오는 중..." : "표시할 데이터가 없습니다"}
        </div>
      )}

      {currentProject && (
        <DashboardShareModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          projectId={currentProject.id}
          projectName={currentProject.name}
        />
      )}
    </div>
  );
}
