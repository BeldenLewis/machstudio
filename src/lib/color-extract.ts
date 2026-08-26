"use client";

/**
 * 포스터 이미지에서 키컬러를 뽑는다 — 완전히 클라이언트에서 돈다(서버 왕복·새 의존성 없음).
 *
 * 단순 평균이 아니라 **채도·명도로 거른 뒤 가장 흔한 색**을 고른다 — 포스터는 보통 배경이
 * 흰색·검정·회색이라 평균을 내면 칙칙한 회갈색이 나온다(실측). 무채색·너무 밝거나 어두운
 * 픽셀을 버리고 남은 것 중 최빈값을 쓰면 실제로 "이 포스터의 색"이라 부를 만한 색이 나온다.
 */
export async function extractDominantColor(imageUrl: string): Promise<string | null> {
  const img = await loadImage(imageUrl);
  const canvas = document.createElement("canvas");
  // 큰 이미지를 그대로 스캔할 필요 없다 — 64x64 로 줄여도 색 분포는 거의 그대로다.
  const size = 64;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);

  let pixels: Uint8ClampedArray;
  try {
    pixels = ctx.getImageData(0, 0, size, size).data;
  } catch {
    // 교차 출처 이미지가 캔버스를 오염시키면(CORS 헤더 없음) 여기서 막힌다.
    return null;
  }

  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], a = pixels[i + 3];
    if (a < 200) continue; // 투명 픽셀 제외
    const { s, l } = rgbToHsl(r, g, b);
    if (s < 0.15) continue; // 무채색(흰·검·회) 제외
    if (l < 0.12 || l > 0.9) continue; // 너무 어둡거나 밝은 픽셀 제외
    // 16단계로 양자화 — 미세한 그라데이션이 색마다 다른 버킷으로 흩어지는 것을 막는다.
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const bucket = buckets.get(key);
    if (bucket) { bucket.count++; bucket.r += r; bucket.g += g; bucket.b += b; }
    else buckets.set(key, { count: 1, r, g, b });
  }

  if (buckets.size === 0) return null;
  const top = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  const r = Math.round(top.r / top.count);
  const g = Math.round(top.g / top.count);
  const b = Math.round(top.b / top.count);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지를 불러오지 못했어요"));
    img.src = url;
  });
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h, s, l };
}
