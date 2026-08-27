"use client";

/**
 * 차트 색을 **CSS 토큰에서 런타임으로 읽어** recharts 에 넘긴다.
 *
 * 왜 훅이 필요한가: recharts 는 stroke·fill 을 SVG 속성으로 받으므로 클래스가 아니라
 * **문자열 값**이 필요하다. 그런데 값을 소스에 박으면 테마를 따라갈 수 없다 —
 * 실제로 대시보드의 UTM 트렌드가 하드코딩 배열 한 벌이라 다크에서 라이트 색이 나왔다.
 * 그래서 computed style 에서 토큰을 읽고, `class` 변경(테마 토글)을 감시해 다시 읽는다.
 *
 * 원래 이 로직은 AnalyticsTab 안에만 있었다(웨비나 분석 탭). 같은 문제를 겪는 화면이
 * 둘 더 있는데 복사되지 않아서, 그 두 곳은 아예 토큰을 쓰지 않고 hex 를 박고 있었다.
 * 여기로 올려서 세 곳이 같은 한 벌을 쓰게 한다.
 */

import { useEffect, useState } from "react";

/** 도넛 차트가 브랜드로 근사해 아는 채널 6개 — globals.css 의 --brand-* 와 짝이다. */
export type BrandKey = "naver" | "kakao" | "google" | "instagram" | "youtube" | "facebook";

/** 의미가 고정된 시리즈 + 축·격자. 폴백은 라이트 값 — SSR 첫 페인트에서 쓰인다. */
export interface ChartColors {
  viewers: string;
  entered: string;
  chat: string;
  grid: string;
  axis: string;
  /**
   * 범주형 5슬롯. **순서 고정, 순환 금지** — 슬롯이 모자라면 색을 만들어 내는 게 아니라
   * 남는 항목을 접어야 한다(dataviz 원칙). 검증 근거는 globals.css 의 --series-* 주석.
   */
  series: readonly string[];
  /** 알려진 마케팅 채널의 브랜드 근사 색. 검증 근거는 globals.css 의 --brand-* 주석. */
  brands: Record<BrandKey, string>;
}

const FALLBACK_BRANDS: Record<BrandKey, string> = {
  naver: "#0a9e6e",
  kakao: "#9c4a15",
  google: "#2a6fdb",
  instagram: "#a3216b",
  youtube: "#e0522a",
  facebook: "#5b4fc7",
};

const FALLBACK: ChartColors = {
  viewers: "#26578b",
  entered: "#298646",
  chat: "#97a6b7",
  grid: "rgba(120,120,140,0.15)",
  axis: "#737373",
  series: ["#0058a8", "#007a34", "#d4679f", "#af6700", "#008369"],
  brands: FALLBACK_BRANDS,
};

export function useChartColors(): ChartColors {
  const [c, setC] = useState<ChartColors>(FALLBACK);

  useEffect(() => {
    const read = () => {
      const s = getComputedStyle(document.body);
      const g = (name: string, fb: string) => s.getPropertyValue(name).trim() || fb;
      setC({
        viewers: g("--chart-viewers", FALLBACK.viewers),
        entered: g("--chart-entered", FALLBACK.entered),
        chat: g("--chart-chat", FALLBACK.chat),
        grid: g("--border", FALLBACK.grid),
        axis: g("--muted-foreground", FALLBACK.axis),
        series: FALLBACK.series.map((fb, i) => g(`--series-${i + 1}`, fb)),
        brands: Object.fromEntries(
          (Object.keys(FALLBACK_BRANDS) as BrandKey[]).map((key) => [key, g(`--brand-${key}`, FALLBACK_BRANDS[key])]),
        ) as Record<BrandKey, string>,
      });
    };
    read();
    // 테마 토글은 html/body 의 class 로 들어온다 — 그때 토큰이 바뀌므로 다시 읽는다.
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  return c;
}

/**
 * 시리즈 슬롯 배정. 인덱스가 슬롯 수를 넘으면 **색을 돌려쓰지 않고 undefined** 를 준다 —
 * 호출자가 "접기"를 결정하게 만드는 게 목적이다.
 *
 * 예전 코드는 `COLORS[i % COLORS.length]` 였다. 서버가 상위 5개만 주므로 지금은 터지지
 * 않지만, 상한을 6으로 올리는 순간 1번과 6번이 **같은 색**이 되어 범례가 거짓말을 한다.
 * 조용히 중복되는 대신 여기서 드러나게 한다.
 */
export function seriesColor(colors: ChartColors, index: number): string | undefined {
  return colors.series[index];
}

function hashLabel(label: string): number {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * 슬롯을 **순위가 아니라 정체성**으로 배정한다 — dataviz 원칙 "color follows the entity,
 * never its rank"의 위반(카드마다 1등 채널이 항상 slot-1 색을 먹어, 정작 어느 채널인지는
 * 색이 말해 주지 않던 문제)을 고친다. 같은 라벨은 해시가 같아 항상 같은 슬롯에서 시작한다.
 *
 * `used`는 **호출자가 차트 하나마다 새로 만들어 넘긴다** — 그 차트 안에서 해시가 겹치면
 * (다른 라벨인데 같은 슬롯) 다음 빈 슬롯으로 넘어가 한 차트 안에서는 항상 서로 다른 색을
 * 보장한다. 차트 사이에서는(겹침이 없는 한) 같은 채널이 같은 색을 유지해 여러 카드를
 * 나란히 볼 때(예: 요약 대시보드) 색 자체가 신호가 된다.
 */
export function entityColor(colors: ChartColors, label: string, used: Set<number>): string | undefined {
  const n = colors.series.length;
  if (n === 0) return undefined;
  const start = hashLabel(label) % n;
  for (let offset = 0; offset < n; offset++) {
    const idx = (start + offset) % n;
    if (!used.has(idx)) {
      used.add(idx);
      return colors.series[idx];
    }
  }
  return undefined;
}

const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** recharts 의 fill/style 에 그대로 들어가는 문자열이라 형식을 여기서 강제한다. */
function isValidHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR_RE.test(value.trim());
}

/**
 * 정규화된(trim + 소문자) 채널 라벨 → 브랜드 키. 한/영 표기를 둘 다 받는다 —
 * UTM 값은 마케터가 직접 입력하는 자유 텍스트라 "네이버"와 "naver"가 섞여 들어온다.
 */
const CHANNEL_TO_BRAND_KEY: Record<string, BrandKey> = {
  naver: "naver",
  "네이버": "naver",
  kakao: "kakao",
  kakaotalk: "kakao",
  "카카오": "kakao",
  "카카오톡": "kakao",
  google: "google",
  "구글": "google",
  instagram: "instagram",
  ig: "instagram",
  "인스타": "instagram",
  "인스타그램": "instagram",
  youtube: "youtube",
  "유튜브": "youtube",
  facebook: "facebook",
  meta: "facebook",
  "페이스북": "facebook",
  "메타": "facebook",
};

/**
 * 도넛 슬라이스 하나의 최종 색 — 세 단계로 우선순위를 매긴다:
 *  1) 워크스페이스가 이 채널에 직접 지정한 색(overrides) — 사용자가 "IG는 분홍"처럼
 *     명시적으로 고른 값이라 항상 이긴다.
 *  2) 알려진 채널의 브랜드 근사 색(FALLBACK_BRANDS/--brand-*) — 지정한 적 없어도
 *     "네이버=초록"처럼 보자마자 알아볼 수 있게.
 *  3) 그 외엔 entityColor 의 해시 폴백 — 미지 채널도 카드마다 같은 색을 유지한다.
 *
 * override/brand 색은 categorical 5슬롯(`used`)과 다른 색공간이라 슬롯을 점유하지
 * 않는다 — 우연히 같은 hex 가 나올 순 있어도 이 함수가 슬롯 고갈을 일으키진 않는다.
 */
export function resolveChannelColor(
  colors: ChartColors,
  label: string,
  overrides: Record<string, string> | null | undefined,
  used: Set<number>,
): string | undefined {
  const normalized = label.trim().toLowerCase();

  const override = overrides?.[normalized];
  if (isValidHexColor(override)) return override.trim();

  const brandKey = CHANNEL_TO_BRAND_KEY[normalized];
  if (brandKey) return colors.brands[brandKey];

  return entityColor(colors, label, used);
}
