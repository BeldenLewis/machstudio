import { describe, expect, it } from "vitest";
import {
  bizinfoApiError,
  classifyTitle,
  parseBizinfoApi,
  pickBizinfoOrg,
  googleNewsUrl,
  normalizeSourceConfig,
  parseBizinfoList,
  parseBizinfoPeriod,
  parseFeed,
  passesWordFilter,
  presetForProject,
} from "@/lib/brief/sources";
import { isFreshCandidate } from "@/lib/brief/model";

/**
 * 기업마당 목록 표의 모양(열 순서·링크 형식)을 그대로 본뜬 조각.
 * 사이트 구조가 바뀌면 이 테스트가 아니라 실제 수집이 먼저 깨진다 — 그때 이 조각을 새 모양으로 고친다.
 */
const BIZINFO_ROW = (id: string, field: string, title: string, period: string, ministry: string, agency: string) => `
  <tr>
    <td>189</td>
    <td>
        ${field}
    </td>
    <td class="txt_l">
      <a href= "/sii/siia/selectSIIA200Detail.do?hashCode=07&rows=15&cpage=1&pblancId=${id}" title="${title} 페이지 이동">
        ${title}
      </a>
    </td>
    <td>
        ${period}
    </td>
    <td>${ministry}</td>
    <td>${agency}</td>
    <td>2026-09-22</td>
    <td>684</td>
  </tr>`;

const BIZINFO_HTML = `<table><thead><tr><th>번호</th></tr></thead><tbody>
${BIZINFO_ROW("PBLN_000000000126706", "수출", "2026년 글로벌 인플루언서 엑스포 참여기업 모집 공고", "2026-09-21 ~ 2026-09-28", "중소벤처기업부", "장애인기업종합지원센터")}
${BIZINFO_ROW("PBLN_000000000126626", "수출", "[부산] 2026년 수출입 물류비 지원", "예산 소진시까지", "부산광역시", "부산시기계공업협동조합")}
${BIZINFO_ROW("PBLN_000000000126614", "수출", "K-Lifestyle 바이어 초청 구매상담회 참가업체 모집", "2026-09-17 ~ 2026-09-28", "중소벤처기업부", "")}
</tbody></table>`;

describe("기업마당 목록", () => {
  const rows = parseBizinfoList(BIZINFO_HTML, "auto");

  it("공고마다 한 줄 — 상세 주소는 pblancId 로 만든다", () => {
    expect(rows).toHaveLength(3);
    expect(rows[0].url).toBe("https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=PBLN_000000000126706");
    expect(rows[0].title).toBe("2026년 글로벌 인플루언서 엑스포 참여기업 모집 공고");
  });

  /** 원본 게시물의 [대괄호]는 실제로 접수받는 곳이었다. 수행기관이 비면 소관부처로. */
  it("기관은 수행기관, 비면 소관부처", () => {
    expect(rows[0].org).toBe("장애인기업종합지원센터");
    expect(rows[2].org).toBe("중소벤처기업부");
  });

  it("신청기간의 끝이 마감일, 날짜가 없으면 자유 표기", () => {
    expect(rows[0].dueDate).toBe("2026-09-28");
    expect(rows[1]).toMatchObject({ dueDate: null, dateLabel: "예산소진시까지" });
  });

  it("상담회는 행사, 나머지는 지원사업", () => {
    expect(rows.map((r) => r.category)).toEqual(["support", "support", "event"]);
  });
});

describe("기업마당 공식 API", () => {
  const json = {
    jsonArray: [
      {
        pblancId: "PBLN_000000000126706",
        pblancNm: "2026년 글로벌 인플루언서 엑스포 참여기업 모집 공고",
        pblancUrl: "https://www.bizinfo.go.kr/web/lay1/bbs/S1T122C128/AS/74/view.do?pblancId=PBLN_000000000126706",
        pldirSportRealmLclasCodeNm: "수출",
        excInsttNm: "장애인기업종합지원센터",
        jrsdInsttNm: "중소벤처기업부",
        reqstBeginEndDe: "20260921 ~ 20260928",
        creatPnttm: "2026-09-22 10:00:00",
      },
      { pblancId: "PBLN_2", pblancNm: "내수 판로 지원", pldirSportRealmLclasCodeNm: "내수", reqstBeginEndDe: "20260921 ~ 20261028" },
      { pblancId: "PBLN_3", pblancNm: "해외 바이어 상담회 참가 모집", pldirSportRealmLclasCodeNm: "수출", jrsdInsttNm: "KOTRA", reqstBeginEndDe: "예산 소진시까지" },
    ],
  };

  it("고른 분야만, 목록 읽기와 같은 상세 주소로", () => {
    const rows = parseBizinfoApi(json, "수출", "auto");
    expect(rows.map((r) => r.title)).toEqual(["2026년 글로벌 인플루언서 엑스포 참여기업 모집 공고", "해외 바이어 상담회 참가 모집"]);
    // 방식을 바꿔도 이미 수집한 공고와 같은 주소여야 중복으로 걸러진다
    expect(rows[0].url).toBe("https://www.bizinfo.go.kr/sii/siia/selectSIIA200Detail.do?pblancId=PBLN_000000000126706");
  });

  it("마감일(8자리)·기관·분류", () => {
    const [a, b] = parseBizinfoApi(json, "수출", "auto");
    expect(a).toMatchObject({ dueDate: "2026-09-28", org: "장애인기업종합지원센터", category: "support" });
    expect(b).toMatchObject({ dueDate: null, dateLabel: "예산소진시까지", org: "KOTRA", category: "event" });
  });

  it("오류 응답을 알아본다", () => {
    expect(bizinfoApiError({ reqErr: "인증키를 입력해주세요." })).toBe("인증키를 입력해주세요.");
    expect(bizinfoApiError(json)).toBe("");
    expect(parseBizinfoApi({ reqErr: "x" }, "수출", "auto")).toEqual([]);
  });
});

describe("신청기간 표기", () => {
  it.each([
    ["2026-09-01 ~ 2026-10-02", { dueDate: "2026-10-02", dateLabel: "" }],
    ["20260901 ~ 20261002", { dueDate: "2026-10-02", dateLabel: "" }],
    ["선착순 접수", { dueDate: null, dateLabel: "선착순" }],
    ["상시 모집", { dueDate: null, dateLabel: "상시" }],
    ["", { dueDate: null, dateLabel: "" }],
  ])("%s", (text, want) => {
    expect(parseBizinfoPeriod(text)).toEqual(want);
  });
});

const GOOGLE_NEWS_XML = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>
<item>
  <title>8월 K-뷰티 수출 빅데이터 리포트 - 뷰티경제</title>
  <link>https://news.google.com/rss/articles/CBMiAAA?oc=5</link>
  <pubDate>Mon, 22 Sep 2026 01:00:00 GMT</pubDate>
  <source url="https://www.thebk.co.kr">뷰티경제</source>
</item>
<item>
  <title><![CDATA[식약처, 중국 식품 수출업체 대상 &quot;등록&quot; 설명회 개최 - 대한민국 정책브리핑]]></title>
  <link>https://news.google.com/rss/articles/CBMiBBB?oc=5</link>
  <pubDate>Fri, 19 Sep 2026 03:00:00 GMT</pubDate>
  <source url="https://www.korea.kr">대한민국 정책브리핑</source>
</item>
<item><title>링크 없는 항목</title></item>
</channel></rss>`;

describe("Google 뉴스 RSS", () => {
  it("제목 끝의 ' - 언론사' 를 떼고 언론사는 기관 칸으로", () => {
    const [a] = parseFeed(GOOGLE_NEWS_XML, "news");
    expect(a).toMatchObject({ title: "8월 K-뷰티 수출 빅데이터 리포트", org: "뷰티경제", category: "news" });
    expect(a.publishedAt?.toISOString()).toBe("2026-09-22T01:00:00.000Z");
  });

  it("CDATA·엔티티를 푼다, 링크 없는 항목은 버린다", () => {
    const items = parseFeed(GOOGLE_NEWS_XML, "news");
    expect(items).toHaveLength(2);
    expect(items[1].title).toBe('식약처, 중국 식품 수출업체 대상 "등록" 설명회 개최');
  });

  it("auto 면 설명회는 행사, 나머지는 뉴스", () => {
    expect(parseFeed(GOOGLE_NEWS_XML, "auto").map((i) => i.category)).toEqual(["event", "event"]);
  });

  it("검색어에 기간이 붙는다", () => {
    const url = new URL(googleNewsUrl({ query: "K-뷰티 수출", days: 3 }));
    expect(url.searchParams.get("q")).toBe("K-뷰티 수출 when:3d");
    expect(url.searchParams.get("hl")).toBe("ko");
  });
});

it("Atom 피드도 읽는다", () => {
  const atom = `<feed><entry><title>KOTRA 해외시장 뉴스</title><link href="https://dream.kotra.or.kr/a/1"/><updated>2026-09-20T00:00:00Z</updated></entry></feed>`;
  expect(parseFeed(atom, "news")[0]).toMatchObject({ title: "KOTRA 해외시장 뉴스", url: "https://dream.kotra.or.kr/a/1" });
});

describe("분류·거르기", () => {
  it.each([
    ["중국 수출 등록 설명회 개최", "event"],
    ["해외진출 웨비나 참가자 모집", "event"],
    ["2026 K-뷰티 시장 리포트 발간", "event"],
    ["독일 의료기기 전시회 참가 지원사업", "support"],
    ["수출바우처 참여기업 모집", "support"],
  ])("%s → %s", (title, want) => {
    expect(classifyTitle(title)).toBe(want);
  });

  it("포함·제외 단어", () => {
    expect(passesWordFilter("K-뷰티 미국 수출 급증", { include: ["미국", "프랑스"] })).toBe(true);
    expect(passesWordFilter("K-뷰티 중국 수출", { include: ["미국", "프랑스"] })).toBe(false);
    expect(passesWordFilter("[광고] 수출 대행", { exclude: ["광고"] })).toBe(false);
  });
});

describe("설정 정규화", () => {
  /** DB 의 JSON 은 사람이 손댈 수 있다 — 범위를 넘는 값이 요청 폭주로 이어지지 않게 자른다. */
  it("페이지·기간 범위를 자르고 모르는 분야는 수출로", () => {
    expect(normalizeSourceConfig("bizinfo", { hashCode: "99", pages: 50 })).toMatchObject({ hashCode: "07", pages: 5 });
    expect(normalizeSourceConfig("googlenews", { query: "  K-푸드 ", days: 999 })).toMatchObject({ query: "K-푸드", days: 30 });
  });
});

describe("프로젝트별 시작 세트", () => {
  it("코리아 엑스포 프로젝트는 해외진출 세트로 바로", () => {
    expect(presetForProject("코리아 엑스포")?.key).toBe("export");
    expect(presetForProject("Korea Expo")?.key).toBe("export");
    expect(presetForProject("Seoul POPCON")).toBeNull();
  });
});

describe("고르기 목록에 남는 후보", () => {
  const kst = (d: string) => new Date(`${d}T00:00:00+09:00`);
  const now = kst("2026-09-23");

  it("뉴스는 기사 날짜로 14일", () => {
    expect(isFreshCandidate({ category: "news", dueDate: null, createdAt: now, publishedAt: kst("2026-09-05") }, now)).toBe(false);
    expect(isFreshCandidate({ category: "news", dueDate: null, createdAt: now, publishedAt: kst("2026-09-15") }, now)).toBe(true);
  });

  it("마감 지난 공고는 빠지고, 날짜 없는 공고는 한 달", () => {
    expect(isFreshCandidate({ category: "support", dueDate: kst("2026-09-22"), createdAt: now }, now)).toBe(false);
    expect(isFreshCandidate({ category: "support", dueDate: null, createdAt: kst("2026-08-01") }, now)).toBe(false);
    expect(isFreshCandidate({ category: "support", dueDate: null, createdAt: kst("2026-09-10") }, now)).toBe(true);
  });
});

describe("기관 칸", () => {
  /** "[기초자치단체]" 로는 어느 시·군 공고인지 알 수 없다 — 소관부처(○○시)를 쓴다. */
  it("수행기관이 종류 이름이면 제목의 시·군, 없으면 소관부처", () => {
    expect(pickBizinfoOrg("기초자치단체", "경기도", "[경기] 화성시 2027년 창업기업 CES 탐방단")).toBe("화성시");
    expect(pickBizinfoOrg("기초자치단체", "전북특별자치도", "[전북] 남원시 2026년 수출물류비 지원사업")).toBe("남원시");
    expect(pickBizinfoOrg("기초자치단체", "전북특별자치도", "2026년 수출물류비 지원사업")).toBe("전북특별자치도");
    expect(pickBizinfoOrg("광역자치단체", "부산광역시")).toBe("부산광역시");
    expect(pickBizinfoOrg("김해의생명산업진흥원", "경상남도")).toBe("김해의생명산업진흥원");
    expect(pickBizinfoOrg("", "중소벤처기업부")).toBe("중소벤처기업부");
  });
});
