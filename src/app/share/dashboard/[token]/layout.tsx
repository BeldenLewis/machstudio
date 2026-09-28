import type { Metadata } from "next";
import { getPublicAppOrigin } from "@/lib/app-url";
import { getPublicDashboardProject, getPublicDashboardReport } from "@/lib/public-realtime-dashboard";

type Props = { children: React.ReactNode; params: Promise<{ token: string }> };

function jsonUrl(token: string) {
  const origin = getPublicAppOrigin();
  const path = `/api/public/realtime-dashboard-data?token=${encodeURIComponent(token)}`;
  return origin ? `${origin}${path}` : path;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const project = await getPublicDashboardProject(token);
  return {
    title: project ? `${project.name} 공유 대시보드` : "공유 대시보드",
    description: "최근 30일의 등록 성과와 유입 현황을 확인하는 읽기 전용 대시보드입니다.",
    robots: { index: false, follow: false },
    alternates: { types: { "application/json": jsonUrl(token) } },
  };
}

export default async function DashboardShareLayout({ children, params }: Props) {
  const { token } = await params;
  const project = await getPublicDashboardProject(token);
  const report = project && !project.dashboardSharePasswordHash
    ? await getPublicDashboardReport(project)
    : null;
  const data = report && "data" in report ? report.data : null;
  const summary = data ? {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `${project?.name ?? "프로젝트"} 공유 대시보드`,
    description: "최근 30일 등록 성과의 비식별 집계 데이터",
    dateModified: data.generatedAt,
    distribution: [{ "@type": "DataDownload", encodingFormat: "application/json", contentUrl: jsonUrl(token) }],
    variableMeasured: [
      { "@type": "PropertyValue", name: "누적 등록", value: data.performance.cumulativeCount },
      { "@type": "PropertyValue", name: "조회 기간 등록", value: data.performance.rangeCount },
      { "@type": "PropertyValue", name: "오늘 등록", value: data.performance.todayCount },
    ],
  } : null;

  return (
    <>
      {summary && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(summary).replaceAll("<", "\\u003c") }} />}
      {children}
    </>
  );
}
