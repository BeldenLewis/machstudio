# 홈페이지 메뉴 — 전시 웹사이트 빌더 · CMS 설계 (v1)

작성일: 2026-08-21 · 상태: **초안 — §12 사용자 확인 대기** · 착수 순서는 §11 (W0 실측이 먼저다)

> 세 관점 설계(A: 데이터 모델, B: 편집 UX, C: 런타임·임베드)와 적대적 비판을 통합했다.
> 갈린 곳은 전부 하나로 결정하고 근거를 남겼다. 비판의 각 지적은 §1 결정 표와 본문에서
> 반영 여부·이유를 명시한다.
> 검증한 실물: `src/app/f/[id]/loader.ts`(공통 몸통·jsonForScript·CORS 헤더 실재),
> `prisma/schema.prisma` 머리말(부분 유니크 10개 — db push 가 지움)·`WebinarEmbedSite`(793행,
> lastSeenAt/lastSeenOrigin), `src/lib/app-url.ts getPublicAppOrigin`(실재),
> `collect-form-config.ts eventInfo`(192·408·439행), 번들 실측(landing 135,445B · form 55,488B),
> `previewToken` 패턴 2벌(schema 269·1053행), `src/embed/` 4벌 + `src/generated/` 5벌.

---

## 0. 배경

- 목적: 전시(프로젝트)마다 공식 홈페이지를 **코드(디자인) / 데이터(콘텐츠)** 로 분리해 만들고,
  아임웹 사이트에 페이지·섹션 단위로 붙이는 어드민 메뉴. 운영자는 문구·이미지·영상만 만진다.
- 사용자 확정 요구 7개: ①디자인/콘텐츠 분리 ②전시별 새 디자인 + 템플릿 ③페이지 단위 하이브리드 전환
  ④섹션 단위 스니펫 ⑤미디어 업로드+링크 ⑥키 컬러 파생 테마 ⑦하위페이지 트리
  ⑧**커스텀 코드 섹션** — 운영자가 임의 임베드 코드(인스타그램·지도·외부 위젯)를 붙여넣는 탈출구(④와 별개 방향, "둘다" 확정).
- 레퍼런스: genesis.com/kr/ko 실측 — **타입 × 변형(variant) 섹션 시스템**, 같은 타입 다중 인스턴스
  (card-dualshape ×2 실측).
- 구조 원칙: **다섯 번째 임베드 파이프라인을 기존 관례 그대로 하나 더 짓는다**(C §0 채택).
  새 entry → esbuild IIFE → 생성물 커밋 → "주석+번들+boot" 로더 — /f/·/w/l/ 과 동형.
- 일정: 9/1 사전등록 오픈이 최우선이라 그 이후 착수. 10/22 LA 개최 시점에 아임웹 사이트가 이미
  운영 중일 것이므로 **첫 실전은 "기존 아임웹 사이트에 섹션 끼워 넣기(부분 이행)"** 다(비판 6-1 채택).

---

## 1. 결정사항 — 세 설계가 갈린 곳의 단일화

| # | 쟁점 | 결정 | 근거 (비판 항목) |
|---|---|---|---|
| D1 | 저장·발행 모델 (A 섹션 행 / B 스냅샷 / C published Boolean) | **B 의 draft/published 스냅샷** + 섹션은 **페이지 JSONB 안**(C). A 의 섹션 행 모델 폐기 | 발행 후 자동저장이 60초 내 공개되는 실사고(1-1). 스냅샷은 페이지 단위 발행이라 섹션 행과 어색 — JSONB 가 정합. 동시 편집은 마지막 저장 승리로 명시(3-6, 웨비나 랜딩과 동급, 운영자 1~2인) |
| D2 | 섹션 스니펫 게이트 | 발행(스냅샷)과 **노출 스위치를 분리**: 페이지 `liveAt`, 섹션 `embedEnabled`(JSONB 내, 스냅샷에서 읽음). §3 상태 모델 | B 모델 단독으론 "페이지는 아직인데 섹션만 먼저" 불성립, C 는 자기 시나리오와 충돌(1-2). A 의 embedEnabled 발상을 스냅샷 모델 안에서 재구성 |
| D3 | W1 가치 명제 | **부분 이행부터**(C) — 섹션 스니펫·register-form 이 W1 | LA 아임웹 사이트가 이미 돌아가는 현실(6-1). 페이지 통짜 전환도 같은 기계로 성립하므로 손해 없음 |
| D4 | 이름·URL·전역 | 모델 `Expo*`, 모듈 `src/lib/expo/`, 전역 `__msExpo`, 마운트 `data-mach-expo(-section)`, 라우트 `/h/`·`/hp/`, API `/api/expo/*` | "home" 은 어드민 홈과 충돌, "exhibit" 은 길다. 스니펫 속성·전역 키는 영구 호환 부담이라 착수 전 확정(1-6) |
| D5 | 미디어 슬롯 | URL 하나 저장(B/C) — `{ kind:"image"\|"video"\|"embed", url\|provider+id, posterUrl? }`. A 의 `src:"upload"\|"link"` 필드 폐기. **히어로에 embed 금지** 정규화(C) | `transformedImageUrl` 이 "우리 Storage URL 인가"를 이미 판정(1-7). vimeo 는 뺀다(2-6) — W1 youtube 도 W2 로 |
| D6 | 다국어 | 저장은 `Localized` 맵(A, `toLocalized` import), **서버가 서빙 시점에 localize 해 페이로드·런타임·편집기는 문자열만 본다** | 계약 부재로 왕복이 깨진다는 지적(1-9)의 해소 — 맵을 아는 곳을 정규화 한 곳으로 좁힌다. LA 전시라 영문이 예정된 미래(2-5), 저장만 맵이면 마이그레이션 없음 |
| D7 | 캐시 | SWR 86400(C). 페이로드에 `serverNow` 없음 — 접수 창 판정은 /f/ 위임 | 1-4·2-2. DB 장애 시에도 전시 홈은 계속 보이는 쪽이 옳다 |
| D8 | 미리보기 | `/hp/{token}?page={pageId}` — **draft 렌더**, HTML 직서빙(`/cp/` 방식). 어드민 인접 미리보기는 **iframe**(SetupPreview 관례) — C 의 "mount 직접 호출" 가정 기각 | 1-8. `?published=1` 로 발행본 비교(B). 컨테이너 폭 시뮬레이션 토글 포함(5-2) |
| D9 | seen 비콘 | 로더 GET 이 아니라 **런타임 첫 렌더 성공 시 별도 POST** `/api/expo-embed/seen` + BOT_UA 필터 | 실물 구조(`webinar-embed/[siteId]/seen` — "GET 에 쓰기 부작용 금지, CDN 캐시 무충돌")와 A 표현의 불일치(4-1) |
| D10 | 스니펫 origin·식별자 | `getPublicAppOrigin()`(app-url.ts 실재) + **id 기반**(pageId·sid). slug 는 URL 에 쓰지 않는다 | 4-3(프리뷰 오리진 박제 결함), slug 는 운영자가 바꾸는 값. 기존 EmbedSnippetRow 의 `window.location.origin` 도 같은 수리가 필요하다는 메모를 남긴다(범위 밖) |
| D11 | 페이지 경로 | `@@unique([siteId, slug])` 사이트 전역 유일. A 의 `path` 컬럼·재계산 폐기 | 2-4. 페이지 5~10장 규모에서 부모별 동일 slug 허용 실익 없음. 부분 유니크 인덱스 신규 0개 유지 |
| D12 | SEO | `seo Json` 컬럼 없음(2-1). 메타는 **아임웹 페이지 설정 복붙 안내**(어드민이 복붙용 텍스트 제공, W2). 스니펫에 정적 텍스트 굽기 **비채택** — 편집마다 "다시 복사"는 요구 1 이 없애려던 수고의 부활 | 3-1. 한계 자체는 §10 에 명시하고 착수 전 사용자 승인(§12 Q1) |
| D13 | 전환 절차·롤백 | **유일 권장 절차 = "임베드 전용 아임웹 새 페이지 + 아임웹 메뉴 링크가 라우터"**(C §9). B 의 체크리스트 UI 를 이 절차로 재작성. 롤백 = `liveAt` OFF 또는 메뉴 원복 — 자기신고 `switchedAt` 폐기(스위치가 실서빙을 바꾸므로 신고 축 불필요) | 5-1·3-4·3-5. 상태는 3상태 + lastSeenAt 관측 병기(B) |
| D14 | 섹션 카드 펼침 | **접힘 기본**(헤더에 타입·변형·토글 상시), 펼치면 인라인 편집(A). B 의 "항상 펼침" 기각 | 4-5 — 가변 N개 스택에서 정렬이 죽는다. LandingPageTab 은 6종 고정이라 성립했던 것 |
| D15 | event-info 게이트 | 정본은 `CollectSource.formConfig.eventInfo` 참조(A) — 단 **소스 isActive 는 접수 게이트지 정보 게이트가 아니다**: 소스가 비활성이어도 eventInfo 는 읽어 서빙 | 3-2. /f/ 의 "비활성이면 formConfig 미탑재"를 그대로 이식하면 안 되는 지점 |
| D16 | 섹션 다중 번들 다운로드 | W1 은 로더 관례 유지(응답=번들+boot) + **스니펫 UI 에 "한 아임웹 페이지에 섹션 스니펫 3개 이하 권장" 명시**. 실측(LA 부분 이행)에서 문제면 W2 에 "boot 전용 응답 + 공용 번들 1회" 분리 | 7-2 는 사실이나, expo 번들은 초기 카탈로그 기준 landing(135KB)보다 작고 CDN 압축 후 실전 비용을 모른 채 관례 첫 이탈을 감행하지 않는다. 이탈 트리거를 수치로 명시하는 쪽 선택 |
| D17 | 색 유틸 승격 | `onAccentColor`·`paperFor`·hex 검증 → `src/lib/color.ts` 승격은 **별도 커밋 + 라이브 없는 주간**에 선행 | 6-2 — LiveContentStk(라이브 시청 화면)를 건드리므로. 승격 전 W1 착수가 막히지 않게 expo 쪽은 import 경로만 바꾸면 되는 구조로 |
| D18 | 카탈로그 픽커 | W1 은 텍스트 라벨 + 한 줄 설명. 변형 썸네일 비채택 | 5-3 — 썸네일 20~30장 제작 비용이 어느 설계에도 없다 |
| D19 | 템플릿 시기 | W3 유지 — 단 근거를 명시하고 사용자 확인(§12 Q4): LA 는 이미 아임웹 사이트가 있어 이 시스템의 첫 "통짜 제작"은 다음 전시다 | 3-3 |
| D20 | 목록 화면 | 목록은 두되 **사이트가 1개면 상세로 자동 진입** | 2-7 |
| D21 | 커스텀 코드 렌더 방식 (요구 8) | **sandbox iframe(srcdoc) + 높이 postMessage** — 인라인 비채택. W1 포함 | §4 커스텀 코드 절. 스타일·호스트 격리와 임베드 innerHTML 금지 가드가 한 번에 양립한다 |

---

## 2. 데이터 모델

순수 추가 3모델(기존 테이블 무변경, 부분 유니크 신규 0개). dev 는 `db push`(+ensure 스크립트),
운영은 세션 URL(:5432) + `db execute` — 메모리의 Webinar DB migrations 절차.

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

model ExpoTemplate {          // W3 — 구조만 확정해 둔다
  id          String   @id @default(cuid())
  workspaceId String   // 워크스페이스 소속 — 다음 전시(=다음 프로젝트)가 쓰는 게 존재 이유 (B §6-5)
  name        String
  description String?
  /// { version:1, theme, pages:[{ slug,title,sortOrder,parentSlug?, sections:[{type,variant,design,content}] }] }
  /// 섹션 sid 는 넣지 않는다(인스턴스화 때 새로 발급). sourceRef 류는 전부 비워 저장
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
| `kv` 키비주얼 | kv-basic | `column`(콘텐츠 폭 — **기본**, 7-1 실측 전까지) · `full`(풀블리드 — 실측 통과 시) · `minimal`(텍스트만, 하위페이지 헤더) | eyebrow(text) · title(text, req) · subtitle(text) · media(media — embed 금지) · cta(link) — design: overlay 강도·정렬 | ✗ 페이지당 1, 최상단 | W1 |
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
| 런타임 | `[data-mach-form]` 마운트 + `/f/{sourceId}` 스크립트 주입(문서당 1회 가드 — **정확 매칭**, 부분 문자열 아님, 7-5). 캐시 수명·접수 창 판정·레이트리밋 전부 /f/ 소유 | resolved 값만 렌더 — 일정이 바뀌면 홈·폼·티켓이 60초 안에 같이 바뀐다. 수동 입력 폴백 없음(두 곳이 어긋난다) |

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

부트 관례는 form/landing-entry 승계: `window.__MACH_EXPO__` 레지스트리(키 `pageId:{sid|"page"}`),
재진입=재마운트, MutationObserver 재렌더 감시(1분 5회 상한), `unhideWidget`(아임웹 wg_animated),
마운트 폴백, 모든 실패 warn — 호스트를 절대 깨뜨리지 않는다(7-3: C 의 부트 절이 정본).

CSS 는 `EXPO_CSS` 한 벌 문서당 1회 주입, collect-form/css.ts 방어 규약 그대로(`.msx` 스코프,
`all:initial`+상속 재고정, `:where()` 특이도 0, 최소 `!important`, `:focus-visible` 복원).
**폰트(7-4)**: W1 은 시스템 스택(Pretendard 있으면 사용, 웹폰트 로딩 없음) — 브랜드 서체 전략은 §12 Q3.

### 스니펫 (어드민 발급)

```html
<!-- 페이지 -->
<div data-mach-expo data-ms-page="{pageId}"></div>
<script async src="{getPublicAppOrigin()}/h/{pageId}"></script>
<!-- 섹션 -->
<div data-mach-expo-section data-ms-section="{sid}"></div>
<script async src="{getPublicAppOrigin()}/h/{pageId}/s/{sid}"></script>
```

- 게이트: 미발행이면 코드 대신 "발행 후 복사할 수 있어요"(EmbedSnippetRow 게이트 규약).
  발행됨·대기 상태에선 복사 가능 + "지금 붙여도 아무것도 안 나옵니다. 공개 스위치를 켜면 나타납니다" 안내
  (선부착 흐름의 명시).
- B 의 `/view` 폴백 라우트·정적 텍스트 굽기 비채택(D12) — 마운트 div 는 빈 채로 둔다.
- "한 아임웹 페이지에 섹션 스니펫 3개 이하 권장" 문구(D16).

---

## 7. 키 컬러 → 테마 (요구 6)

C §6 채택: 마운트 시점 루트 인라인 CSS 변수(`--msx-key`, `--msx-on-key`, bg/paper 2벌) + 나머지는
`EXPO_CSS` 안 `color-mix` 파생. 운영자 입력은 **색 3개 상한**(accent 필수, 배경 2개는 기본값) —
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
- **9/1 직전 주간에는 `IMAGE_PRESETS`·validateLandingMedia 등 웨비나 공유 지점을 건드리지 않는다**(6-4).

---

## 9. 어드민 화면 (요구 1·7 의 표면)

- 사이드바 7번째 `{ href:"/homepage", label:"홈페이지" }`. 목록 `/homepage`(프로젝트 문맥, 1개면 상세
  자동 진입 — D20). 상세 `/homepage/[siteId]?page=&view=` — **URL 자원의 소속이 프로젝트를 결정**
  (IA 검토 결론, 딥링크 사고 방지).
- 상세 = 3열(B §4.3): 좌 레일(테마 · 페이지 트리 · 이행 현황) / 중앙 편집 열 / 우 미리보기(SetupPreview
  재사용 iframe + 접기 + **컨테이너 폭 시뮬레이션 토글**과 "아임웹에 붙이면 폭·글꼴이 다를 수 있어요"
  고지 — 5-2).
- 페이지 트리: EditableList(드래그·방향키·5초 실행취소), 홈 고정, 행 인라인 이름 편집 0클릭, 상태점 =
  `derivePageState`. "+ 페이지" 는 행 즉시 생성 + 포커스(모달 없음). slug 는 이름에서 파생·소스 정규화.
- 섹션 편집기: EditableList 행 = 섹션 카드. 헤더(핸들·타입·변형 Segmented·enabled Switch·⋯메뉴) 상시,
  본문은 **접힘 기본 → 펼치면 인라인**(D14). 슬롯 kind → 위젯 매핑 6종으로 기계 생성. 중첩 list 는
  중첩 EditableList(업로드 타깃 행 ROW_KEY ref 규약 승계). 변형 전환은 값 보존. enabled 인데 빈 섹션엔
  "내용이 없어 나가지 않아요" 배지(이중 게이트의 편집기 측 예고).
- 자동저장: draft 통짜 `PATCH /api/expo/pages/[id]` — `useAutosave` + 집계 표시 1곳(4-4 해소:
  섹션 행 PATCH 배선 폐기). 발행 버튼은 draft==published 이거나 saving 중이면 비활성.
- 위험 액션(공개 스위치·섹션 삭제·공개중 페이지 삭제·테마 변경)은 확인 단계 뒤, danger 톤.
- 이행 현황(레일 하단): 읽는 영역 — 헤드라인("3/7 공개중") → 다음 후보 → 표(페이지·상태·lastSeenAt·
  코드 버튼). 체크리스트는 D13 의 유일 권장 절차로 작성. "아임웹 편집기 안에서는 안 보이는 게 정상"
  안내 1줄(5-4).

---

## 10. SEO · OG — 아키텍처 한계의 고지 (비판 3-1)

임베드 모델의 비가역 귀결이라 코드로 못 고친다. 공식 원칙으로 승격:

1. Googlebot 은 대체로 색인하지만 **네이버·다음은 JS 렌더가 약하고, 카카오톡·페이스북 OG 는 영원히
   아임웹 메타만 본다.**
2. 완화: 페이지 제목·description·OG 이미지는 아임웹 페이지 설정에 복붙 — 어드민이 페이지별 복붙 텍스트
   제공(W2). 스니펫 정적 텍스트 굽기는 비채택(D12).
3. **검색 유입이 목표인 콘텐츠(보도자료·뉴스 상세)는 임베드로 만들지 않는다** — 아임웹 네이티브로
   남기는 것이 하이브리드의 정답.
4. 독립 서빙(우리 도메인 공개 HTML) 승격은 약속하지 않는다 — W3 이후 판단.

착수 전 사용자 승인 필요(§12 Q1).

---## 11. 검증 계획 · 롤아웃

### W0 — 착수 전 실측·확정 (설계보다 먼저, 코드 0줄)
- **아임웹 실측 2건**(7-1·5-4): ① 현 테마에서 코드블럭 전폭(와이드 섹션) 가능 여부 — 결과가 kv 기본
  변형을 결정(불가면 `column` 이 기본 확정) ② 편집 모드에서 스크립트 실행 여부.
- 이름·URL·마운트 속성 확정(D4 — 이 문서로 갈음), §12 사용자 확인.

### W1 — "기존 아임웹 사이트에 섹션을 끼워 넣을 수 있다" (부분 이행 성립, D3)
- 스키마 `ExpoSite`+`ExpoPage`(순수 추가, db push+ensure), `expo/config.ts` 정규화·`hasContent`·
  `derivePageState` + 단위 테스트.
- 번들 파이프라인 1벌(entry→생성물 커밋→runtime-hash→stale 테스트→innerHTML 검사 편입).
- 라우트: `/h/{pageId}` + `/h/{pageId}/s/{sid}`(공통 loader.ts) + `/hp/{token}` + seen 비콘 + proxy 등록.
- 카탈로그 6타입(kv·textblock·cardgrid·toolbox·register-form·custom-code), 이미지 업로드+링크.
- 테마 3색 + 파생(색 유틸 승격은 별도 커밋·라이브 없는 주간 — D17).
- 어드민: 목록·상세 3열, 페이지 트리(평면), 섹션 편집기(자동저장), 발행/공개 스위치, 스니펫 발급
  (페이지+섹션), 미리보기.
- 검증: `/dev/expo-harness`(전 타입×변형, `?accent=` 쿼리) + `/dev/expo-editor-harness`(상태 시나리오
  스텁) + jsdom — 정규화 왕복 항등·**sid 보존**·모르는 타입/변형 처리, 스니펫 origin
  (NEXT_PUBLIC_APP_URL 회귀)·발행 게이트, derivePageState 전 조합, 트리(홈 고정·slug 파생), 발행 버튼
  비활성 조건, 변형 전환 값 보존.

### W2 — 페이지 통짜 전환 운영 + 표현력
- 이행 현황 대시보드 + 체크리스트(D13 절차) + ConnectionBadge.
- 카탈로그: cardroller·event-info(§5 계약)·faq·sponsors·directions·media-banner, cardgrid 변형 확장,
  kv `full`(W0 실측 통과 시).
- 영상 업로드·YouTube embed, 페이지 트리 깊이 2, 메타 복붙 안내, 미리보기 발행본 비교.
- 섹션 다중 스니펫 실측 → 필요 시 boot 전용 응답 분리(D16 트리거).

### W3 — 전시 간 재사용
- `ExpoTemplate` 저장/인스턴스화(정규화 통과, **sourceRef 전부 비움** + 연결 체크리스트, 새 사이트는
  미발행 시작, "텍스트 비우고 저장" 옵션).
- 편집기 로케일 스위처(저장은 W1 부터 Localized — 마이그레이션 없음), "디자인만 갈아입기"(design·
  variant·theme 만 적용) — 구조는 W1 에 이미 있음.
- 방문 비콘 + preview 가드 실전화, 독립 서빙 승격 여부 판단.

---

## 12. 사용자 확인 필요

착수 전에 답이 필요한 것만 남긴다(확정 7개는 다시 묻지 않는다).

1. **SEO·OG 한계 승인(§10)** — 네이버 검색·카톡 공유 미리보기는 아임웹 메타에 의존하고, 검색 유입
   목표 콘텐츠는 아임웹 네이티브로 남긴다는 원칙을 수용하는가? 이는 임베드 아키텍처의 비가역 귀결이다.
2. **W1 가치 명제** — "기존 아임웹 사이트에 섹션 끼워 넣기(부분 이행)부터"(본 설계 채택)가 맞는가,
   아니면 LA 이전에 페이지 통짜 전환(예: 오시는 길 페이지 전체)을 먼저 쓸 계획이 있는가? 후자면 W1/W2
   경계는 유지하되 이행 현황 화면을 W1 로 당긴다.
3. **브랜드 서체** — W1 은 시스템 폰트(Pretendard 폴백)로 나간다. 전시별 브랜드 웹폰트가 필요한가?
   필요하다면 폰트 파일 소유·라이선스·서빙 주체(우리 오리진 vs 아임웹)를 정해야 한다(§6, 7-4).
4. **템플릿 W3 배치 동의** — LA 는 이미 아임웹 사이트가 있어 이 시스템의 첫 "통짜 새 전시 홈페이지"는
   다음 전시(도쿄/파리)다. 그래서 템플릿(요구 2)을 W3 에 뒀다 — LA 이전에 템플릿 저장이 필요한
   시나리오가 있는가?
5. **아임웹 실측 협조(W0)** — 현재 LA 아임웹 사이트의 관리자 접근으로 ① 코드블럭 전폭 배치 가능 여부
   ② 편집 모드 스크립트 동작을 확인해야 kv 기본 변형이 확정된다. 실측 가능한 계정/시점은?
6. **전환일 운영 주체** — D13 절차(아임웹 새 페이지 + 메뉴 링크 교체)를 수행하는 사람이 운영자 본인인가?
   맞다면 체크리스트 문구를 비개발자 기준으로 쓰고, 아임웹 메뉴 편집 권한이 없는 운영자가 있다면 절차를
   재검토해야 한다.

---

## 13. v1.1 부록 — 문서 작성 직후 랜딩한 선행물 대조 (2026-08-21)

이 문서의 본문은 대회 **공고 상세페이지 빌더**(0b2cc42, #118~#144)가 main 에 들어오기 직전의
저장소를 기준으로 작성됐다. 공고 빌더는 이 설계와 같은 문제(섹션 기반 페이지 + 랜딩 껍데기 재사용 +
키컬러)를 한 페이지 규모에서 이미 풀었다 — expo 는 **세 번째 소비자**다. 본문 결정은 유지하되
다음이 갱신된다:

| 본문 | 갱신 | 근거 |
|---|---|---|
| §6 "공유는 모듈 단위" | **껍데기는 공고 방식으로 추출한다** — `scripts/build-notice-shell-css.mjs` 가 랜딩 CSS 에서 중립 구획을 기계 추출하고 shell-sync 테스트가 갈라짐을 CI 에서 막는 것이 증명됐다. expo 도 같은 스크립트 계열(`build-expo-shell-css.mjs`)로 뜨거나, 소비자가 3이 된 시점이므로 껍데기를 공용 모듈로 승격하는 안을 W1 에서 비교한다(승격이면 공고 쪽과 협의 필수 — 남의 코드다) | 0b2cc42 커밋 메시지가 "옮겨 적다 한 줄 흘리면 같은 함정" 을 이유로 명시 |
| §7 키컬러 | `src/components/ui/ColorField.tsx`(공용)와 `src/lib/notice/config.ts` 의 색 모델(키컬러·보조·버튼)이 실물로 생겼다. expo 테마 UI 는 ColorField 재사용. **색 구현이 이미 2벌**(STK·notice)이므로 D17 의 색 유틸 승격은 "하면 좋음" 에서 "3벌째 만들기 전 필수" 로 승격 | 7bdac49 |
| §8 미디어 | 본문 수정 완료 — 변환 URL 은 403(유료 기능), 정본은 업로드 시점 축소 | 6d73cc4 |
| §11 W1 검증 | 두 함정 추가: ① 번들에 `process.env` 참조가 남으면 로드 즉시 죽는다 — esbuild define 확인 + 부트 스모크 테스트(5c44b94 재발 방지) ② 생성물 해시는 줄바꿈 정규화 후 비교(07be56d) | 실제 사고 2건 |
| §5 웨비나 랜딩 | 공고 빌더의 `src/lib/notice/` 구조(config/css/mount/shell-css/build-model + dev 하니스 2벌)가 expo 모듈 구조의 **직접 본보기**다 — `src/lib/expo/` 를 같은 꼴로 | 0b2cc42 |