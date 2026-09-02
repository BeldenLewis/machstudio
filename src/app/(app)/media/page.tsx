"use client";

/**
 * 미디어 — 사진·동영상을 올리고 공개 URL을 받는 워크스페이스 공용 자료실.
 *
 * 특정 웨비나·대회·홈페이지에 매이지 않는다 — 팀이 여러 화면에 재사용할 로고·클립 같은
 * 자산을 둘 곳이 없어서 만들었다(다른 업로드는 전부 그 소유 엔티티에 종속돼 있다).
 *
 * 업로드는 이 화면이 직접 처리하지 않는다. Vercel 서버리스 함수의 요청 본문 상한(4.5MB)이
 * 있어 우리 서버를 거치면 큰 사진·동영상이 통과할 수 없다 — 그래서 서명 URL을 받아
 * **브라우저가 Supabase Storage 로 직접** 올린다(api/media/sign 머리말 참고).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, ImageIcon, Video, Copy, Trash2, Loader2, X, Check } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/contexts/workspace";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { createClient } from "@/lib/supabase/client";
import { FINISH, R, FieldSelect } from "@/components/ui/primitives";
import {
  MEDIA_ACCEPT,
  formatBytes,
  kindForMimeType,
  validateMediaUpload,
  type MediaKind,
} from "@/lib/media-asset";
import { MEDIA_BUCKET } from "@/lib/media-asset-bucket";

const spring = { type: "spring", stiffness: 420, damping: 30 } as const;

interface MediaAssetRow {
  id: string;
  kind: MediaKind;
  url: string;
  mimeType: string;
  size: number;
  originalName: string;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  createdAt: string;
  createdBy: { name: string | null; email: string } | null;
  project: { id: string; name: string } | null;
}

interface PendingUpload {
  id: string;
  name: string;
  kind: MediaKind | null;
  status: "reading" | "uploading" | "registering" | "error";
  error?: string;
}

/** 이미지는 로드해서, 동영상은 메타데이터만 읽어서 가로세로·길이를 잰다. 실패해도 업로드를 막지 않는다. */
function readMediaDimensions(file: File, kind: MediaKind): Promise<{ width?: number; height?: number; durationSec?: number }> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    const timer = setTimeout(() => { cleanup(); resolve({}); }, 8_000);

    if (kind === "image") {
      const img = new Image();
      img.onload = () => { clearTimeout(timer); cleanup(); resolve({ width: img.naturalWidth, height: img.naturalHeight }); };
      img.onerror = () => { clearTimeout(timer); cleanup(); resolve({}); };
      img.src = objectUrl;
      return;
    }
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      clearTimeout(timer); cleanup();
      resolve({ width: video.videoWidth || undefined, height: video.videoHeight || undefined, durationSec: Number.isFinite(video.duration) ? video.duration : undefined });
    };
    video.onerror = () => { clearTimeout(timer); cleanup(); resolve({}); };
    video.src = objectUrl;
  });
}

function formatDuration(sec: number | null): string | null {
  if (sec === null || !Number.isFinite(sec)) return null;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function MediaPage() {
  const { workspace, projects, currentProject } = useWorkspace();
  const confirm = useConfirm();
  const supabase = useMemo(() => createClient(), []);

  const [assets, setAssets] = useState<MediaAssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  // 페이지에 처음 들어오면 지금 고른 프로젝트로 좁혀서 보여준다 — "전체"는 언제든 고를 수 있다.
  const [projectFilter, setProjectFilter] = useState<string>(currentProject?.id ?? "");
  const [isDragging, setIsDragging] = useState(false);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * 인라인 IIFE 로 쓴다 — 콜백을 따로 만들어 이펙트에서 부르면 컴파일러가 "이펙트 안에서
   * setState" 로 판정한다(react-hooks/set-state-in-effect). ExpoSiteEditor.tsx 가 같은
   * 이유로 이 형태를 쓴다.
   */
  useEffect(() => {
    if (!workspace) return;
    const controller = new AbortController();
    void (async () => {
      setLoading(true);
      try {
        const qs = projectFilter ? `?projectId=${encodeURIComponent(projectFilter)}` : "";
        const res = await fetch(`/api/media${qs}`, { cache: "no-store", signal: controller.signal });
        const data = await res.json();
        setAssets(Array.isArray(data.assets) ? data.assets : []);
      } catch (error) {
        if ((error as { name?: string })?.name === "AbortError") return;
        toast.error("목록을 불러오지 못했어요. 연결을 확인해주세요.");
      } finally {
        setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [workspace, projectFilter]);

  const uploadOne = useCallback(async (file: File) => {
    const pendingId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const kind = kindForMimeType(file.type);
    setPending((prev) => [...prev, { id: pendingId, name: file.name, kind, status: "reading" }]);
    const setStatus = (status: PendingUpload["status"], error?: string) => {
      setPending((prev) => prev.map((p) => (p.id === pendingId ? { ...p, status, error } : p)));
    };
    const removeAfterDelay = (ms: number) => {
      setTimeout(() => setPending((prev) => prev.filter((p) => p.id !== pendingId)), ms);
    };

    const clientError = validateMediaUpload({ mimeType: file.type, size: file.size });
    if (clientError || !kind) {
      setStatus("error", clientError ?? "지원하지 않는 형식이에요.");
      toast.error(`${file.name}: ${clientError ?? "지원하지 않는 형식이에요."}`);
      removeAfterDelay(4_000);
      return;
    }

    try {
      const dims = await readMediaDimensions(file, kind);

      setStatus("uploading");
      const signRes = await fetch("/api/media/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mimeType: file.type, size: file.size, projectId: projectFilter || null }),
      });
      if (!signRes.ok) throw new Error((await signRes.json().catch(() => ({}))).error ?? "업로드 준비에 실패했어요.");
      const { path, token } = await signRes.json();

      const { error: uploadError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (uploadError) throw uploadError;

      setStatus("registering");
      const confirmRes = await fetch("/api/media", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path, mimeType: file.type, size: file.size, originalName: file.name,
          width: dims.width, height: dims.height, durationSec: dims.durationSec,
        }),
      });
      if (!confirmRes.ok) throw new Error((await confirmRes.json().catch(() => ({}))).error ?? "등록에 실패했어요.");
      const { asset } = await confirmRes.json();

      setAssets((prev) => [asset, ...prev]);
      setPending((prev) => prev.filter((p) => p.id !== pendingId));
      toast.success(`${file.name} 업로드 완료`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "업로드에 실패했어요.";
      setStatus("error", message);
      toast.error(`${file.name}: ${message}`);
      removeAfterDelay(5_000);
    }
  }, [projectFilter, supabase]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => { void uploadOne(file); });
  }, [uploadOne]);

  const copyLink = useCallback(async (asset: MediaAssetRow) => {
    try {
      await navigator.clipboard.writeText(asset.url);
      setCopiedId(asset.id);
      setTimeout(() => setCopiedId((id) => (id === asset.id ? null : id)), 1_500);
    } catch {
      toast.error("복사하지 못했어요. 주소를 직접 선택해 복사해주세요.");
    }
  }, []);

  const handleDelete = useCallback(async (asset: MediaAssetRow) => {
    const approved = await confirm({
      title: `"${asset.originalName}" 을(를) 지울까요?`,
      description: "이미 다른 곳에 붙여 넣은 링크는 더 이상 열리지 않아요. 되돌릴 수 없어요.",
      confirmLabel: "지우기",
      tone: "danger",
    });
    if (!approved) return;

    const prevAssets = assets;
    setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    try {
      const res = await fetch(`/api/media/${asset.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "삭제에 실패했어요.");
      toast.success("지웠어요.");
    } catch (error) {
      setAssets(prevAssets);
      toast.error(error instanceof Error ? error.message : "삭제에 실패했어요. 연결을 확인해주세요.");
    }
  }, [assets, confirm]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">미디어</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          사진(WebP 포함)이나 동영상을 올리면 바로 쓸 수 있는 주소가 생겨요.
        </p>
      </div>

      {/* 업로드 자리 — 항상 보이고 그 자리에서 바로 시작된다(고치는 영역: 접지 않는다). */}
      <motion.label
        whileHover={!isDragging ? { y: -2, borderColor: "rgba(139, 92, 246, 0.6)" } : undefined}
        whileTap={{ scale: 0.995 }}
        transition={{ duration: 0.18 }}
        className={`flex min-h-32 cursor-pointer flex-col items-center justify-center ${R.panel} border border-dashed px-4 py-8 text-center transition-colors ${
          isDragging ? "border-violet-400 bg-violet-500/10" : "border-border hover:bg-violet-500/5"
        }`}
        onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
      >
        <Upload className={`mb-3 h-7 w-7 ${isDragging ? "text-violet-400" : "text-violet-500"}`} aria-hidden />
        <span className="text-sm font-medium">파일을 끌어다 놓거나 클릭해서 선택</span>
        <span className="mt-1 text-xs text-muted-foreground">JPG·PNG·WebP·GIF 사진, MP4·WebM·MOV 동영상</span>
        <input
          ref={fileInputRef}
          type="file"
          accept={MEDIA_ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
        />
      </motion.label>

      {/* 올라가는 중인 파일 — 끝나면 목록으로 옮겨가고 이 줄은 사라진다. */}
      <AnimatePresence initial={false}>
        {pending.length > 0 && (
          <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-1.5 overflow-hidden">
            {pending.map((p) => (
              <li key={p.id} className={`flex items-center gap-2 ${R.surface} ${FINISH.s2} bg-secondary px-3 py-2 text-xs`}>
                {p.status === "error" ? (
                  <X className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
                ) : (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-violet-500" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {p.status === "reading" && "확인 중…"}
                  {p.status === "uploading" && "올리는 중…"}
                  {p.status === "registering" && "등록 중…"}
                  {p.status === "error" && (p.error ?? "실패")}
                </span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      {/* 프로젝트 필터 — 워크스페이스 전체가 기본, 필요하면 좁힌다(UTM 빌더와 같은 패턴). */}
      {projects.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">프로젝트</span>
          <FieldSelect
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="w-56"
          >
            <option value="">전체</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </FieldSelect>
        </div>
      )}

      {/* 목록 — 읽는 영역: 요약(썸네일) 먼저, 세부는 카드 안에 작게. */}
      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          불러오는 중…
        </div>
      ) : assets.length === 0 ? (
        <div className={`${R.panel} ${FINISH.s1} bg-card p-10 text-center text-sm text-muted-foreground`}>
          아직 올린 파일이 없어요. 위 자리에 끌어다 놓으면 바로 시작돼요.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {assets.map((asset) => (
            <motion.div
              key={asset.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={spring}
              className={`group relative overflow-hidden ${R.panel} ${FINISH.s1} bg-card`}
            >
              <div className="relative aspect-square bg-secondary">
                {asset.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Supabase 원본을 그대로 보여준다(next/image 최적화 미설정, image-downscale.ts 주석 참고).
                  <img src={asset.url} alt={asset.originalName} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
                    <Video className="h-8 w-8" aria-hidden />
                    {formatDuration(asset.durationSec) && (
                      <span className="text-[11px] font-medium">{formatDuration(asset.durationSec)}</span>
                    )}
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 bg-gradient-to-t from-black/55 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => void copyLink(asset)}
                    aria-label={`${asset.originalName} 링크 복사`}
                    className={`inline-flex h-7 w-7 items-center justify-center ${R.control} bg-white/90 text-foreground shadow-sm transition-colors hover:bg-white`}
                  >
                    {copiedId === asset.id ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(asset)}
                    aria-label={`${asset.originalName} 삭제`}
                    className={`inline-flex h-7 w-7 items-center justify-center ${R.control} bg-white/90 text-destructive shadow-sm transition-colors hover:bg-white`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </div>
              <div className="p-2.5">
                <p className="truncate text-xs font-medium" title={asset.originalName}>{asset.originalName}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  {asset.kind === "image" ? <ImageIcon className="h-3 w-3" aria-hidden /> : <Video className="h-3 w-3" aria-hidden />}
                  {formatBytes(asset.size)}
                  {asset.width && asset.height ? ` · ${asset.width}×${asset.height}` : ""}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
