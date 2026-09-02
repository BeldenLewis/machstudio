"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Loader2, RotateCcw, X } from "lucide-react";
import { Field, FINISH, R } from "@/components/ui/primitives";
import { isSafePublicUrl } from "@/lib/expo/destination";
import { EXPO_IMAGE_LIMITS } from "@/lib/expo/image-guard";
import { EXPO_VIDEO_RULES } from "@/lib/expo/video-guard";
import type { ExpoImageValue, ExpoVideoValue } from "@/lib/expo/sections/types";
import type { FieldIssue } from "@/lib/expo/types";

export interface ExpoMediaUploadFieldProps {
  siteId: string;
  kind: "image" | "video";
  label?: string;
  value?: ExpoImageValue | ExpoVideoValue;
  disabled?: boolean;
  /** 편집기 구조화 오류가 실제 외부 주소 입력을 가리키는 경로. */
  fieldPath?: string;
  issues?: readonly FieldIssue[];
  onChange(next: ExpoImageValue | ExpoVideoValue | undefined): void;
}

type FinalizeBody = {
  kind?: "image" | "video";
  url?: string;
  originalUrl?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  bytes?: number;
  error?: string;
};

async function responseJson<T>(response: Response): Promise<T & { error?: string }> {
  return await response.json().catch(() => ({})) as T & { error?: string };
}

export function ExpoMediaUploadField({
  siteId, kind, label, value, disabled, fieldPath, issues = [], onChange,
}: ExpoMediaUploadFieldProps) {
  const currentUrl = value?.url ?? "";
  const [externalDraft, setExternalDraft] = useState({ base: currentUrl, value: currentUrl });
  const externalUrl = externalDraft.base === currentUrl ? externalDraft.value : currentUrl;
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryFile, setRetryFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const externalInputId = useId();
  const latest = useRef({ value, onChange });

  useEffect(() => { latest.current = { value, onChange }; }, [value, onChange]);

  const canonical = useCallback((body: FinalizeBody): ExpoImageValue | ExpoVideoValue => {
    if (!body.url || !body.originalUrl) throw new Error("완료된 미디어 주소가 없어요");
    if (kind === "video") {
      if (body.kind !== "video" || body.mimeType !== "video/mp4") throw new Error("완료된 영상 정보가 올바르지 않아요");
      return {
        kind: "video", url: body.url, originalUrl: body.originalUrl, mimeType: "video/mp4",
        rightsStatus: "unconfirmed",
      };
    }
    if (body.kind !== "image") throw new Error("완료된 이미지 정보가 올바르지 않아요");
    const current = latest.current.value?.kind === "image" ? latest.current.value : undefined;
    return {
      kind: "image", url: body.url, originalUrl: body.originalUrl,
      ...(body.mimeType ? { mimeType: body.mimeType } : {}),
      ...(body.width ? { width: body.width } : {}),
      ...(body.height ? { height: body.height } : {}),
      ...(current?.alt ? { alt: current.alt } : {}), decorative: current?.decorative === true,
    };
  }, [kind]);

  const upload = useCallback(async (file: File) => {
    setUploading(true);
    setRetryFile(file);
    setError(null);
    try {
      setProgress("안전한 업로드 주소 준비 중");
      const sessionResponse = await fetch(`/api/expo/${encodeURIComponent(siteId)}/media/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName: file.name, declaredType: file.type, bytes: file.size }),
      });
      const session = await responseJson<{ path?: string; signedUrl?: string; token?: string }>(sessionResponse);
      if (!sessionResponse.ok || !session.path || !session.signedUrl || !session.token) {
        throw new Error(session.error ?? "업로드 주소를 준비하지 못했어요");
      }

      setProgress("격리 공간에 업로드 중");
      const signedBody = new FormData();
      signedBody.append("cacheControl", "3600");
      signedBody.append("", file);
      const signedResponse = await fetch(session.signedUrl, {
        method: "PUT", headers: { "x-upsert": "false" }, body: signedBody,
      });
      if (!signedResponse.ok) throw new Error("격리 업로드에 실패했어요");

      setProgress("형식 검사와 최적화 중");
      const finalizeResponse = await fetch(`/api/expo/${encodeURIComponent(siteId)}/media/finalize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: session.path, declaredType: file.type }),
      });
      const finalized = await responseJson<FinalizeBody>(finalizeResponse);
      if (!finalizeResponse.ok) throw new Error(finalized.error ?? "미디어 검사를 완료하지 못했어요");
      latest.current.onChange(canonical(finalized));
      setRetryFile(null);
      setProgress("업로드 완료");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "올리지 못했어요. 연결을 확인해 주세요.");
      setProgress(null);
    } finally {
      setUploading(false);
    }
  }, [canonical, siteId]);

  const commitExternal = (candidate: string, showError: boolean) => {
    const url = candidate.trim();
    if (!isSafePublicUrl(url)) {
      if (showError) setError("외부 미디어는 자격 증명이 없는 HTTPS 주소만 사용할 수 있어요.");
      return false;
    }
    setError(null);
    if (kind === "video") {
      latest.current.onChange({ kind: "video", url, originalUrl: url, mimeType: "video/mp4", rightsStatus: "unconfirmed" });
    } else {
      const current = latest.current.value?.kind === "image" ? latest.current.value : undefined;
      latest.current.onChange({
        kind: "image", url, originalUrl: url,
        ...(current?.alt ? { alt: current.alt } : {}), decorative: current?.decorative === true,
      });
    }
    return true;
  };

  const applyExternal = () => { commitExternal(externalUrl, true); };

  const imageValue = value?.kind === "image" ? value : undefined;
  const noun = kind === "image" ? "이미지" : "영상";
  const accept = kind === "image"
    ? "image/jpeg,image/png,image/webp,image/svg+xml"
    : "video/mp4";

  return (
    <div className="space-y-2">
      {value?.url ? (
        <div className={`${R.surface} ${FINISH.s2} flex items-center gap-2 bg-secondary p-2`}>
          {kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.url} alt="" className={`h-12 w-16 shrink-0 object-cover ${R.control} ${FINISH.hairlineOut}`} />
          ) : <span className="text-xs font-medium">MP4</span>}
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{value.url}</span>
          {!disabled ? (
            <button type="button" aria-label={`${noun} 지우기`} onClick={() => latest.current.onChange(undefined)} className={`grid h-9 w-9 place-items-center ${R.control}`}>
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-end gap-1.5">
        <div className="min-w-0 flex-1">
          <Field
            id={externalInputId}
            aria-label={label ? `${label} 주소` : `외부 ${noun} HTTPS 주소`}
            data-field-path={fieldPath ?? issues[0]?.path}
            value={externalUrl}
            onChange={(event) => {
              const next = event.target.value;
              setExternalDraft({ base: currentUrl, value: next });
              if (next.trim()) commitExternal(next, false);
            }}
            placeholder={`https://… 외부 ${noun} 주소`}
            disabled={disabled || uploading}
            type="url"
          />
        </div>
        <button type="button" onClick={applyExternal} disabled={disabled || uploading} className={`min-h-9 px-3 text-xs font-medium ${R.control} ${FINISH.control} bg-secondary disabled:opacity-60`}>
          외부 주소 적용
        </button>
      </div>

      {!disabled ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            aria-label={`${noun} 파일 선택`}
            accept={accept}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void upload(file);
            }}
          />
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className={`inline-flex min-h-9 items-center gap-1.5 px-3 text-xs font-medium ${R.control} ${FINISH.control} bg-secondary disabled:opacity-60`}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ImagePlus className="h-3.5 w-3.5" aria-hidden />}
            {noun} 올리기
          </button>
          {retryFile && error && !uploading ? (
            <button type="button" onClick={() => void upload(retryFile)} className={`inline-flex min-h-9 items-center gap-1.5 px-3 text-xs ${R.control} ${FINISH.control}`}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> 다시 시도
            </button>
          ) : null}
          <span className="text-[11px] text-muted-foreground">
            {kind === "image" ? `${EXPO_IMAGE_LIMITS.sourceBytes / 1024 / 1024}MiB까지` : `${EXPO_VIDEO_RULES.sourceBytes / 1024 / 1024}MiB MP4`}
          </span>
        </div>
      ) : null}

      {progress ? <p role="status" className="text-[11px] text-muted-foreground">{progress}</p> : null}
      {error ? <p role="alert" className="text-[11px] text-[var(--destructive)]">{error}</p> : null}
      {issues.map((issue, index) => (
        <p key={`${issue.code}:${issue.path}:${index}`} role={issue.severity === "error" ? "alert" : "status"} data-field-path={issue.path} data-field-focus-target={externalInputId} className="text-[11px] text-[var(--destructive)]">
          {issue.message}
        </p>
      ))}

      {kind === "image" ? (
        <div className="space-y-1.5">
          <Field
            aria-label={`${label ?? "이미지"} 대체 텍스트`}
            value={imageValue?.alt ?? ""}
            onChange={(event) => latest.current.onChange({
              ...(imageValue ?? { kind: "image", url: "", decorative: false }),
              alt: event.target.value,
            })}
            placeholder="이미지 설명"
            disabled={disabled || imageValue?.decorative === true}
            maxLength={500}
          />
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              aria-label="장식용 이미지"
              checked={imageValue?.decorative === true}
              disabled={disabled}
              onChange={(event) => latest.current.onChange({
                ...(imageValue ?? { kind: "image", url: "", decorative: false }),
                decorative: event.target.checked,
                ...(event.target.checked ? { alt: "" } : {}),
              })}
            />
            장식용 이미지
          </label>
          {imageValue?.url && !imageValue.alt?.trim() && imageValue.decorative !== true ? (
            <p className="text-[11px] text-[var(--destructive)]">이미지 설명을 넣거나 장식용으로 표시해 주세요.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
