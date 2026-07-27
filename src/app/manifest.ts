import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "mach",
    short_name: "mach",
    description: "마케팅 어트리뷰션·수집·대시보드 플랫폼",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0a0a0a",
    // 앱 키 컬러(bg-violet-500 이 실제로 렌더되는 값 — violet 계열을 딥네이비로 재정의했다).
    // 예전 #8b5cf6 은 리브랜드 이전 순보라라, 설치형 PWA 의 브라우저 크롬만 보라로 남아 있었다.
    theme_color: "#0f3c67",
    icons: [
      { src: "/favicon.ico", sizes: "any", type: "image/x-icon" },
    ],
    lang: "ko-KR",
    orientation: "portrait",
  };
}
