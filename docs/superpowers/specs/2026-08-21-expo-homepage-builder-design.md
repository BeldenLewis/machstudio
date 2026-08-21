# 홈페이지 메뉴 — 전시 웹사이트 빌더 · CMS 설계 (v2)

작성일: 2026-08-21 · 상태: **사용자 승인 · W0 인증 관리자 미리보기 실측 PASS · W1 구현 계획 착수 가능 · 공개 출시는 별도 사용자 승인 릴리스 검증 전까지 차단** · 증거: [W0 실측 기록](../research/2026-08-21-imweb-w0/README.md)

> 세 관점 설계(A: 데이터 모델, B: 편집 UX, C: 런타임·임베드)와 적대적 비판을 통합했다.
> 갈린 곳은 전부 하나로 결정하고 근거를 남겼다. 비판의 각 지적은 §1 결정 표와 본문에서
> 반영 여부·이유를 명시한다.
> 검증한 실물: `src/app/f/[id]/loader.ts`(공통 몸통·jsonForScript·CORS 헤더 실재),
> `prisma/schema.prisma` 머리말(부분 유니크 10개 — db push 가 지움)·`WebinarEmbedSite`(793행,
> lastSeenAt/lastSeenOrigin), `src/lib/app-url.ts getPublicAppOrigin`(실재),
> `collect-form-config.ts eventInfo`(192·408·439행), 번들 실측(landing 135,445B · form 55,488B),
> `previewToken` 패턴 2벌(schema 269·1053행), `src/embed/` 4벌 + `src/generated/` 5벌.
>
> **v2 승인 변경:** 이 기능은 특정 지역·행사 일정과 무관한 범용 제품이다. 첫 출시부터 템플릿을
> 포함하고, 홈페이지 빌더가 직접 그리거나 포함하는 first-party 공개 UI는 모두 self-host Pretendard +
> Shadow DOM 경계 안에서 그린다.
> `custom-code` 안의 제3자 위젯만 서체 강제의 예외다. 자세한 확인 결과는 §12.

---

## 0. 배경

- 목적: 전시(프로젝트)마다 공식 홈페이지를 **코드(디자인) / 데이터(콘텐츠)** 로 분리해 만들고,
  아임웹 사이트에 페이지·섹션 단위로 붙이는 어드민 메뉴. 운영자는 문구·이미지·영상만 만진다.
- 사용자 확정 요구 8개: ①디자인/콘텐츠 분리 ②전시별 새 디자인 + 템플릿 ③페이지 단위 하이브리드 전환
  ④섹션 단위 스니펫 ⑤미디어 업로드+링크 ⑥키 컬러 파생 테마 ⑦하위페이지 트리
  ⑧**커스텀 코드 섹션** — 운영자가 임의 임베드 코드(인스타그램·지도·외부 위젯)를 붙여넣는 탈출구(④와 별개 방향, "둘다" 확정).
- 레퍼런스: genesis.com/kr/ko 실측 — **타입 × 변형(variant) 섹션 시스템**, 같은 타입 다중 인스턴스
  (card-dualshape ×2 실측).
- 구조 원칙: **다섯 번째 임베드 파이프라인**을 만든다. 새 entry → esbuild IIFE → 생성물 커밋 →
  "주석+번들+boot" 로더라는 배포 관례는 /f/·/w/l/ 과 동형이지만, 렌더 경계는 기존 light DOM 을
  복제하지 않고 Shadow DOM 으로 바꾼다(D22).
- 제품 범위: 특정 행사·지역·마감과 무관한 범용 전시 홈페이지 빌더다. 첫 사용 흐름은 기존 아임웹에
  **섹션을 끼워 넣는 부분 이행**으로 단순화하되, 같은 첫 출시에서 페이지 임베드와 템플릿도 제공한다.

---

## 1. 결정사항 — 세 설계가 갈린 곳의 단일화

| # | 쟁점 | 결정 | 근거 (비판 항목) |
|---|---|---|---|
| D1 | 저장·발행 모델 (A 섹션 행 / B 스냅샷 / C published Boolean) | **B 의 draft/published 스냅샷** + 섹션은 **페이지 JSONB 안**(C). A 의 섹션 행 모델 폐기 | 발행 후 자동저장이 60초 내 공개되는 실사고(1-1). 스냅샷은 페이지 단위 발행이라 섹션 행과 어색 — JSONB 가 정합. 동시 편집은 마지막 저장 승리로 명시(3-6, 웨비나 랜딩과 동급, 운영자 1~2인) |
| D2 | 섹션 스니펫 게이트 | 발행(스냅샷)과 **노출 스위치를 분리**: 페이지 `liveAt`, 섹션 `embedEnabled`(JSONB 내, 스냅샷에서 읽음). §3 상태 모델 | B 모델 단독으론 "페이지는 아직인데 섹션만 먼저" 불성립, C 는 자기 시나리오와 충돌(1-2). A 의 embedEnabled 발상을 스냅샷 모델 안에서 재구성 |
| D3 | W1 가치 명제 | **부분 이행부터**(C) — 섹션 스니펫·register-form 이 첫 사용 흐름. 페이지 임베드도 W1 에서 서빙 가능 | 기존 아임웹 정보구조·SEO·메뉴를 그대로 둔 채 작은 단위로 검증할 수 있다. 특정 행사 일정이 근거가 아니다 |
| D4 | 이름·URL·전역 | 모델 `Expo*`, 모듈 `src/lib/expo/`, 전역 `__msExpo`, 마운트 `data-mach-expo(-section)`, 라우트 `/h/`·`/hp/`, API `/api/expo/*` | "home" 은 어드민 홈과 충돌, "exhibit" 은 길다. 스니펫 속성·전역 키는 영구 호환 부담이라 착수 전 확정(1-6) |
| D5 | 미디어 슬롯 | URL 하나 저장(B/C) — `{ kind:"image"\|"video"\|"embed", url\|provider+id, posterUrl? }`. A 의 `src:"upload"\|"link"` 필드 폐기. **히어로에 embed 금지** 정규화(C) | `transformedImageUrl` 이 "우리 Storage URL 인가"를 이미 판정(1-7). vimeo 는 뺀다(2-6) — W1 youtube 도 W2 로 |
| D6 | 다국어 | 저장은 `Localized` 맵(A, `toLocalized` import), **서버가 서빙 시점에 localize 해 페이로드·런타임·편집기는 문자열만 본다** | 범용 제품은 언어 확장이 예정된 구조여야 한다. 맵을 아는 곳을 정규화 한 곳으로 좁히면 W1 단일 언어 UI 뒤에도 마이그레이션이 없다 |
| D7 | 캐시 | SWR 86400(C). 페이로드에 `serverNow` 없음 — 접수 창 판정은 /f/ 위임 | 1-4·2-2. DB 장애 시에도 전시 홈은 계속 보이는 쪽이 옳다 |
| D8 | 미리보기 | `/hp/{token}?page={pageId}` — **draft 렌더**, HTML 직서빙(`/cp/` 방식). 어드민 인접 미리보기는 **iframe**(SetupPreview 관례) — C 의 "mount 직접 호출" 가정 기각 | 1-8. `?published=1` 로 발행본 비교(B). 컨테이너 폭 시뮬레이션 토글 포함(5-2) |
| D9 | seen 비콘 | 로더 GET 이 아니라 **런타임 첫 렌더 성공 시 별도 POST** `/api/expo-embed/seen` + BOT_UA 필터 | 실물 구조(`webinar-embed/[siteId]/seen` — "GET 에 쓰기 부작용 금지, CDN 캐시 무충돌")와 A 표현의 불일치(4-1) |
| D10 | 스니펫 origin·식별자 | `getPublicAppOrigin()`(app-url.ts 실재) + **id 기반**(pageId·sid). slug 는 URL 에 쓰지 않는다 | 4-3(프리뷰 오리진 박제 결함), slug 는 운영자가 바꾸는 값. 기존 EmbedSnippetRow 의 `window.location.origin` 도 같은 수리가 필요하다는 메모를 남긴다(범위 밖) |
| D11 | 페이지 경로 | `@@unique([siteId, slug])` 사이트 전역 유일. A 의 `path` 컬럼·재계산 폐기 | 2-4. 페이지 5~10장 규모에서 부모별 동일 slug 허용 실익 없음. 부분 유니크 인덱스 신규 0개 유지 |
| D12 | SEO | `seo Json` 컬럼 없음(2-1). 메타는 **아임웹 페이지 설정 복붙 안내**(어드민이 복붙용 텍스트 제공, W2). 스니펫에 정적 텍스트 굽기 **비채택** — 편집마다 "다시 복사"는 요구 1 이 없애려던 수고의 부활 | 3-1. 한계는 §10 원칙으로 명시했고 사용자가 승인했다(§12 Q1) |
| D13 | 전환 절차·롤백 | **유일 권장 절차 = "임베드 전용 아임웹 새 페이지 + 아임웹 메뉴 링크가 라우터"**(C §9). B 의 체크리스트 UI 를 이 절차로 재작성. 롤백 = `liveAt` OFF 또는 메뉴 원복 — 자기신고 `switchedAt` 폐기(스위치가 실서빙을 바꾸므로 신고 축 불필요) | 5-1·3-4·3-5. 상태는 3상태 + lastSeenAt 관측 병기(B) |
| D14 | 섹션 편집 표면 | 좌측 섹션 내비게이터에서 하나를 선택하고, **중앙 편집 열에는 선택 섹션의 모든 값을 항상 노출**한다. 접힘 카드·모달 편집 비채택 | 가변 N개를 한 열에 모두 펼치지 않으면서도 "고치는 값은 숨기지 않는다"는 Direct Manipulation 원칙을 지킨다. 미리보기 클릭도 같은 선택 상태로 연결 |
| D15 | event-info 게이트 | 정본은 `CollectSource.formConfig.eventInfo` 참조(A) — 단 **소스 isActive 는 접수 게이트지 정보 게이트가 아니다**: 소스가 비활성이어도 eventInfo 는 읽어 서빙 | 3-2. /f/ 의 "비활성이면 formConfig 미탑재"를 그대로 이식하면 안 되는 지점 |
| D16 | 섹션 다중 번들 다운로드 | W1 은 로더 관례 유지(응답=번들+boot) + **스니펫 UI 에 "한 아임웹 페이지에 섹션 스니펫 3개 이하 권장" 명시**. 다중 Expo 번들은 W0 미실측 영역이며, W1/W2 실제 다중 스니펫 브라우저 측정에서 문제가 확인될 때 "boot 전용 응답 + 공용 번들 1회"로 분리 | expo 번들은 초기 카탈로그 기준 landing(135KB)보다 작고 CDN 압축 후 실전 비용을 모른 채 관례 첫 이탈을 감행하지 않는다. 이탈 트리거를 수치로 명시하는 쪽 선택 |
| D17 | 색 유틸 승격 | `onAccentColor`·`paperFor`·hex 검증 → `src/lib/color.ts` 승격은 **별도 커밋 + 라이브 없는 주간**에 선행 | 6-2 — LiveContentStk(라이브 시청 화면)를 건드리므로. 승격 전 W1 착수가 막히지 않게 expo 쪽은 import 경로만 바꾸면 되는 구조로 |
| D18 | 카탈로그 픽커 | W1 은 텍스트 라벨 + 한 줄 설명. 변형 썸네일 비채택 | 5-3 — 썸네일 20~30장 제작 비용이 어느 설계에도 없다 |
| D19 | 템플릿 시기 | **첫 출시 W1 포함.** `design`(기본) / `full` 두 저장 모드. 인스턴스화 때 sid·sourceRef·아임웹 URL·공개 상태·토큰은 제거 | 특정 행사 일정과 무관한 범용 제품이고 템플릿은 확정 핵심 요구다. 구조가 있는 첫 버전부터 왕복 계약을 검증해야 한다(§12 Q4) |
| D20 | 목록 화면 | 목록은 두되 **사이트가 1개면 상세로 자동 진입** | 2-7 |
| D21 | 커스텀 코드 렌더 방식 (요구 8) | **sandbox iframe(srcdoc) + 높이 postMessage** — 인라인 비채택. W1 포함 | §4 커스텀 코드 절. 스타일·호스트 격리와 임베드 innerHTML 금지 가드가 한 번에 양립한다 |
| D22 | 아임웹 스타일 격리 | 페이지·섹션·register-form 은 **open ShadowRoot** 안에 렌더. 모달·목차도 body 직계 전용 host + 별도 ShadowRoot. light DOM 슬롯·`part` 비노출 | 실물 랜딩은 아임웹 `-webkit-text-fill-color`, 폼은 태그별 `!important`에 이미 깨져 맞불 규칙이 누적됐다. 클래스 스코프는 완전 격리가 아니다 |
| D23 | 서체 | 홈페이지 빌더가 직접 그리거나 포함하는 페이지·섹션·폼·모달·목차 텍스트는 self-host **Pretendard Variable** 하나. FontFace API + 고유 family alias, 400~900, 등록번호는 tabular numerals. `custom-code` 제3자 내부만 예외 | 아임웹 동명 `@font-face`·태그별 font 규칙·외부 CDN 장애를 함께 끊는다. 사용자가 Queue B first-party 폰트를 Pretendard로 확정(§12 Q3) |
| D24 | register-form 결합 | `/f` 런타임에 **명시적 target registry + `bootInto` 계약**을 추가. Expo ShadowRoot 안 target을 instance key로 등록하고, form CSS도 같은 root에 설치 | `document.querySelector`는 ShadowRoot를 관통하지 않는다. light DOM marker는 스타일 격리를 깨므로 비채택 |

---

## 2. 데이터 모델

순수 추가 3모델(기존 테이블 컬럼 무변경, 부분 유니크 신규 0개). Prisma 관계 완성을 위해 기존
`Workspace`에 `expoSites`·`expoTemplates`, `Project`와 `CollectSource`에 `expoSites` backrelation만
추가한다(실제 기존 테이블 컬럼은 늘지 않는다). 환경을 가리지 않고 `db push`는 금지하며, checked SQL +
세션 URL(:5432) `db execute` + 기존 부분 유니크 10/10 전후 감사를 쓴다(§11).

```prisma
model ExpoSite {
  id           String    @id @default(cuid())
  workspaceId  String
  projectId    String
  name         String
  /// { accent, lightBg, darkBg } — 6자리 hex 만 통과(normalizeExpoTheme). 나머지 색은 전부 파생(§7)
  theme        Json
  /// 대표 사전등록 소스 — register-form/event-info 섹션의 기본 참조. SetNull: 소스가 지워져도 사이트는 산다
  collectSourceId String?
  defaultLocale String   @default("ko")
  /// /hp/{token} draft 미리보기 — 재발급으로 회수 (CollectSource.previewToken 패턴)
  previewToken String?   @unique
  /// 아임웹 사이트 주소 — 안내·바로가기 표시용 (검증에 쓰지 않음)
  siteUrl      String?
  deletedAt    DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  workspace     Workspace      @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  project       Project        @relation(fields: [projectId], references: [id], onDelete: Cascade)
  collectSource CollectSource? @relation(fields: [collectSourceId], references: [id], onDelete: SetNull)
  pages         ExpoPage[]

  @@index([projectId])
  @@index([workspaceId])
}

model ExpoPage {
  id        String    @id @default(cuid())
  siteId    String
  parentId  String?             // 트리(요구 7) — UI 는 깊이 2까지 (W1 평면, W2 들여쓰기)
  slug      String              // 어드민 표시·미리보기용. 임베드 URL 에는 쓰지 않는다 (D10)
  title     String
  isHome    Boolean   @default(false)  // 홈 1개 — 삭제·최상단 고정
  sortOrder Int       @default(0)

  /// 편집 상태 { sections: ExpoSectionInstance[] } — 자동저장 대상. 정규화는 src/lib/expo/config.ts
  draft       Json
  /// 발행 스냅샷 — 공개 로더가 읽는 유일한 원본. null = 미발행. 발행 = 서버 재정규화 후 draft 복사 (D1)
  published   Json?
  publishedAt DateTime?
  /// 페이지 임베드 노출 스위치 — null 이면 /h/{pageId} 는 무해한 404 주석 (D2, §3)
  liveAt      DateTime?
  /// 이 페이지에 대응하는 아임웹 페이지 URL — 이행 현황 표시·내부 링크 해석용
  imwebUrl    String?
  /// 런타임 첫 렌더 비콘이 갱신 (D9) — "붙어 있음" 관측 배지
  lastSeenAt     DateTime?
  lastSeenOrigin String?
  deletedAt   DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  site     ExpoSite   @relation(fields: [siteId], references: [id], onDelete: Cascade)
  parent   ExpoPage?  @relation("ExpoPageTree", fields: [parentId], references: [id], onDelete: Cascade)
  children ExpoPage[] @relation("ExpoPageTree")

  @@unique([siteId, slug])
  @@index([siteId, sortOrder])
}

model ExpoTemplate {          // W1 — 첫 출시부터 저장·인스턴스화까지 제공(D19)
  id          String   @id @default(cuid())
  workspaceId String   // 워크스페이스 소속 — 다음 전시(=다음 프로젝트)가 쓰는 게 존재 이유 (B §6-5)
  name        String
  description String?
  /// { version:1, contentMode:"design"|"full", theme,
  ///   pages:[{ key,slug,title,isHome,sortOrder,parentKey?, sections:[{type,variant,design,content?}] }] }
  /// design 모드가 기본이며 content 는 넣지 않는다. full 도 sourceRef 류는 전부 비운다.
  /// 섹션 sid 는 저장하지 않고 인스턴스화 때 새로 발급한다.
  snapshot    Json
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  @@index([workspaceId, createdAt(sort: Desc)])
}
```

**섹션 인스턴스** (JSONB 내부 — 정규화 단일 출처 `src/lib/expo/config.ts`):

```ts
interface ExpoSectionInstance {
  /** 편집기가 추가 시 발급(crypto.randomUUID). 불변 — 정렬·변형 전환·발행에 살아남는다.
   *  정규화는 sid 를 절대 재발급하지 않는다(스니펫 URL 이 참조). jsdom 테스트로 강제. */
  sid: string;
  type: string;      // 레지스트리 화이트리스트 — 모르는 타입은 정규화가 버린다
  variant: string;   // 타입별 화이트리스트 — 모르는 변형은 첫 변형으로 강등
  enabled: boolean;  // 페이지 렌더 포함 여부 (이중 게이트의 토글 절반)
  /** 섹션 단독 임베드 노출 (요구 4, D2). enabled 와 직교 —
   *  "부모 페이지는 안 켰지만 이 섹션만 아임웹에 끼움"이 부분 이행의 정의 */
  embedEnabled: boolean;
  design: Record<string, string>;   // 디자인 노브 — 템플릿이 가져가는 쪽 (bg:"light"|"dark" 전 타입 공통)
  content: Record<string, unknown>; // 슬롯 값 — 운영자가 고치는 쪽. 텍스트는 Localized 맵 (D6)
}
```

폐기한 것과 이유: `ExpoSection` 행(D1) · `ExpoSite.slug`/`isActive`(2-3, "나중에 필요할지도" 금지) ·
`ExpoPage.path`(D11) · `seo Json`(D12) · `switchedAt`(D13) · MediaAsset 테이블(웨비나도 URL 직저장) ·
WebinarEmbedSite 식 부착 지점 간접층(재사용 요구 없음 — A §1.2 유지).

**템플릿 저장·인스턴스화 계약(D19)**: `design` 은 theme·페이지 구조(제목·slug·홈·부모·순서)와 section
type/variant/design만 저장하고 콘텐츠 슬롯은 타입 기본값으로 만든다. `full`은 일반 텍스트·미디어·링크도
저장하지만 중첩 위치까지 재귀 순회해 모든 `sourceRef`, pageId, sid, previewToken, imwebUrl, liveAt,
published, lastSeen*을 제거한다. 각 페이지에는 원본 DB id와 무관한 template-local `key`와 `isHome`을
저장하고 `parentKey`로 트리를 복원한다. 새 사이트는 항상 비공개 초안이며 모든 사이트·페이지·섹션 ID와
previewToken을 새로 발급한다. 페이지 `liveAt=null`, 모든 section `embedEnabled=false`로 만든 뒤
`normalizeExpoConfig`를 통과한다. 대상 project가 template과 같은 workspace인지도 서버가 검증한다.

`full` 저장 시 `link.href`를 슬롯 정의에 따라 순회한다. `page:{oldPageId}`는
`template-page:{templatePageKey}`로 바꾸고, 인스턴스화가 만든 template key → new pageId 맵으로 다시
`page:{newPageId}`로 바꾼다. 원본 `ExpoSite.siteUrl` 또는 어느 `ExpoPage.imwebUrl`과 origin/path가 같은
직접 HTTP 링크는 비워 과거 아임웹 페이지를 가리키지 않게 하고, 저장 결과와 생성 직후 체크리스트에
"내부 링크 재확인"을 표시한다. 그 밖의 일반 외부 `https` 링크는 콘텐츠로 유지한다.

`full`의 Mach 업로드 미디어는 URL 문자열만 원본 사이트에 매달아 두지 않는다. 템플릿 저장 때 중복 URL을
한 번씩만 workspace 소유 `{workspaceId}/expo-templates/{templateId}/...`로 복사해 snapshot URL을 바꾸고,
사이트 생성 때 다시 `{workspaceId}/expo/{newSiteId}/...`로 복사한다. 따라서 원본 사이트를 지워도 템플릿과
새 사이트가 깨지지 않는다. 외부 미디어 URL은 복사하지 않고 그대로 유지하며 수명은 외부 제공자 책임이라는
경고를 보여준다. Storage와 DB는 원자 transaction이 아니므로 미리 발급한 id 경로에 먼저 복사하고 DB
transaction이 실패하면 이번 작업에서 복사한 객체만 보상 삭제한다. 보상 삭제 실패는 orphan 로그로 남겨
후속 청소하되 사용자에게 성공으로 응답하지 않는다. 템플릿 삭제도 자기 소유 경로만 지운다.

---

## 3. 하이브리드 상태 모델 (요구 3·4)

발행(=서빙 가능한 사본 만들기)과 노출(=실제로 나감)을 분리한다. 노출 스위치가 **실서빙을 바꾸므로**
자기신고 축이 필요 없다(D13). 판정 함수 `derivePageState(page)` 는 `expo/config.ts` 한 곳 —
목록·트리 상태점·이행 현황이 전부 이것만 읽는다(B §5 원칙 계승).

| 상태 | 판정 | 로더 동작 | 배지 | 관측 병기 |
|---|---|---|---|---|
| 초안 | `published == null` | `/h/` 404 주석. `/hp/` draft 렌더 | 회색 "초안" (+imwebUrl 있으면 "아임웹 운영중") | — |
| 발행됨 · 대기 | `published != null && liveAt == null` | `/h/` 는 **콘텐츠 없는 무해 스크립트**(런타임은 조용히 아무것도 안 그림 — /f/ 비활성 침묵 규칙). 스니펫 선부착 가능 | 파랑 "발행됨" | lastSeenAt("붙어 있음/아직") |
| 공개중 | `liveAt != null` | `/h/` 풀 서빙 (published 스냅샷) | 초록 "공개중" | lastSeenAt 5분 내 "연결됨" |

- **페이지 전환 시나리오(유일 권장 절차, D13)**: ① mach 에서 제작 → /hp/ 검수 → 발행
  ② 임베드만 담은 **아임웹 새 페이지**를 만들어 스니펫 부착(이때 lastSeenAt 이 "붙어 있음"으로)
  ③ 전환일에 `liveAt` ON + 아임웹 메뉴 링크를 새 페이지로 교체. **롤백 = 메뉴 원복 또는 liveAt OFF 한 번.**
  기존 아임웹 페이지에 직접 붙이는 방식은 "둘 다 보임" 사고를 낳으므로 문서·체크리스트에서 권장하지 않는다.
- **섹션 부분 이행**: 페이지는 초안/발행·대기인 채로, 섹션 `embedEnabled` ON + 발행 → `/h/{pageId}/s/{sid}`
  가 **published 스냅샷의 그 섹션만** 서빙. 기존 아임웹 페이지 코드블럭에 섹션 스니펫만 끼운다.
  게이트를 스냅샷에서 읽으므로 embedEnabled 토글도 발행을 거친다 — "발행 = 밖에 나가는 유일한 문"
  이라는 단일 규칙이 운영자 정신 모델을 지킨다(내리기도 토글 OFF + 발행 한 번).
- 미발행·미노출 콘텐츠는 **서버에서 뺀다** — curl 유출 방지(/w/l/·/f/ 규약). 런타임 게이트에 의존하지 않는다.

---

## 4. 섹션 레지스트리 · 카탈로그

위치 `src/lib/expo/registry.ts` — **React-free**(임베드 번들 포함). 슬롯 정의가 편집기 위젯·정규화·
렌더 처리를 동시에 결정하고(A §3), 어드민·서버·런타임이 같은 파일을 읽는다(collect-form-config 계약).
**변형은 슬롯을 공유한다** — 변형 전환에 콘텐츠 유실 없음(슬롯이 정말 달라지면 다른 타입이다).

슬롯 kind 는 7종으로 닫는다: `text`(Localized) · `textarea`(줄바꿈 보존) · `media`(D5 모델) ·
`link`(`{label, href}` — href 는 safeHttpUrl 또는 `page:{pageId}` 내부 참조, 렌더 시 imwebUrl 로 해석) ·
`list`(itemSlots 재귀 — EditableList 대상) · `sourceRef`(CollectSource id — §5) ·
`code`(원문 그대로 — 로케일 맵 아님, 20KB 상한, custom-code 전용).

### 카탈로그 초안

| 타입 | 제네시스 원형 | 변형 | 슬롯 (kind) | multi | 단계 |
|---|---|---|---|---|---|
| `kv` 키비주얼 | kv-basic | `column`(콘텐츠 폭 — **기본**) · `minimal`(텍스트만, 하위페이지 헤더). `full`은 W0에서 기존 콘텐츠와 분리된 전폭 레이아웃을 안전하게 확보하지 못해 미등록; 후속 레이아웃 재설계와 동일 geometry 재실측을 통과할 때만 재검토 | eyebrow(text) · title(text, req) · subtitle(text) · media(media — embed 금지) · cta(link) — design: overlay 강도·정렬 | ✗ 페이지당 1, 최상단 | W1 |
| `textblock` 본문 | — | `statement`(대형 한 문단) · `prose`(제목+본문) · `twocol` | heading(text) · body(textarea, req) · media(media) | ✓ | W1 |
| `cardgrid` 카드 | card-newsfeed/-multicolumn/-dualshape | `multicolumn`(3열) · `newsfeed`(태그+날짜) · `dualshape`(2장 대비) | heading(text) · items(list{media, tag(text), title(text, req), description(textarea), link(link), date(text)}) | ✓ (dualshape ×2 실측) | W1(multicolumn) → W2(나머지 변형) |
| `toolbox` 퀵 액션 | toolbox | `tiles`(4타일) · `strip`(가로 바) | items(list{icon(text), label(text, req), link(link, req)}) — 사전등록/오시는 길/브로슈어/참가신청 | ✗ | W1 |
| `register-form` ★ | — | `inline`(그 자리에 폼) · `cta`(요약+버튼) | sourceRef(기본 site.collectSourceId) · heading(text) · note(textarea) — §5 위임 | ✗ | W1 |
| `cardroller` 롤러 | cardroller-textoverlay/-imgfocus | `textoverlay` · `imgfocus` | heading(text) · cards(list{media(req), title(text, req), caption(text), link(link)}) — CSS scroll-snap, JS 자동재생 없음 | ✓ | W2 |
| `event-info` ★ | — | `bar`(한 줄) · `table`(기간·운영시간 표) | sourceRef — design: 일자/시간/장소 표시 토글. §5 resolved 계약 | ✗ | W2 |
| `faq` | — | `accordion` · `twocol` | heading(text) · items(list{category(text), question(text, req), answer(textarea, req)}) — LandingFaqItem 형태 계승 | ✗ | W2 |
| `sponsors` | — | `wall` · `tiered` | heading(text) · items(list{tier(text), name(text, req), logo(media), url(link)}) — LandingSponsorItem 계승(글자 칩 폴백 포함) | ✗ | W2 |
| `directions` 오시는 길 | — | `map`(지도 링크 카드+주소) · `cards`(교통수단별) | address(text) · mapLink(link) · transit(list{mode(text, req), description(textarea)}) · venueFrom(sourceRef, 선택) — 지도 iframe 없이 | ✗ | W2 |
| `media-banner` 브레이크 | — | `full` · `boxed` | media(media, req — embed 허용) · caption(text) · link(link) | ✓ | W2 |
| `custom-code` ★ 탈출구 | — | `boxed`(콘텐츠 폭 — 기본) · `full`(전폭) | heading(text) · code(code, req) | ✓ | W1 |

W1 = 6타입(kv·textblock·cardgrid·toolbox·register-form·custom-code): "기존 아임웹 사이트에 히어로/
소개/카드/퀵액션/사전등록 섹션을 끼워 넣는다"는 첫 실전 시나리오에 필요한 최소(6-2 반영 — A 의
7종에서 축소. faq·event-info 는 첫 부분 이행 필수가 아니라 W2). custom-code 는 슬롯 하나와 렌더러가
전부라 싸고, 카탈로그가 아직 없는 섹션의 임시 대역이 되어 W1 의 실전 투입 범위를 넓힌다.

### `custom-code` — 탈출구의 규칙 (요구 8, D21)

카탈로그가 세상 모든 위젯을 지원할 수는 없다 — 인스타그램 피드·외부 지도·타사 폼은 운영자가
발급받은 임베드 코드를 그대로 붙여넣는 것이 맞다. 결정 셋:

1. **sandbox iframe 격리가 기본이다(인라인 아님).** srcdoc iframe +
   `sandbox="allow-scripts allow-popups allow-forms"`. 셋이 한 번에 해결된다:
   ① 붙여넣은 CSS/JS 가 페이지·호스트(아임웹)를 깨뜨릴 수 없다 — 제일 자주 붙여넣는 사람이
   비개발자라 이게 결정적이다 ② `<script>` 실행 문제가 사라진다(iframe 문서는 파서가 정상
   실행하므로 innerHTML 재생성 꼼수가 필요 없다) ③ 임베드 innerHTML 금지 가드와 양립한다
   (호스트 DOM 에 원문을 꽂지 않는다). 설계 대화 초기에 "기본 인라인" 쪽으로 기울었으나
   가드·스타일 격리를 대조한 뒤 뒤집었다.
   `allow-same-origin` 은 주지 않는다 — 주면 붙여넣은 코드가 부모(파트너 페이지) DOM 에 닿아
   격리가 무의미해진다. 그 대가로 쿠키가 필요한 일부 위젯은 비로그인 모습으로 렌더되는데,
   공개 홈페이지 임베드로는 그게 맞는 모습이다.
2. **높이는 안에서 알려온다.** srcdoc 에 운영자 코드와 함께 높이 리포터를 심는다
   (ResizeObserver → `postMessage`, 부모는 `source === iframe.contentWindow` 로 대조해 높이 갱신 —
   opaque origin 이라 origin 검사가 불가능하므로 소스 대조가 정본). 위젯이 늦게 커져도 따라간다.
3. **상한과 게이트.** code 슬롯 20KB 상한(정규화에서 자름), `hasContent` = 코드 비어 있지 않음.
   발행 게이트를 그대로 타므로 **미리보기에서 먼저 보고 발행**이 흐름상 강제된다 — 커스텀 코드가
   제일 깨지기 쉬운 섹션이라 이 순서가 필수다. 페이로드는 jsonForScript 를 타므로 `</script>`
   조기 종료는 기존 규약이 막는다.

인라인 변형은 지금 만들지 않는다 — iframe 으로 실제 위젯이 안 되는 사례가 나오면 그때
"가드 예외 + 스크립트 재생성" 비용을 치른다(선례: embed-runtime.test 의 KNOWN_VIOLATIONS 목록).
이 iframe 안에서 제3자가 직접 그리는 글자는 D23 Pretendard 강제의 유일한 예외다. Mach 가 그리는
섹션 제목·안내·오류는 iframe 밖 Expo ShadowRoot에 있으므로 Pretendard 계약을 그대로 지킨다.

**정규화**: 타입별 수제가 아니라 **슬롯 정의 주도 제네릭 하나**(A §4.1) — 모르는 타입 제거, 모르는
변형 강등, kind 별 규칙(`toLocalized`·`safeHttpUrl` 은 기존 모듈 **import**, 사본 금지), required
빈 행 제거(+`keepEmptyRows` 로 편집기는 살림), **sid 불변**. 던지지 않는다. `hasContent(def, content)`
가 이중 게이트의 "내용 있음" 절반 — 발행 게이트(서버)와 런타임 방어 재검이 같은 함수를 읽는다.

---

## 5. 전시 특화 섹션 — 3자 계약 (비판 1-3 해소)

세 관점이 각자 가정하던 접점을 계약으로 못박는다.

| 층 | register-form | event-info (W2) |
|---|---|---|
| 저장(content) | `{ sourceRef, heading, note }` — 폼 상태 0바이트 | `{ sourceRef }` + design 표시 토글 |
| 편집기 UI | sourceRef → 프로젝트 내 CollectSource 드롭다운(기본 site.collectSourceId), 없으면 "사전등록 소스를 연결하세요" 인라인 경고 | 동일 + eventInfo 미설정 소스면 경고 |
| 서버(로더) | sourceId 가 **같은 프로젝트 소속인지 검증**, 아니면 뺀다(크로스테넌트 차단). 페이로드엔 sourceId 만 | 서빙 시점에 `normalizeCollectForm(...).eventInfo` 를 `resolved.eventInfo` 로 실음. **소스 isActive 무관하게 읽는다**(D15) — isActive 는 접수 게이트지 정보 게이트가 아니다. 소스 부재·eventInfo.enabled:false 만 hasContent 실패 |
| 런타임 | Expo 가 ShadowRoot 안 target을 `sourceId:view:instanceKey`로 등록 → **document head에 삽입한** `/f/{sourceId}` classic script tag의 `data-ms-form-target`로 key 전달 → 캐시된 본문의 `boot(payload, document.currentScript)`가 key를 즉시 캡처해 `bootInto` 호출. UI·폼 CSS·DOM만 같은 ShadowRoot에 설치(D24). 캐시 수명·접수 창 판정·레이트리밋은 계속 /f/ 소유 | resolved 값만 렌더 — 일정이 바뀌면 홈·폼·티켓이 60초 안에 같이 바뀐다. 수동 입력 폴백 없음(두 곳이 어긋난다) |

정확한 전달 순서는 다음과 같다. Expo는 target record
`{ container, styleRoot, preview, disposeSignal }`를 먼저 등록하고, `data-ms-form-target={key}`를 가진
classic script를 **ShadowRoot가 아닌 document head에** 삽입한다. HTML 표준상 `document.currentScript`는
document tree의 classic script에만 보장되기 때문이다. script는 UI나 style을 만들지 않는 전달자이며
load/error 후 element를 제거한다. `/f/{sourceId}`의 캐시 가능한 본문은 target별 query string이나 payload를
만들지 않고 마지막에 `__msForm.boot(payload, document.currentScript)`를 호출한다. `boot`는 동기 실행 중
`currentScript.dataset.msFormTarget`을 캡처한다. key가 있으면 registry record를 해석해
`bootInto(record, payload)`를 부르고, 없으면 기존 독립 `/f`의 document marker 탐색으로 폴백한다. target
identity는 `sourceId:view:instanceKey`이며 `view`는 `live | preview-draft | preview-published`,
`instanceKey`는 mount마다 새로 발급하므로 같은 source를 같은 페이지에 여러 번 둬도 자리를 빼앗지 않는다.

`preview`는 target metadata에서만 읽어 submit·분석·seen 등 외부 부작용을 모두 막는다. form CSS는
`record.styleRoot` 안에 한 번만 설치하고 document head에는 넣지 않는다. dispose 시 observer·listener·
DOM·registry key를 함께 정리하며 이미 끊긴 target은 조용히 no-op한다. 폼 루트 `.msf`는 Expo의 고유
`--msx-font`를 이어받아 등록번호까지 Pretendard + `font-variant-numeric: tabular-nums`로 렌더한다.
이 data attribute는 script URL이나 응답 본문을 바꾸지 않으므로 `/f` CDN 캐시 키를 분열시키지 않는다.

웨비나 랜딩은 품지 않는다 — 링크로 보낸다(C §5 유지, 요구에 없음).

---

## 6. 공개 라우트 · 런타임 · 번들

### 라우트

```
GET /h/{pageId}              페이지 임베드 (liveAt 게이트)
GET /h/{pageId}/s/{sid}      섹션 임베드 (published 스냅샷의 embedEnabled 게이트)
GET /hp/{token}?page={id}    미리보기 HTML 직서빙 (draft, ?published=1 비교, noindex, 레이트리밋)
POST /api/expo-embed/seen    첫 렌더 비콘 (BOT_UA 필터, D9)
```

공통 몸통 `src/app/h/[pageId]/loader.ts` — /f/ loader.ts 를 본뜬다(실물 확인: 공통 몸통·jsonForScript·
SCRIPT_HEADERS·OPTIONS 204 전부 실재): ① `rateLimitAsync("expo-loader:{ip}", 60/60s)` 조회 전
② 필요한 컬럼만 select ③ 없음/삭제 → 404 주석 + 엣지 캐시(없는 id 난사 방어) ④ 본문 =
`/* mach expo */\n` + EXPO_RUNTIME_JS + boot(jsonForScript(payload)) — 주석에 id 금지
⑤ ETag(본문 해시) + `CDN-Cache-Control: s-maxage=60, stale-while-revalidate=86400`(D7)
⑥ CORS `*`. `src/proxy.ts` 공개 경로에 `/h/`·`/hp/` 추가.

### 페이로드

```ts
__msExpo.boot({
  pageId, origin,
  theme: { accent, lightBg, darkBg },
  page: { title, sections: ResolvedSection[] } | null,   // 게이트 통과분만, 텍스트는 localize 완료 문자열 (D6)
  scope?: { sid },                                        // 섹션 로더만
  preview?: true,                                         // /hp/ 만 — 향후 비콘류 부작용 차단(isPreviewUrl 규칙의 임베드 번역)
})
// serverNow 없음(D7). resolved(eventInfo 등)는 섹션 객체에 병기.
```

### 번들

`src/embed/expo-entry.ts` → `src/generated/expo-runtime.ts`(커밋) + `scripts/build-expo-runtime.mjs`
+ `runtime-hash.mjs` 에 `expoSourceHash`(명시적 파일 목록) + stale 테스트 + **innerHTML 금지 디렉터리에
`src/lib/expo` 편입**. landing-runtime 확장 비채택 — 페이로드 모델·ETag 무효화 주기·135KB 실측(C §3,
4-6 이 "가장 근거 단단"으로 확인). 공유는 모듈 단위: `h()` DOM 빌더, `attachReveal`,
`transformedImageUrl`, `getYouTubeVideoId`.

부트 관례는 form/landing-entry를 확장한다. `window.__MACH_EXPO__` 레지스트리(키
`pageId:{sid|"page"}`)가 light DOM host·재사용할 open ShadowRoot·내부 renderRoot·portal host·cleanup을
한 인스턴스로 보유한다. 재진입은 기존 ShadowRoot 안을 재마운트한다. MutationObserver는 내부 DOM을
document에서 찾지 않고 host의 연결/교체만 감시하며 1분 5회 상한을 둔다. `unhideWidget`(아임웹
wg_animated), 마운트 폴백, 모든 실패 warn — 호스트를 절대 깨뜨리지 않는다(7-3: C 부트 절 확장).

#### Shadow DOM 경계(D22)

각 light DOM 마운트 요소에는 open ShadowRoot 하나를 붙이고 재마운트 때 재사용한다. 외부 스타일 확장점인
slot·`part`는 제공하지 않는다. `EXPO_CSS`는 document head가 아니라 그 ShadowRoot의
`adoptedStyleSheets`에 붙이고, 미지원 환경은 root 내부 `<style>`로 폴백한다. 내부 렌더 루트는
`all:initial` 뒤 font/color/line-height/letter-spacing/text-transform/text-fill/text-size-adjust/
color-scheme을 명시한다. 폼 컨트롤은 `font:inherit`. `rem`은 아임웹 document root의 font-size를
참조하므로 금지하고 px·em·container query를 쓴다.

모달·고정 목차는 mount 조상의 transform/overflow에 갇히지 않도록 body 직계 고유 host로 포털하되,
그 host에도 별도 ShadowRoot와 같은 stylesheet를 붙인다. 포커스 판정은 `document.activeElement` 한 번이
아니라 shadow chain을 따라가며, 생존 판정은 `isConnected`로 한다. 본문 host shell은 display·visibility·
box-sizing·width/min/max-width·height·margin·padding·border·background·opacity·transform·filter·overflow·
position/inset·z-index·pointer-events를 충돌 방지용 inline-important로 정규화하되 `width:100%`로 아임웹이
제공한 바깥 컨테이너 폭은 존중한다. portal host는 같은 시각 속성을 초기화한 뒤 body viewport 기준
fixed/inset/z-index/pointer-events 계약을 별도로 적용한다. hostile 테스트는 Shadow 내부뿐 아니라 이 두
light-DOM host도 앞·뒤 삽입 규칙으로 공격한다. 아임웹 바깥 조상 폭은 W0에서 standard·wide를 검증했고
독립 full은 확보하지 못했다. 바깥 조상 숨김·폭 제한은 내부 디자인 격리와 구분해 W1 인라인 안내로 다룬다.

#### Pretendard 단일 서체(D23)

고정 버전 Pretendard Variable WOFF2와 OFL 1.1 라이선스를 우리 오리진에서 제공한다. family name은
아임웹이 같은 `Pretendard` 이름으로 등록한 font-face를 가로채지 못하도록 내부 고유 alias
`__mach_expo_pretendard_v1`을 쓰되 실제 파일은 Pretendard다. 400~900을 한 variable face로 제공하고,
등록번호도 monospace 대신 tabular numerals를 쓴다. 외부 jsDelivr·Google Fonts·`local()`은 쓰지 않는다.

`@font-face`를 Shadow stylesheet마다 반복하지 않는다. 런타임이 Mach origin의 절대 WOFF2 URL로
`new FontFace(alias, url, { weight:"400 900" })`를 만들고 `document.fonts`에 한 번만 등록한다. 전역 CSS
선택자는 생기지 않으며 모든 mount가 레지스트리의 같은 load promise를 공유한다. `FontFace.load()` 완료
뒤 root를 전환 표시해 fallback 서체가 번쩍이는 것을 막는다. 로드 실패 시 공개 콘텐츠를 영구히 숨기지는
않고 안전 폴백으로 fail-open하되,
이는 정상 합격 상태가 아니다. 릴리스 검증은 network 200·CORS·MIME·immutable cache와 실제 Rendered
Fonts가 `__mach_expo_pretendard_v1`인지까지 확인한다. `custom-code` 제3자 iframe 내부만 이 계약의 예외다.

### 스니펫 (어드민 발급)

```html
<!-- 페이지 -->
<div data-mach-expo data-ms-page="{pageId}"></div>
<script async src="{getPublicAppOrigin()}/h/{pageId}"></script>
<!-- 섹션 -->
<div data-mach-expo-section data-ms-section="{sid}"></div>
<script async src="{getPublicAppOrigin()}/h/{pageId}/s/{sid}"></script>
```

두 빈 div는 콘텐츠를 light DOM에 받는 그릇이 아니라 ShadowRoot를 붙이는 **host**다. 런타임은 host
자체의 최소 geometry만 정규화한다. 실제 마크업·CSS는 전부 shadow boundary 안에 두고, 고유 Pretendard
family는 D23의 FontFace registry로만 등록한다.

- 게이트: 미발행이면 코드 대신 "발행 후 복사할 수 있어요"(EmbedSnippetRow 게이트 규약).
  발행됨·대기 상태에선 복사 가능 + "지금 붙여도 아무것도 안 나옵니다. 공개 스위치를 켜면 나타납니다" 안내
  (선부착 흐름의 명시).
- B 의 `/view` 폴백 라우트·정적 텍스트 굽기 비채택(D12) — 마운트 div 는 빈 채로 둔다.
- "한 아임웹 페이지에 섹션 스니펫 3개 이하 권장" 문구(D16).

---

## 7. 키 컬러 → 테마 (요구 6)

C §6 채택: 마운트 시점 **ShadowRoot 내부 렌더 루트**의 CSS 변수(`--msx-key`, `--msx-on-key`,
bg/paper 2벌) + 나머지는 `EXPO_CSS` 안 `color-mix` 파생. host document 전역 변수는 읽지 않는다.
운영자 입력은 **색 3개 상한**(accent 필수, 배경 2개는 기본값) —
랜딩의 "6개 고르게 하면 깨진다" 결론 계승. `onAccentColor`(YIQ 0.78)·`paperFor` 는 `src/lib/color.ts`
로 승격해 import(D17 — 별도 커밋, 라이브 없는 주간). 섹션 `design.bg` → `data-bg` 속성(랜딩 모드 블록
패턴). 어드민 테마 화면은 파생 칩(`--on-key` 등)을 견본으로 즉석 표시(B §4.6). 테마는 발행 스냅샷에
굽지 않고 사이트 속성으로 즉시 전 페이지 적용 — 공개중 페이지가 있으면 확인 다이얼로그(B).

---

## 8. 미디어 (요구 5)

- 슬롯 모델 D5. 업로드/링크 구분은 저장이 아니라 **입력 UI 의 두 경로** — Storage URL 여부는
  `transformedImageUrl` 이 판정.
- 업로드 API `POST /api/expo/[siteId]/media`: 세션 인증 → 멤버십 확인 → `validateLandingMedia`
  **재사용**(이미지 5MB·영상 50MB·MIME 화이트리스트) → `ensureAssetBucket()` 공유 버킷, 경로
  `{workspaceId}/expo/{siteId}/{uuid}.{ext}`.
  **"읽기만 변환" 은 쓰지 않는다** — Supabase 이미지 변환은 유료 기능이라 이 프로젝트에서 403 이
  난다(6d73cc4 실측: 변환 URL → `FeatureNotEnabled`). 정본은 그 커밋이 세운 규약 그대로
  **업로드 시점 축소**다 — 저장된 것 자체가 작으면 변환 없이도 보이고 원본 서빙이 egress 안전.
  expo 는 같은 업로드 경로를 재사용하므로 따로 할 일 없음(전제만 바로잡는다).
- 프리셋: 기존 `heroBackground`·`sessionCardPhoto` 재사용, 신규 추가는 W2 카드롤러에서만.
  링크 이미지는 변환 불가 사실을 편집기 힌트로.
- 영상: W1 제외. W2 에 업로드 mp4/webm(`autoplay muted loop playsinline`, reduced-motion 시
  poster+controls) + YouTube embed(nocookie, lazy, **히어로 금지**). vimeo·saveData 비채택(2-6).
- `IMAGE_PRESETS`·validateLandingMedia 등 라이브 화면과 공유하는 지점은 방송 없는 주간의 별도 커밋으로
  다룬다. 홈페이지 기능은 특정 행사 일정과 결합하지 않는다.

---

## 9. 어드민 화면 (요구 1·7 의 표면)

- 사이드바 7번째 `{ href:"/homepage", label:"홈페이지" }`. 목록 `/homepage`(프로젝트 문맥, 1개면 상세
  자동 진입 — D20). 상세 `/homepage/[siteId]?page=&view=` — **URL 자원의 소속이 프로젝트를 결정**
  (IA 검토 결론, 딥링크 사고 방지).
- 상세 = 3열(B §4.3): 좌 레일(테마 · 페이지/섹션 내비게이터 · 템플릿 · 이행 현황) / 중앙 편집 열 /
  우 미리보기(SetupPreview 재사용 iframe + 접기 + **컨테이너 폭 시뮬레이션 토글**). "아임웹에 붙이면
  컨테이너 폭은 달라질 수 있어요"만 고지한다. 서체·색·굵기는 달라지면 격리 실패이므로 차이라고 안내하지 않는다.
- 우측 `/hp` iframe의 Shadow 내부 섹션 클릭은 composed path에서 `sid`를 찾아
  `postMessage({ type:"mach-expo-select-section", pageId, sid, channel })`로 부모에 알린다. 부모는
  `event.source === iframe.contentWindow`, Mach preview origin, 현재 pageId와 iframe마다 발급한 channel을
  모두 대조한 뒤에만 좌측 선택 상태를 바꾼다. 이 계약이 없으면 Shadow retargeting 뒤 iframe 경계를 넘어
  클릭한 섹션을 식별할 수 없다.
- 페이지 트리: EditableList(드래그·방향키·5초 실행취소), 홈 고정, 행 인라인 이름 편집 0클릭, 상태점 =
  `derivePageState`. "+ 페이지" 는 행 즉시 생성 + 포커스(모달 없음). slug 는 이름에서 파생·소스 정규화.
- 섹션 편집기: 좌측 내비게이터 행이 핸들·타입·변형·enabled·상태 요약을 소유하고 드래그 정렬한다.
  행 또는 우측 미리보기 섹션을 선택하면 중앙 편집 열이 그 섹션으로 바뀌며, **선택 섹션의 모든 슬롯은
  접힘·모달 없이 항상 인라인 노출**한다(D14). 슬롯 kind → 위젯 매핑 7종으로 기계 생성. 중첩 list는
  표/행형 EditableList(업로드 타깃 행 ROW_KEY ref 규약 승계). 변형 전환은 값을 보존한다. enabled인데
  빈 섹션엔 "내용이 없어 나가지 않아요"를 해당 입력 가까이에 표시한다.
- 사이트 생성은 `/homepage/new`에서 `빈 사이트` 또는 `템플릿`을 고르는 전용 화면이다. 템플릿 저장은
  상단의 저빈도 액션으로 두고 `디자인만`(기본) / `디자인과 콘텐츠`를 인라인 설명과 함께 선택한다.
- 자동저장: draft 통짜 `PATCH /api/expo/pages/[id]` — `useAutosave` + 집계 표시 1곳(4-4 해소:
  섹션 행 PATCH 배선 폐기). 발행 버튼은 draft==published 이거나 saving 중이면 비활성.
- 섹션·초안 페이지 삭제는 편집 상태에서 제거한 뒤 **5초 실행취소**를 제공하고, 실행취소 시간이 지난
  결과만 자동저장한다. 확인 모달은 띄우지 않는다. 확인 단계와 danger 톤은 공개 해제, 공개중 페이지 삭제,
  공개중 테마 변경, 영구 템플릿 삭제처럼 실제 공개 상태나 복구 가능성을 바꾸는 저빈도 액션에만 쓴다.
  공개 ON은 발행 상태·설치 체크를 같은 화면에서 인라인 검증한 뒤 1클릭으로 실행한다.
- 이행 현황(레일 하단): 읽는 영역 — 헤드라인("3/7 공개중") → 다음 후보 → 표(페이지·상태·lastSeenAt·
  코드 버튼). 체크리스트는 D13 의 유일 권장 절차로 작성. W0 결과 `editorMode=placeholder`이므로
  "아임웹 편집기에서는 placeholder만 보이며, 인증 관리자 미리보기 또는 Mach 미리보기에서 렌더를 확인하세요"
  안내를 항상 붙인다. 실제 공개 화면 동작은 별도 릴리스 검증 전까지 단정하지 않는다.

---

## 10. SEO · OG — 아키텍처 한계의 고지 (비판 3-1)

임베드 모델의 비가역 귀결이라 코드로 못 고친다. 공식 원칙으로 승격:

Shadow DOM은 스타일 격리 경계일 뿐 서버 메타를 만들지 않으므로 아래 SEO·OG 한계를 개선하지 않는다.

1. Googlebot 은 대체로 색인하지만 **네이버·다음은 JS 렌더가 약하고, 카카오톡·페이스북 OG 는 영원히
   아임웹 메타만 본다.**
2. 완화: 페이지 제목·description·OG 이미지는 아임웹 페이지 설정에 복붙 — 어드민이 페이지별 복붙 텍스트
   제공(W2). 스니펫 정적 텍스트 굽기는 비채택(D12).
3. **검색 유입이 목표인 콘텐츠(보도자료·뉴스 상세)는 임베드로 만들지 않는다** — 아임웹 네이티브로
   남기는 것이 하이브리드의 정답.
4. 독립 서빙(우리 도메인 공개 HTML) 승격은 약속하지 않는다 — 첫 출시 후 별도 판단.

사용자 승인 완료(§12 Q1).

---

## 11. 검증 계획 · 롤아웃

### W0 — 인증 관리자 미리보기 실측 완료 (프로덕션 기능 코드 0줄)

[원시 JSON·판정·정리 증거](../research/2026-08-21-imweb-w0/README.md)는 사용자가 지정한 메뉴 비노출·미게시 작업 페이지에서 Publish나 권한 변경 없이 수집했다.

| 배치 | 데스크톱 1440 | 모바일 390 | 결정 |
|---|---:|---:|---|
| standard | root `1410/1440 = 0.9791666667`, bleed `1440/1440 = 1` | root `360/390 = 0.9230769231`, bleed `390/390 = 1` | PASS |
| wide | root·bleed `1440/1440 = 1` | root·bleed `390/390 = 1` | PASS |
| full | 안전한 독립 전폭 섹션 없음 | 안전한 독립 전폭 섹션 없음 | `full-layout-unavailable`, `allowKvFull=false` |

- 편집기에서 probe HTML과 외부 코드는 실행되지 않았다. `editorMode=placeholder`이며 native 모바일 캔버스는 375px, 인증 관리자 미리보기 모바일 기준은 390×844다.
- 데스크톱·모바일 인증 관리자 미리보기에서 parser onload·parser classic script·dynamic classic script가 모두 실행됐다.
- Mach CORS는 `204 / cors / ok=true`; 실제 사용한 CDN script/font와 Mach connect 중 CSP violation은 0이었다. 원본 CSP 응답 헤더는 드라이버에 노출되지 않았으므로 canonical `/h`와 self-host font CSP는 아직 증명하지 않는다.
- `attachShadow`, `adoptedStyleSheets`, `FontFace`, `document.fonts`, `ResizeObserver`, `MutationObserver`가 두 미리보기에서 모두 PASS했다.
- 고정 CDN Pretendard probe의 load/check가 PASS했고, Shadow signature는 `font-loaded`부터 `t+10000`까지 동일했다. 고유 Pretendard alias도 유지됐다.
- portal은 `t+10000`에도 fixed `(0,0)`, 1×1, visible, transform/filter none이었고, `wg_animated` 위젯은 `t+2000` 전에 자연 노출됐다.
- 임시 위젯은 설치 전 8개 → 측정 중 11개 → 제거·새로고침 후 8개로 복구됐다. marker/controller/portal/global 잔여물은 0이다.
- 결론은 **W1 구현 계획만 해제**한다. 실제 self-host Pretendard, 실제 `/h`, 실제 공개 렌더는 별도 사용자 승인 릴리스 검증 전까지 차단한다.

### W1 — 첫 출시: 부분 이행 + 템플릿 + 완전 격리

- 스키마 `ExpoSite`+`ExpoPage`+`ExpoTemplate` 순수 추가. `prisma db push`는 쓰지 않는다. checked SQL을
  만들고, 공유 프로덕션 DB 실행은 별도 승인·방송 없는 창에서 세션 URL(:5432)의 `prisma db execute`로
  한 번만 수행한다. 전후 read-only `pg_indexes` 감사로 기존 부분 유니크 인덱스 10/10 보존을 확인한다.
  배포는 **checked SQL 적용 → Expo 테이블과 인덱스 read-only 확인 → 메뉴·API 코드 배포**의 expand-first
  순서다. 스키마 준비 확인 전에는 홈페이지 메뉴와 공개 라우트를 capability gate로 숨긴다.
  `expo/config.ts` 정규화·`hasContent`·`derivePageState`·템플릿 sanitize/instantiate를 단위 테스트한다.
- `src/lib/expo/`에 registry/config/model/mount/css/font/overlay를 둔다. open ShadowRoot 본문 + body 직계
  Shadow portal, self-host Pretendard, no-slot/no-part, no-rem 계약을 한 모듈에서 소유한다(D22·D23).
  CSS 빌드 테스트는 Expo source/생성물의 `rem` 토큰을 정적으로 거부한다.
- `/f`에 target registry + `bootInto`를 추가하되 기존 독립 폼 boot를 보존한다(D24). script data attribute
  → `document.currentScript` → `sourceId:view:instanceKey` 해석 경로와 preview side-effect 차단, 같은 source를
  두 번 배치하는 경우, destroy/re-entry를 테스트한다.
- 번들 파이프라인 1벌(entry→생성물 커밋→runtime-hash→stale 테스트→innerHTML 검사 편입).
- 라우트: `/h/{pageId}` + `/h/{pageId}/s/{sid}`(공통 loader.ts) + `/hp/{token}` + seen 비콘 + proxy 등록.
- 카탈로그 6타입(kv·textblock·cardgrid·toolbox·register-form·custom-code), 이미지 업로드+링크.
- 테마 3색 + 파생(색 유틸 승격은 별도 커밋·방송 없는 주간 — D17).
- 어드민: 사이드바 7번째 홈페이지 메뉴와 `/homepage` 목록/빈 상태를 함께 출시. 3열 상세, 평면 페이지
  내비게이터, 선택 섹션 상시 인라인 편집, 자동저장, 발행/공개, 페이지·섹션 스니펫, 동일 렌더러 미리보기.
- 템플릿: `/homepage/new` 빈 사이트/템플릿 선택, `design`(기본)/`full` 저장, sanitize 후 비공개 초안
  인스턴스화. `/api/expo/templates` CRUD와 `/instantiate`는 workspace membership을 검증하고 다른
  workspace의 templateId나 projectId를 404로 숨긴다. 생성은 transaction 안에서 사이트·페이지를 만들고
  실패 시 전부 롤백한다. `isHome`·parentKey·내부 page link를 새 ID로 복원하고, Mach 미디어는
  template/site 소유 경로로 복사하며 Storage 실패를 보상 정리한다. sourceRef·지운 아임웹 링크 재연결
  체크리스트를 즉시 보여준다.
- 운영 체크리스트: 발행 → 설치 → 공개 → 아임웹 메뉴 교체 → `liveAt OFF`/메뉴 원복. 사용자가 주 운영자이며
  비개발자도 그대로 수행할 수 있는 문장으로 쓴다. 전체 이행 현황 대시보드는 W2.

### W1 검증 — 단위·구조·실브라우저·실사이트 네 겹

- Vitest: 정규화 왕복 항등·sid 보존·모르는 타입/변형 처리, 상태 전 조합, 홈 고정·slug 파생, 발행 버튼,
  변형 전환 값 보존, 템플릿의 재귀 ID/URL/sourceRef 제거, `isHome`·parent·내부 링크 remap,
  `embedEnabled=false`, 새 previewToken, cross-workspace 404, 미디어 복사 보상 정리. `preview-draft`와
  `preview-published` target은 submit·분석·seen 0건, `live` target은 기존 제출과 허용 비콘이 정확히 한 번
  실행되고 형제 target으로 새지 않는다고 별도로 단언한다.
- jsdom: 페이지·단독 섹션·3개 섹션이 각 ShadowRoot에 마운트되는지, stylesheet가 document head에
  새지 않는지, Shadow portal 수명·deep focus·재마운트 한도·호스트 sentinel 무변경, 검증된 preview
  postMessage 선택, 같은 source 폼 2개와 독립 `/f` 폴백을 검증한다. 실제 브라우저에서는 `/f` script가
  document tree에 있고 `currentScript`가 정확한 instance key를 읽으며 load 뒤 제거되는지도 확인한다.
- DB 없는 `/dev/expo-harness`와 실브라우저 스위트: clean / hostile-before / hostile-after, page / section /
  multi-section, 320·480·768·960·1440px. `*`, 제목, 본문, 링크, 버튼, 입력에 font/size/weight/color/
  line-height/letter-spacing/text-transform/padding/border/background를 `!important`로 걸고 clean과 computed
  style·bounding box·스크린샷이 같은지 비교한다. 기대 토큰 값도 별도로 단언한다.
- 폰트: 우리 HTTPS 오리진 요청만 200, WOFF2 MIME/CORS/immutable cache, 외부 폰트 요청 0,
  한글·영문·숫자 표본으로 `document.fonts.check` 400~900, 실제 Rendered Fonts=
  `__mach_expo_pretendard_v1`, 등록번호 tabular numerals, 섹션 3개 중복 전송 0을 검증한다.
- Chromium·WebKit·실제 iPhone Safari, 아임웹 편집기 placeholder, 인증 관리자 미리보기 데스크톱·모바일을 확인한다.
  실제 self-host Pretendard 파일, 실제 `/h` 런타임, 실제 공개 데스크톱·모바일 렌더는 별도 사용자 승인
  릴리스 검증에서 확인한다. 그전에는 공개 출시나 "아임웹 스타일 완전 격리" 완료를 주장하지 않는다.

### W2 — 페이지 전환 운영 + 표현력

- 이행 현황 대시보드 + ConnectionBadge. W1 체크리스트의 진행 상태를 페이지별로 모은다.
- 카탈로그: cardroller·event-info(§5 계약)·faq·sponsors·directions·media-banner, cardgrid 변형 확장.
- `kv.full`은 `allowKvFull=false`이므로 W2 기본 범위에서도 제외한다. 기존 콘텐츠와 분리된 전폭 레이아웃을
  마련하고 동일 geometry gate를 재통과할 때만 재검토한다.
- 영상 업로드·YouTube embed, 페이지 트리 깊이 2, 메타 복붙 안내, 미리보기 발행본 비교.
- 섹션 다중 스니펫 실측 → 필요 시 boot 전용 응답 분리(D16 트리거).

### W3 — 후속 확장

- 편집기 로케일 스위처(저장은 W1부터 Localized라 마이그레이션 없음).
- 기존 사이트에 템플릿의 design·variant·theme만 덮는 "디자인만 갈아입기". 새 사이트 생성용 템플릿은
  이미 W1에 있다.
- 독립 공개 HTML 서빙 승격 여부와 추가 분석 비콘은 첫 출시 실측 뒤 별도 판단한다.

---

## 12. 사용자 확인 결과 (2026-08-21 승인)

1. **SEO·OG:** §10 한계를 승인했다. 검색 유입용 보도자료·뉴스는 아임웹 네이티브로 남긴다.
2. **첫 사용 흐름:** 기존 아임웹에 섹션을 끼우는 부분 이행부터 한다. 특정 행사 일정과 무관한 범용 제품의
   낮은 위험 검증 순서다.
3. **서체·격리:** 홈페이지 빌더가 직접 그리거나 포함하는 공개 UI는 전부 self-host Pretendard. 별도
   웨비나·대회 임베드의 전면 서체 개편은 Queue B 범위가 아니다. light DOM 맞불을 폐기하고
   Shadow DOM 하이브리드(D22~D24)를 승인했다. `custom-code` 제3자 위젯 내부만 예외다.
4. **템플릿:** W3로 미루지 않고 첫 출시 W1에 저장·인스턴스화를 포함한다.
5. **아임웹 실측:** 사용자 로그인 환경의 메뉴 비노출·미게시 작업 페이지에서 게시나 권한 변경 없이
   인증 관리자 미리보기로 W0를 실측하는 데 동의했고, 공개 게시 금지를 재확인했다.
6. **운영 주체:** 사용자가 아임웹 코드블럭·게시·메뉴 링크 교체의 주 담당자다. 제품 내 절차는
   비개발자 체크리스트와 즉시 원복 단계로 제공한다.

---

## 13. v2 저장소 대조 — 재사용할 것과 복제하지 않을 것

공고 빌더와 웨비나 랜딩은 config/build-model/DOM renderer/생성물 해시/dev harness라는 **모듈 경계와
빌드 관례**의 본보기다. 그러나 둘의 document-global CSS + light DOM mount는 D22가 폐기한 구조이므로
복제하지 않는다. shell CSS를 기계 추출하더라도 결과는 Expo ShadowRoot 내부 stylesheet로만 소비한다.

| 관찰한 실물 | v2 적용 | 회귀 게이트 |
|---|---|---|
| `landing/mount.ts`가 CSS를 document head에 넣고 Pretendard를 jsDelivr에서 로드 | Expo는 ShadowRoot 내부 CSS + 우리 오리진 고정 WOFF2. 기존 랜딩 구현을 import하지 않음 | head 전역 style/font link 0, 외부 폰트 요청 0 |
| `landing/css.ts`가 아임웹 `-webkit-text-fill-color`를 `!important`로 되찾음 | 증상별 맞불이 아니라 Shadow 경계로 원인을 제거 | hostile-before/after computed style 동일 |
| `collect-form/css.ts`의 `all:initial`은 루트뿐이고 form entry가 document query | D24 target registry/`bootInto`; form DOM·CSS를 지정 ShadowRoot에 함께 설치 | 지정 target 외 DOM 무변경, 독립 `/f` 회귀 통과 |
| 랜딩 모달·목차가 body light DOM에 포털 | body 직계 **Shadow host**로만 포털. deep focus·refcount·cleanup을 새 계약으로 | 모달/목차도 hostile CSS 동일성, destroy 뒤 host 0 |
| 공고 빌더 `src/lib/notice/` 구조와 shell-sync | config/css/mount/build-model 분리는 계승. 전역 mount와 CSS 주입은 계승하지 않음 | Shadow stylesheet sync + 생성물 stale test |
| `ColorField`와 notice 색 모델 | Expo 테마 UI는 `ColorField`, 공용 color 유틸은 세 번째 사본 전에 승격(D17) | 라이트/다크 대비와 파생 토큰 단위 테스트 |
| 이미지 변환 URL이 유료 기능 403 | 업로드 시점 축소 규약 유지 | 원본/링크 이미지와 업로드 프리셋 회귀 |
| esbuild 번들의 `process.env` 잔존·플랫폼별 줄바꿈 해시 사고 | define 확인 + 줄바꿈 정규화 hash 비교 | boot smoke + generated stale test |

### v2 완료 정의

1. 사용자 결정 여섯 개와 추가 승인(범용 제품·Shadow 하이브리드)이 코드·문구·테스트에서 서로 모순되지 않는다.
2. 홈페이지 빌더가 그리는 페이지·섹션·폼·모달·목차의 실제 Rendered Font가 모두 Pretendard다.
3. 아임웹 hostile CSS가 렌더 전·후 어느 때 들어와도 내부 computed style과 geometry가 clean 기준과 같다.
4. 템플릿은 첫 출시에서 CRUD·워크스페이스 소유권·sanitize·인스턴스화까지 끝나며 모델만 존재하지 않는다.
5. 페이지/섹션 스니펫·독립 `/f`·preview·custom-code의 기존 보안·부작용 게이트가 유지된다.
