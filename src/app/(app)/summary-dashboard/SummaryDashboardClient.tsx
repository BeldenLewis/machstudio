"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutGrid, Loader2, Printer, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { useWorkspace } from "@/contexts/workspace";
import type { RealtimeReportData } from "../dashboard/RealtimeReport";
import ProjectSummaryCard from "../dashboard/ProjectSummaryCard";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

/** 주간 보고에 붙일 캡처 대신 — 화면 그대로 인쇄해 "PDF로 저장"하면 카드마다 이미 있는 기간·프로젝트명이 그대로 문서에 남는다. */
function formatPrintedAt(date: Date): string {
  const KST = 9 * 60 * 60 * 1000;
  const kst = new Date(date.getTime() + KST);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${y}.${m}.${d} ${hh}:${mm} KST 생성`;
}

export default function SummaryDashboardClient() {
  const { workspace, isLoading: wsLoading } = useWorkspace();
  const [reports, setReports] = useState<RealtimeReportData[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const fetchReports = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/summary-dashboard?workspaceId=${workspace.id}`);
      const data = await res.json().catch(() => null);
      setReports(res.ok ? data.projects ?? [] : []);
      setFetchedAt(new Date());
    } catch (error) {
      console.error("[summary-dashboard] failed", error);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  const printedAtLabel = useMemo(() => (fetchedAt ? formatPrintedAt(fetchedAt) : ""), [fetchedAt]);

  useEffect(() => {
    void Promise.resolve().then(fetchReports);
  }, [fetchReports]);

  if (wsLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-center">
        <LayoutGrid className="mb-3 h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">워크스페이스를 먼저 선택해주세요</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between print:hidden">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">요약 대시보드</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            진행중인 프로젝트의 사전등록 현황을 한눈에 모아봅니다
          </p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.96 }}
            transition={spring}
            onClick={() => window.print()}
            disabled={!reports || reports.length === 0}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            title="PDF로 내보내기 (인쇄 대화상자에서 'PDF로 저장' 선택)"
          >
            <Printer className="h-3.5 w-3.5" />
            PDF 내보내기
          </motion.button>
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.96 }}
            transition={spring}
            onClick={() => void fetchReports()}
            className="rounded-xl border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary"
            title="새로고침"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </motion.button>
        </div>
      </div>

      {/* 인쇄에만 보이는 보고서 헤더 — 화면 UI 없이 제목·생성 시각만 문서에 남긴다 */}
      <div className="hidden print:block">
        <h1 className="text-xl font-semibold">요약 대시보드</h1>
        {printedAtLabel && <p className="mt-0.5 text-xs text-muted-foreground">{printedAtLabel}</p>}
      </div>

      {loading && !reports ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !reports || reports.length === 0 ? (
        <div className="flex h-64 flex-col items-center justify-center text-center">
          <LayoutGrid className="mb-3 h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">
            진행중으로 표시된 프로젝트가 없습니다
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            사전등록 페이지에서 폼을 켜두면 이곳에 표시됩니다
          </p>
        </div>
      ) : (
        <div className="space-y-4 print:space-y-3">
          {reports.map((report) => (
            <div key={report.project.id} className="break-inside-avoid">
              <ProjectSummaryCard data={report} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
