"use client";

import type { CSSProperties } from "react";
import { FieldSelect, FINISH, R } from "@/components/ui/primitives";
import { imageCropStyle, type ExpoImageValue, type ImageCrop } from "@/lib/expo/sections/types";

export interface ImageCropFieldProps {
  image: ExpoImageValue;
  value: ImageCrop;
  aspectRatio?: number;
  disabled?: boolean;
  onChange(next: ImageCrop): void;
}

/** 관리자 preview와 공개 runtime이 함께 쓰는 object-position + transform 정식. */
export function cropPreviewStyle(value: ImageCrop): CSSProperties {
  return imageCropStyle(value);
}

export function ImageCropField({ image, value, aspectRatio = 1, disabled, onChange }: ImageCropFieldProps) {
  const patch = (next: Partial<ImageCrop>) => onChange({ ...value, ...next });
  return (
    <fieldset disabled={disabled} className="space-y-2">
      <legend className="text-xs font-medium text-muted-foreground">이미지 자르기</legend>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(160px,0.7fr)]">
        <div className="space-y-2">
          <label className="block text-[11px] text-muted-foreground">
            맞춤 방식
            <FieldSelect aria-label="이미지 맞춤 방식" value={value.fit} onChange={(event) => patch({ fit: event.target.value as ImageCrop["fit"] })}>
              <option value="cover">영역 채우기</option>
              <option value="contain">전체 보이기</option>
            </FieldSelect>
          </label>
          <CropSlider label="가로 초점" value={value.x} min={0} max={100} step={1} onChange={(x) => patch({ x })} />
          <CropSlider label="세로 초점" value={value.y} min={0} max={100} step={1} onChange={(y) => patch({ y })} />
          <CropSlider label="확대 배율" value={value.scale} min={0.5} max={2} step={0.05} onChange={(scale) => patch({ scale })} />
          <button type="button" aria-label="이미지 자르기 초기화" onClick={() => onChange({ fit: "cover", x: 50, y: 50, scale: 1 })} className={`min-h-9 px-3 text-xs ${R.control} ${FINISH.control} bg-secondary`}>
            초기화
          </button>
        </div>
        <div className={`${R.surface} ${FINISH.s2} overflow-hidden bg-secondary`} style={{ aspectRatio }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt="자르기 미리보기" className="h-full w-full" style={cropPreviewStyle(value)} />
        </div>
      </div>
    </fieldset>
  );
}

function CropSlider({ label, value, min, max, step, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange(value: number): void;
}) {
  return (
    <label className="grid grid-cols-[1fr_auto] items-center gap-x-2 text-[11px] text-muted-foreground">
      <span>{label}</span>
      <span aria-hidden>{value}</span>
      <input
        className="col-span-2 w-full"
        type="range"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
