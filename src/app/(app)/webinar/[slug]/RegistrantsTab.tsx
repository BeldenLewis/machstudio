"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  Edit3,
  FileText,
  Loader2,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { formatKst } from "@/lib/datetime";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

type SortKey =
  | "name"
  | "phone"
  | "email"
  | "company"
  | "department"
  | "jobTitle"
  | "industry"
  | "agreeMarketing"
  | "enteredAt"
  | "lastPingAt"
  | "stayMinutes"
  | "submittedAt"
  | "isActive";
type SortDir = "asc" | "desc";
type DuplicateMode = "skip" | "include" | "update";

interface Registration {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  department: string | null;
  jobTitle: string | null;
  industry: string | null;
  agreeMarketing: boolean;
  agreePrivacy: boolean;
  memo: string | null;
  stayMinutes: number;
  isActive: boolean;
  submittedAt: string;
  enteredAt: string | null;
  lastPingAt: string | null;
}

interface RegistrationDraft {
  name: string;
  phone: string;
  email: string;
  company: string;
  department: string;
  jobTitle: string;
  industry: string;
  agreeMarketing: boolean;
  memo: string;
}

interface RegistrationDetailDraft extends RegistrationDraft {
  agreePrivacy: boolean;
}

const emptyDraft: RegistrationDraft = {
  name: "",
  phone: "",
  email: "",
  company: "",
  department: "",
  jobTitle: "",
  industry: "",
  agreeMarketing: false,
  memo: "",
};

const sortLabels: Record<SortKey, string> = {
  name: "이름",
  phone: "연락처",
  email: "이메일",
  company: "회사",
  department: "부서",
  jobTitle: "직함",
  industry: "업종",
  agreeMarketing: "마케팅",
  enteredAt: "최초 입장",
  lastPingAt: "마지막 신호",
  stayMinutes: "체류",
  submittedAt: "등록일",
  isActive: "상태",
};

const headerAliases: Record<keyof RegistrationDraft, string[]> = {
  name: ["이름", "성함", "name", "이름/성함"],
  phone: ["연락처", "휴대폰", "전화", "전화번호", "phone", "mobile"],
  email: ["이메일", "메일", "email"],
  company: ["회사", "소속", "기관", "회사명", "company"],
  department: ["부서", "department", "dept"],
  jobTitle: ["직함", "직책", "직급", "job", "position", "title"],
  industry: ["업종", "산업", "관심분야", "industry"],
  agreeMarketing: ["마케팅", "수신", "marketing", "agree"],
  memo: ["메모", "사전질문", "질문", "memo", "question"],
};

function parseCSV(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const normalized = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    const next = normalized[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += ch;
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function cleanHeader(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, "").toLowerCase();
}

function findHeaderIndex(headers: string[], aliases: string[]) {
  const clean = headers.map(cleanHeader);
  return clean.findIndex((header) => aliases.some((alias) => header.includes(cleanHeader(alias))));
}

function parseBoolean(value: string) {
  const text = value.trim().toLowerCase();
  return ["y", "yes", "true", "1", "동의", "수신"].some((item) => text.includes(item));
}

function rowsToDrafts(rows: string[]) {
  return {
    name: rows[0] ?? "",
    phone: rows[1] ?? "",
    email: rows[2] ?? "",
    company: rows[3] ?? "",
    department: rows[4] ?? "",
    jobTitle: rows[5] ?? "",
    industry: rows[6] ?? "",
    agreeMarketing: parseBoolean(rows[7] ?? ""),
    memo: rows[8] ?? "",
  };
}

function parseBulkText(text: string): RegistrationDraft[] {
  const rows = parseCSV(text);
  if (!rows.length) return [];

  const headers = rows[0] ?? [];
  const nameIndex = findHeaderIndex(headers, headerAliases.name);
  const hasHeader = nameIndex > -1;

  if (!hasHeader) return rows.map(rowsToDrafts).filter((row) => row.name.trim());

  const indexes = {
    name: findHeaderIndex(headers, headerAliases.name),
    phone: findHeaderIndex(headers, headerAliases.phone),
    email: findHeaderIndex(headers, headerAliases.email),
    company: findHeaderIndex(headers, headerAliases.company),
    department: findHeaderIndex(headers, headerAliases.department),
    jobTitle: findHeaderIndex(headers, headerAliases.jobTitle),
    industry: findHeaderIndex(headers, headerAliases.industry),
    agreeMarketing: findHeaderIndex(headers, headerAliases.agreeMarketing),
    memo: findHeaderIndex(headers, headerAliases.memo),
  };

  return rows.slice(1).map((row) => ({
    name: indexes.name > -1 ? row[indexes.name] ?? "" : "",
    phone: indexes.phone > -1 ? row[indexes.phone] ?? "" : "",
    email: indexes.email > -1 ? row[indexes.email] ?? "" : "",
    company: indexes.company > -1 ? row[indexes.company] ?? "" : "",
    department: indexes.department > -1 ? row[indexes.department] ?? "" : "",
    jobTitle: indexes.jobTitle > -1 ? row[indexes.jobTitle] ?? "" : "",
    industry: indexes.industry > -1 ? row[indexes.industry] ?? "" : "",
    agreeMarketing: indexes.agreeMarketing > -1 ? parseBoolean(row[indexes.agreeMarketing] ?? "") : false,
    memo: indexes.memo > -1 ? row[indexes.memo] ?? "" : "",
  })).filter((row) => row.name.trim());
}

function formatDate(value: string | null) {
  if (!value) return "-";
  // KST 고정 — 관리자 브라우저 타임존과 무관하게 일관된 표시
  return formatKst(value, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatDateShort(value: string | null) {
  if (!value) return "-";
  return formatKst(value, { month: "2-digit", day: "2-digit" });
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = activeKey === sortKey;
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${active ? "text-violet-500" : ""}`}
      title={`${label} ${active && dir === "asc" ? "오름차순" : "내림차순"} 정렬`}
    >
      {label}
      <Icon className="w-3 h-3" />
    </button>
  );
}

export default function RegistrantsTab({ webinarId }: { webinarId: string }) {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("submittedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showManual, setShowManual] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [manual, setManual] = useState<RegistrationDraft>(emptyDraft);
  const [bulkText, setBulkText] = useState("");
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>("skip");
  const [isSaving, setIsSaving] = useState(false);
  const [selectedRegistration, setSelectedRegistration] = useState<Registration | null>(null);
  const [detailDraft, setDetailDraft] = useState<RegistrationDetailDraft | null>(null);
  const modalOpen = showManual || showBulk || Boolean(selectedRegistration);

  const fetchRegistrations = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy,
        sortDir,
      });
      if (search) params.set("q", search);
      const res = await fetch(`/api/webinars/${webinarId}/registrations?${params}`);
      const data = await res.json();
      setRegistrations(data.registrations ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setIsLoading(false);
    }
  }, [webinarId, page, pageSize, search, sortBy, sortDir]);

  useEffect(() => { void Promise.resolve().then(fetchRegistrations); }, [fetchRegistrations]);

  useEffect(() => {
    if (!modalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setShowManual(false);
      setShowBulk(false);
      setSelectedRegistration(null);
      setDetailDraft(null);
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [modalOpen]);

  const parsedBulk = useMemo(() => parseBulkText(bulkText), [bulkText]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleSort = (key: SortKey) => {
    setPage(1);
    if (sortBy === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir(["name", "phone", "email", "company", "department", "jobTitle", "industry"].includes(key) ? "asc" : "desc");
    }
  };

  const handleExport = async () => {
    const res = await fetch(`/api/webinars/${webinarId}/registrations/export`);
    if (!res.ok) { toast.error("내보내기 실패"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `registrations-${webinarId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const submitManual = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/webinars/${webinarId}/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registration: manual, duplicateMode }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? data.errors?.[0]?.message ?? "등록 실패");
        return;
      }
      toast.success(`DB 등록 완료 · 신규 ${data.created}명, 갱신 ${data.updated}명, 제외 ${data.skipped}명`);
      setManual(emptyDraft);
      setShowManual(false);
      setPage(1);
      await fetchRegistrations();
    } finally {
      setIsSaving(false);
    }
  };

  const submitBulk = async () => {
    if (!parsedBulk.length) {
      toast.error("등록 가능한 데이터가 없어요");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/webinars/${webinarId}/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrations: parsedBulk, duplicateMode }),
      });
      const data = await res.json();
      if (!res.ok && !data.created && !data.updated && !data.skipped) {
        toast.error(data.error ?? data.errors?.[0]?.message ?? "일괄등록 실패");
        return;
      }
      toast.success(`일괄등록 완료 · 신규 ${data.created}명, 갱신 ${data.updated}명, 제외 ${data.skipped}명`);
      if (data.errors?.length) toast.error(`오류 ${data.errors.length}건은 제외됐어요`);
      setBulkText("");
      setShowBulk(false);
      setPage(1);
      await fetchRegistrations();
    } finally {
      setIsSaving(false);
    }
  };

  const deleteRegistration = async (registration: Registration) => {
    if (!confirm(`"${registration.name}" 등록자를 삭제할까요?`)) return;

    const res = await fetch(`/api/webinars/${webinarId}/registrations/${registration.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("삭제 실패");
      return;
    }
    toast.success("등록자를 삭제했어요");
    if (selectedRegistration?.id === registration.id) {
      setSelectedRegistration(null);
      setDetailDraft(null);
    }
    await fetchRegistrations();
  };

  const openRegistrationDetail = (registration: Registration) => {
    setSelectedRegistration(registration);
    setDetailDraft({
      name: registration.name,
      phone: registration.phone ?? "",
      email: registration.email ?? "",
      company: registration.company ?? "",
      department: registration.department ?? "",
      jobTitle: registration.jobTitle ?? "",
      industry: registration.industry ?? "",
      agreeMarketing: registration.agreeMarketing,
      agreePrivacy: registration.agreePrivacy,
      memo: registration.memo ?? "",
    });
  };

  const closeRegistrationDetail = () => {
    setSelectedRegistration(null);
    setDetailDraft(null);
  };

  const saveRegistrationDetail = async () => {
    if (!selectedRegistration || !detailDraft) return;

    setIsSaving(true);
    try {
      const res = await fetch(`/api/webinars/${webinarId}/registrations/${selectedRegistration.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(detailDraft),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "등록자 저장 실패");
        return;
      }
      toast.success("등록자 정보가 저장됐어요");
      setSelectedRegistration(data.registration);
      await fetchRegistrations();
    } finally {
      setIsSaving(false);
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBulkText(await file.text());
    setShowBulk(true);
  };

  const inputClass = "w-full px-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:border-violet-400";

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-5">
      <div>
        <div>
          <h2 className="text-sm font-semibold">등록자 관리</h2>
          <p className="text-sm text-muted-foreground mt-1">
            총 {total.toLocaleString()}명 · {sortLabels[sortBy]} {sortDir === "asc" ? "오름차순" : "내림차순"}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 flex-wrap">
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.96 }}
          transition={spring}
          onClick={() => { setShowManual(true); setShowBulk(false); }}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs hover:bg-secondary transition-colors"
        >
          <Database className="w-3.5 h-3.5" />DB 등록
        </motion.button>
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.96 }}
          transition={spring}
          onClick={() => { setShowBulk(true); setShowManual(false); }}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs hover:bg-secondary transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />일괄등록
        </motion.button>
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.96 }}
          transition={spring}
          onClick={handleExport}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs hover:bg-secondary transition-colors"
        >
          <Download className="w-3.5 h-3.5" />CSV 내보내기
        </motion.button>
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-background w-full sm:w-[360px] transition-colors focus-within:border-violet-400">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="이름, 연락처, 이메일, 회사, 업종 검색"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setSearch(searchInput); setPage(1); } }}
            className="min-w-0 flex-1 text-sm bg-transparent focus:outline-none"
          />
        </div>
        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.96 }}
          transition={spring}
          onClick={() => { setSearch(searchInput); setPage(1); }}
          className="px-3 py-2 rounded-xl border border-border text-xs hover:bg-secondary transition-colors"
        >
          검색
        </motion.button>
        {search && (
          <motion.button
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.96 }}
            transition={spring}
            onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}
            className="px-3 py-2 rounded-xl border border-border text-xs hover:bg-secondary transition-colors text-muted-foreground"
          >
            초기화
          </motion.button>
        )}
      </div>

      <AnimatePresence>
      {showManual && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="manual-registration-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowManual(false);
          }}
        >
          <motion.section
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={spring}
            className="w-full max-w-3xl max-h-[calc(100vh-48px)] overflow-y-auto rounded-2xl border border-border bg-background shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
              <div>
                <h3 id="manual-registration-title" className="text-sm font-semibold">DB 직접 등록</h3>
                <p className="text-xs text-muted-foreground mt-1">운영자가 직접 등록자를 추가합니다.</p>
              </div>
              <motion.button
                whileHover={{ rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                transition={spring}
                onClick={() => setShowManual(false)}
                className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                aria-label="닫기"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </motion.button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input className={inputClass} placeholder="이름 *" value={manual.name} onChange={(e) => setManual((p) => ({ ...p, name: e.target.value }))} />
                <input className={inputClass} placeholder="연락처 또는 이메일 중 하나 필요" value={manual.phone} onChange={(e) => setManual((p) => ({ ...p, phone: e.target.value }))} />
                <input className={inputClass} placeholder="이메일" value={manual.email} onChange={(e) => setManual((p) => ({ ...p, email: e.target.value }))} />
                <input className={inputClass} placeholder="회사" value={manual.company} onChange={(e) => setManual((p) => ({ ...p, company: e.target.value }))} />
                <input className={inputClass} placeholder="부서" value={manual.department} onChange={(e) => setManual((p) => ({ ...p, department: e.target.value }))} />
                <input className={inputClass} placeholder="직함" value={manual.jobTitle} onChange={(e) => setManual((p) => ({ ...p, jobTitle: e.target.value }))} />
                <input className={inputClass} placeholder="업종" value={manual.industry} onChange={(e) => setManual((p) => ({ ...p, industry: e.target.value }))} />
                <label className="flex items-center gap-2 text-sm text-muted-foreground px-1">
                  <input type="checkbox" checked={manual.agreeMarketing} onChange={(e) => setManual((p) => ({ ...p, agreeMarketing: e.target.checked }))} className="accent-violet-500" />
                  마케팅 수신 동의
                </label>
                <textarea className={`${inputClass} md:col-span-2 resize-none`} rows={3} placeholder="메모" value={manual.memo} onChange={(e) => setManual((p) => ({ ...p, memo: e.target.value }))} />
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap border-t border-border pt-4">
                <select className={inputClass + " w-auto"} value={duplicateMode} onChange={(e) => setDuplicateMode(e.target.value as DuplicateMode)}>
                  <option value="skip">중복 제외 등록</option>
                  <option value="update">중복이면 기존 데이터 갱신</option>
                  <option value="include">중복 포함 등록</option>
                </select>
                <motion.button
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.96 }}
                  transition={spring}
                  onClick={submitManual}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />등록
                </motion.button>
              </div>
            </div>
          </motion.section>
        </motion.div>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {showBulk && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-registration-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowBulk(false);
          }}
        >
          <motion.section
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={spring}
            className="w-full max-w-4xl max-h-[calc(100vh-48px)] overflow-y-auto rounded-2xl border border-border bg-background shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
              <div>
                <h3 id="bulk-registration-title" className="text-sm font-semibold">CSV / 텍스트 일괄등록</h3>
                <p className="text-xs text-muted-foreground mt-1">헤더가 있으면 자동 매핑하고, 없으면 이름, 연락처, 이메일, 회사 순서로 읽습니다.</p>
              </div>
              <motion.button
                whileHover={{ rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                transition={spring}
                onClick={() => setShowBulk(false)}
                className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                aria-label="닫기"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </motion.button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-xs hover:bg-secondary transition-colors cursor-pointer">
                  <FileText className="w-3.5 h-3.5" />CSV 파일 선택
                  <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
                </label>
                <select className={inputClass + " w-auto"} value={duplicateMode} onChange={(e) => setDuplicateMode(e.target.value as DuplicateMode)}>
                  <option value="skip">중복 제외 등록</option>
                  <option value="update">중복이면 기존 데이터 갱신</option>
                  <option value="include">중복 포함 등록</option>
                </select>
                <span className="text-xs text-muted-foreground">등록 대상 {parsedBulk.length.toLocaleString()}명</span>
              </div>

              <textarea
                rows={12}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={"이름,연락처,이메일,회사,부서,직함,업종,마케팅동의,메모\n홍길동,01012345678,hong@example.com,엑스포럼,마케팅팀,팀장,AI,Y,"}
                className={`${inputClass} font-mono text-xs resize-y`}
              />

              {parsedBulk.length > 0 && (
                <div className="rounded-2xl border border-border bg-secondary/20 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-xs font-medium">미리보기</p>
                    <p className="text-xs text-muted-foreground">상위 {Math.min(parsedBulk.length, 5)}명 표시</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-muted-foreground">
                          <th className="px-2 py-1 text-left font-medium">이름</th>
                          <th className="px-2 py-1 text-left font-medium">연락처</th>
                          <th className="px-2 py-1 text-left font-medium">이메일</th>
                          <th className="px-2 py-1 text-left font-medium">회사</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {parsedBulk.slice(0, 5).map((row, index) => (
                          <tr key={`${row.name}-${index}`}>
                            <td className="px-2 py-1.5">{row.name || "-"}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{row.phone || "-"}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{row.email || "-"}</td>
                            <td className="px-2 py-1.5 text-muted-foreground">{row.company || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end border-t border-border pt-4">
                <motion.button
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.96 }}
                  transition={spring}
                  onClick={submitBulk}
                  disabled={isSaving || parsedBulk.length === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-50"
                >
                  <Upload className="w-4 h-4" />{parsedBulk.length.toLocaleString()}명 일괄등록
                </motion.button>
              </div>
            </div>
          </motion.section>
        </motion.div>
      )}
      </AnimatePresence>

      <AnimatePresence>
      {selectedRegistration && detailDraft && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex justify-end bg-black/35 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="registration-detail-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeRegistrationDetail();
          }}
        >
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={spring}
            className="h-full w-full max-w-md overflow-y-auto border-l border-border bg-background shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
              <div>
                <h3 id="registration-detail-title" className="text-sm font-semibold">등록자 상세</h3>
                <p className="text-xs text-muted-foreground mt-1">정보를 확인하고 바로 수정합니다.</p>
              </div>
              <motion.button
                whileHover={{ rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                transition={spring}
                onClick={closeRegistrationDetail}
                className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
                aria-label="닫기"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </motion.button>
            </div>

            <div className="p-5 space-y-5">
              <div className="space-y-3">
                <input className={inputClass} placeholder="이름 *" value={detailDraft.name} onChange={(e) => setDetailDraft((p) => p ? { ...p, name: e.target.value } : p)} />
                <input className={inputClass} placeholder="연락처" value={detailDraft.phone} onChange={(e) => setDetailDraft((p) => p ? { ...p, phone: e.target.value } : p)} />
                <input className={inputClass} placeholder="이메일" value={detailDraft.email} onChange={(e) => setDetailDraft((p) => p ? { ...p, email: e.target.value } : p)} />
                <input className={inputClass} placeholder="회사" value={detailDraft.company} onChange={(e) => setDetailDraft((p) => p ? { ...p, company: e.target.value } : p)} />
                <div className="grid grid-cols-2 gap-3">
                  <input className={inputClass} placeholder="부서" value={detailDraft.department} onChange={(e) => setDetailDraft((p) => p ? { ...p, department: e.target.value } : p)} />
                  <input className={inputClass} placeholder="직함" value={detailDraft.jobTitle} onChange={(e) => setDetailDraft((p) => p ? { ...p, jobTitle: e.target.value } : p)} />
                </div>
                <input className={inputClass} placeholder="업종" value={detailDraft.industry} onChange={(e) => setDetailDraft((p) => p ? { ...p, industry: e.target.value } : p)} />
                <textarea className={`${inputClass} resize-none`} rows={4} placeholder="메모" value={detailDraft.memo} onChange={(e) => setDetailDraft((p) => p ? { ...p, memo: e.target.value } : p)} />
              </div>

              <div className="space-y-2 rounded-2xl border border-border bg-secondary/20 p-3">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="checkbox" checked={detailDraft.agreeMarketing} onChange={(e) => setDetailDraft((p) => p ? { ...p, agreeMarketing: e.target.checked } : p)} className="accent-violet-500" />
                  마케팅 수신 동의
                </label>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input type="checkbox" checked={detailDraft.agreePrivacy} onChange={(e) => setDetailDraft((p) => p ? { ...p, agreePrivacy: e.target.checked } : p)} className="accent-violet-500" />
                  개인정보 수집 동의
                </label>
              </div>

              <div className="rounded-2xl border border-border bg-secondary/20 p-3 text-xs text-muted-foreground space-y-1.5">
                <p>등록일: {formatDate(selectedRegistration.submittedAt)}</p>
                <p>최초 입장: {formatDate(selectedRegistration.enteredAt)}</p>
                <p>마지막 신호: {formatDate(selectedRegistration.lastPingAt)}</p>
                <p>체류: {selectedRegistration.enteredAt ? `${selectedRegistration.stayMinutes}분` : "-"}</p>
              </div>

              <div className="flex gap-2 border-t border-border pt-4">
                <motion.button
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  transition={spring}
                  onClick={saveRegistrationDetail}
                  disabled={isSaving}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-violet-600 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />저장
                </motion.button>
                <motion.button
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.97 }}
                  transition={spring}
                  onClick={() => deleteRegistration(selectedRegistration)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-500/30 px-4 py-2.5 text-sm text-red-500 transition-colors hover:bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4" />삭제
                </motion.button>
              </div>
            </div>
          </motion.aside>
        </motion.div>
      )}
      </AnimatePresence>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : registrations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Users className="w-10 h-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm font-medium">아직 등록자가 없어요</p>
          <p className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
            배포 탭에서 아임웹에 사전등록 폼을 붙이면 등록자가 이곳으로 자동으로 모여요. 직접 추가하거나 CSV로 불러올 수도 있어요.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => { setShowManual(true); setShowBulk(false); }}
              className="rounded-xl bg-violet-500 px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-600"
            >
              직접 추가
            </button>
            <button
              onClick={() => { setShowBulk(true); setShowManual(false); }}
              className="rounded-xl border border-border px-3.5 py-2 text-xs font-medium transition-colors hover:bg-secondary"
            >
              CSV 불러오기
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap"><SortHeader label="이름" sortKey="name" activeKey={sortBy} dir={sortDir} onSort={handleSort} /></th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap"><SortHeader label="연락처" sortKey="phone" activeKey={sortBy} dir={sortDir} onSort={handleSort} /></th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap"><SortHeader label="소속" sortKey="company" activeKey={sortBy} dir={sortDir} onSort={handleSort} /></th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap"><SortHeader label="직함" sortKey="jobTitle" activeKey={sortBy} dir={sortDir} onSort={handleSort} /></th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap"><SortHeader label="업종" sortKey="industry" activeKey={sortBy} dir={sortDir} onSort={handleSort} /></th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap"><SortHeader label="마케팅" sortKey="agreeMarketing" activeKey={sortBy} dir={sortDir} onSort={handleSort} /></th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap"><SortHeader label="체류" sortKey="stayMinutes" activeKey={sortBy} dir={sortDir} onSort={handleSort} /></th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap"><SortHeader label="최초 입장" sortKey="enteredAt" activeKey={sortBy} dir={sortDir} onSort={handleSort} /></th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap"><SortHeader label="등록일" sortKey="submittedAt" activeKey={sortBy} dir={sortDir} onSort={handleSort} /></th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap"><SortHeader label="상태" sortKey="isActive" activeKey={sortBy} dir={sortDir} onSort={handleSort} /></th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {registrations.map((r) => (
                    <tr key={r.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3 font-medium whitespace-nowrap">{r.name}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        <div>{r.phone ?? "-"}</div>
                        {r.email && <div className="text-xs">{r.email}</div>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        <div>{r.company ?? "-"}</div>
                        {r.department && <div className="text-xs">{r.department}</div>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{r.jobTitle ?? "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[180px] truncate">{r.industry ?? "-"}</td>
                      <td className="px-4 py-3">
                        {r.agreeMarketing ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400">동의</span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {r.enteredAt ? `${r.stayMinutes}분` : "-"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDate(r.enteredAt)}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDateShort(r.submittedAt)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {r.isActive ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400">시청 중</span>
                        ) : r.enteredAt ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">시청함</span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">미시청</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <motion.button
                          whileHover={{ y: -1 }}
                          whileTap={{ scale: 0.92 }}
                          transition={spring}
                          onClick={() => openRegistrationDetail(r)}
                          className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                          title="상세/수정"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </motion.button>
                        <motion.button
                          whileHover={{ y: -1 }}
                          whileTap={{ scale: 0.92 }}
                          transition={spring}
                          onClick={() => deleteRegistration(r)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-500 text-muted-foreground transition-colors"
                          title="삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </motion.button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="px-3 py-2 rounded-xl border border-border bg-background text-xs focus:outline-none"
              >
                <option value={30}>30명씩</option>
                <option value={50}>50명씩</option>
                <option value={100}>100명씩</option>
                <option value={200}>200명씩</option>
              </select>
              <p className="text-xs text-muted-foreground">
                전체 {total.toLocaleString()}명 중 {((page - 1) * pageSize + 1).toLocaleString()}-{Math.min(page * pageSize, total).toLocaleString()}명
              </p>
            </div>
            <div className="flex items-center gap-2">
              <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.92 }} transition={spring} onClick={() => setPage(1)} disabled={page === 1} className="p-1.5 rounded-lg border border-border hover:bg-secondary disabled:opacity-40 transition-colors"><ChevronsLeft className="w-4 h-4" /></motion.button>
              <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.92 }} transition={spring} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg border border-border hover:bg-secondary disabled:opacity-40 transition-colors"><ChevronLeft className="w-4 h-4" /></motion.button>
              <span className="text-sm text-muted-foreground tabular-nums">{page} / {totalPages}</span>
              <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.92 }} transition={spring} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg border border-border hover:bg-secondary disabled:opacity-40 transition-colors"><ChevronRight className="w-4 h-4" /></motion.button>
              <motion.button whileHover={{ y: -1 }} whileTap={{ scale: 0.92 }} transition={spring} onClick={() => setPage(totalPages)} disabled={page === totalPages} className="p-1.5 rounded-lg border border-border hover:bg-secondary disabled:opacity-40 transition-colors"><ChevronsRight className="w-4 h-4" /></motion.button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
