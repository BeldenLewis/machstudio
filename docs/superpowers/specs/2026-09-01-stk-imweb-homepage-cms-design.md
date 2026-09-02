# STK 아임웹 연동형 홈페이지 CMS 설계

## 1. 목적

Mach Studio의 기존 Expo 홈페이지 빌더를 확장해, STK 운영자가 코드를 직접 수정하지 않고도 `https://smarttechkorea.com/214`의 주요 커스텀 섹션을 편집·미리보기·발행할 수 있게 한다.

일상적인 운영은 Mach Studio에서 발행하면 아임웹에 자동 반영되는 동적 임베드로 처리한다. 비상 상황과 이전을 위해 현재 발행본을 독립 HTML로 내보내는 백업 경로도 제공한다.

초기 출시는 STK 메인페이지 한 장만 대상으로 한다. 기반 엔진은 다른 전시회에 재사용할 수 있게 유지하되, 첫 편집 경험은 `STK 홈페이지` 전용 템플릿과 필드로 제공한다.

## 2. 확정된 제품 결정

1. **배포 방식:** 동적 자동 반영을 기본으로 하고 HTML 내보내기를 백업으로 제공한다.
2. **페이지 소유 범위:** 아임웹 네이티브 기능과 Mach Studio 관리 섹션을 함께 쓰는 혼합형이다.
3. **캠페인 상태:** 참가기업 모집과 참관객 사전등록은 서로 독립적이며 동시에 활성화될 수 있다.
4. **전환 방식:** 각 캠페인은 일정에 따라 자동 전환하고, 운영자의 수동 덮어쓰기가 자동 일정보다 우선한다.
5. **제품 범위:** 범용 홈페이지 엔진 위에 STK 전용 템플릿·편집 화면을 얹는다.
6. **편집 화면:** 왼쪽 구조, 가운데 인라인 필드, 오른쪽 실시간 미리보기의 하이브리드 3열 편집기다.
7. **발행 권한:** 해당 프로젝트를 편집할 수 있는 팀원은 누구나 발행할 수 있다.
8. **초기 페이지:** STK 메인페이지 `/214`만 이관한다.

## 3. 현재 상태와 시작 기준

Mach Studio 최신 `origin/main`에는 다음 W1 기반이 이미 있다.

- `ExpoSite` → `ExpoPage` → `ExpoTemplate` 데이터 계층
- `draft`와 `published` JSON 스냅샷 분리
- `draftRevision` 비교-교환 기반 자동저장
- 페이지·섹션 편집, 미리보기, 발행·공개 스위치
- 페이지/섹션 단위 아임웹 삽입 코드
- Supabase Storage 이미지 업로드
- Shadow DOM CSS 격리와 재마운트 복구
- 템플릿 저장·복제

루트 체크아웃의 `main`은 최신 `origin/main`보다 97커밋 뒤에 있으므로 구현 기준으로 사용하지 않는다. 구현은 최신 `origin/main`에서 만든 격리 worktree에서 시작한다. 기존 루트의 미추적 파일과 `.superpowers/` 시각 자료는 건드리지 않는다.

## 4. 페이지 소유 경계

### 4.1 Mach Studio 관리

- Hero와 운영 모드 CTA
- 6개 전문 전시
- For Exhibitors / For Visitors
- Speakers
- Sponsors & Partners
- Final CTA

### 4.2 아임웹 유지

- Header / Navigation
- Highlight Video와 TechCon 제목 구간
- STK 뉴스룸 Board
- Newsletter / Stibee Form
- Footer
- Channel Talk

아임웹 유지 구간은 Mach Studio가 내용을 복제하거나 소유하지 않는다. Mach Studio의 목적지 레지스트리는 해당 구간의 URL 또는 앵커만 참조할 수 있다.

## 5. 전체 아키텍처

```text
Mach Studio STK Editor
  ├─ page settings: 행사 정보, 캠페인, 공통 목적지
  ├─ section plugins: Hero, 전시, Journey, Speakers, Sponsors, CTA
  ├─ media: Supabase Storage 공개 HTTPS URL
  ├─ draft autosave + PC/mobile preview
  └─ publish
       ├─ normalized published snapshot
       ├─ immutable revision history
       ├─ dynamic page/section loader
       └─ standalone HTML export

Imweb /214
  ├─ native widgets remain in Imweb
  └─ managed code widgets
       └─ one-time loader snippet → latest published snapshot
```

아임웹에는 관리 대상 섹션마다 로더 스니펫을 한 번 설치한다. 이후 콘텐츠 변경은 Mach Studio에서 발행한 스냅샷을 통해 반영한다. 아임웹 편집기나 로그인 세션을 자동 조작하지 않는다.

## 6. 페이지 설정 데이터

초기 범위는 메인페이지 한 장이므로 행사 공통값도 `ExpoPageConfig`의 발행 스냅샷 안에 넣어 섹션과 원자적으로 발행한다. 여러 페이지가 같은 값을 공유해야 하는 후속 단계에서만 사이트 수준 설정으로 승격한다.

```ts
interface ExpoPageConfigV2 {
  schemaVersion: 2;
  preset?: "stk-home-v1" | string;
  settings?: {
    event?: {
      edition: number;
      startsAt: string;
      endsAt: string;
      facts?: {
        companies?: number;
        sessions?: number;
        booths?: number;
      };
    };
    campaigns?: CampaignConfig[];
    destinations?: DestinationConfig[];
  };
  sections: ExpoSection[];
}
```

기존 `{ sections }` 데이터는 `schemaVersion: 1`로 간주해 그대로 읽는다. 정규화는 저장된 옛 데이터를 던지지 않고 안전한 기본값으로 낮춘다. 새 쓰기는 정규화 전에 구조화된 필드 오류로 거절한다.

## 7. 캠페인과 CTA 규칙

### 7.1 캠페인

```ts
type CampaignId = "exhibitor-recruitment" | "visitor-registration" | string;

interface CampaignConfig {
  id: CampaignId;
  label: string;
  startsAt: string;
  endsAt: string;
  override: "auto" | "force-on" | "force-off";
  enabled: boolean;
}
```

판정 우선순위는 다음과 같다.

1. `enabled=false`면 비활성
2. `force-on`이면 활성
3. `force-off`이면 비활성
4. `auto`면 서버의 UTC 현재 시간이 `startsAt <= now < endsAt`일 때 활성

참가기업 모집과 사전등록은 배타적인 단일 phase가 아니다. 두 캠페인은 동시에 활성화될 수 있다. 캠페인 판정은 서버가 수행하고 렌더 payload에 활성 상태를 넣는다. CDN 캐시로 인한 자동 전환 지연의 허용 상한은 60초다.

### 7.2 공통 목적지

```ts
interface DestinationConfig {
  id: string;
  label: string;
  action:
    | { type: "url"; href: string; newTab?: boolean }
    | { type: "anchor"; target: string }
    | { type: "download"; href: string }
    | { type: "imweb-modal"; modalId: string };
  analytics?: {
    eventName: string;
    contentId?: string;
  };
  enabled: boolean;
}
```

Hero, For Exhibitors/Visitors, Final CTA는 URL을 직접 중복 저장하지 않고 `destinationId`를 참조한다. 브로슈어 주소나 문의 모달을 한 번 변경하면 모든 배치가 함께 갱신된다.

### 7.3 CTA 배치

각 CTA 배치는 다음을 가진다.

- 표시 문구와 선택 설명
- `destinationId`
- primary / secondary / outline / solid 변형
- audience: all / exhibitor / visitor
- 노출할 캠페인 목록
- 같은 위치에서의 우선순위
- 캠페인이 모두 꺼졌을 때 사용할 fallback 여부

둘 다 활성화되면 Hero처럼 허용된 위치에는 우선순위에 따라 최대 두 개 버튼을 보인다. 둘 다 비활성이면 해당 위치의 fallback CTA를 사용한다. 운영자는 미리보기에서 현재 시각, 모집만, 등록만, 둘 다, 모두 종료 상태를 강제로 확인할 수 있다. 이 미리보기 전환은 초안 데이터나 실제 스케줄을 변경하지 않는다.

## 8. 섹션 플러그인

기존의 단순 `SlotDef` 레지스트리는 유지한다. STK에 필요한 복합 참조와 목록 검증을 억지로 공통 슬롯에 넣지 않고, 레지스트리 항목이 선택적인 편집기·정규화·검증·렌더 훅을 가질 수 있게 확장한다.

```ts
interface SectionPlugin extends SectionDef {
  normalize?: (raw: unknown, context: NormalizeContext) => Record<string, unknown>;
  validate?: (raw: unknown, context: ValidateContext) => FieldIssue[];
  render?: SectionRenderer;
  editor?: SectionEditorComponent;
}
```

훅이 없는 기존 섹션은 현재 범용 슬롯 경로를 그대로 사용한다. 훅이 있는 복합 섹션도 공개 payload에 실행 코드를 저장하지 않고 정규화된 데이터만 저장한다.

### 8.1 `campaign-hero`

- eyebrow
- 타이핑 문구 목록
- 접근성용 헤드라인: 비면 첫 문구에서 자동 파생
- 배경 영상과 poster 이미지
- 영상 권리 확인 상태
- overlay 강도
- 타이핑 활성·속도·유지시간
- CTA 배치 목록

영상은 Mach Storage의 MP4 또는 안전한 HTTPS 영상 URL을 허용한다. `prefers-reduced-motion`에서는 poster를 표시하고 자동 타이핑·패럴랙스를 중지한다.

### 8.2 `exhibition-grid`

- 섹션 제목
- 항목 목록: id, 순서, 제목, 설명, 목적지, SVG/이미지 심볼, 강조색

표시 숫자와 그리드 열 수는 유효한 항목 수에서 파생한다. `6`을 제목·CSS·JS에 따로 저장하지 않는다.

### 8.3 `audience-links`

- Exhibitors와 Visitors 두 audience 그룹
- 그룹 제목·설명·시각 변형
- 링크 항목: 아이콘, 문구, 공통 목적지, 캠페인 조건, 순서, 공개 여부

그룹은 고정되지만 항목은 추가·삭제·드래그 정렬할 수 있다.

### 8.4 `speaker-carousel`

카테고리:

- id, 표시명, 배지색, 그라데이션색, 순서, 공개 여부

연사:

- id, 이름, 회사, 직책, Day, categoryId, 이미지, fit, objectPosition, scale, 프로필 URL, 순서, 공개 여부

카테고리 id는 탭·필터·배지의 단일 출처다. 공개 중인 연사가 없는 카테고리는 자동으로 숨긴다. 카테고리 삭제는 참조 중인 연사를 다른 카테고리로 옮기기 전에는 거절한다.

### 8.5 `sponsor-marquee`

그룹:

- id, 제목, 순서, marquee 사용 여부, 이동 시간

스폰서:

- 이름, 로고, alt, 홈페이지 URL, groupId, 순서, 공개 여부

CMS에는 한 벌만 저장하고 무한 마퀴용 복제 트랙은 렌더러가 만든다. `prefers-reduced-motion`에서는 정적 래핑 그리드로 바꾼다.

### 8.6 `cta-band`

- 헤드라인
- audience
- CTA 배치 목록

Hero와 같은 공통 목적지·캠페인 규칙을 사용한다. `<button>`만 만들고 동작을 빠뜨리는 상태를 허용하지 않는다.

## 9. 편집기 경험

### 9.1 3열 구조

1. 왼쪽: STK 메인페이지 섹션 트리, 표시 여부, 상태, 드래그 순서
2. 가운데: 선택한 섹션의 항상 보이는 인라인 필드
3. 오른쪽: 1280×800 또는 390×844 초안/발행본 미리보기

미리보기에서 섹션을 클릭하면 가운데의 해당 편집기로 이동한다. 직접 canvas 편집은 초기 범위에 넣지 않는다.

### 9.2 목록 편집

연사·카테고리·스폰서·전시 항목·CTA는 테이블형 인라인 목록을 기본으로 한다.

- 한 행이 한 항목
- 드래그 핸들로 정렬
- 공개 여부 1클릭 전환
- 이미지 썸네일과 업로드
- 행 단위 오류 표시
- 위험한 삭제만 확인 단계

### 9.3 이미지 편집

- PNG, JPG/JPEG, SVG 업로드
- 사진은 업로드 후 긴 변 1,400px 이하의 파생본 생성
- 원본은 보존하되 공개 렌더는 최적화 파생본 사용
- 브라우저 지원 형식과 아임웹 업로드 지원 형식은 분리한다
- 연사 카드는 fit, x/y 위치, scale을 인접 미리보기에서 조정
- 모든 콘텐츠 이미지는 alt 입력 또는 장식용 표시를 요구

동적 임베드는 Mach Storage의 공개 HTTPS URL을 사용하므로 아임웹 미디어 업로드 형식 제한과 무관하다. HTML 백업도 같은 공개 URL을 사용한다.

## 10. 저장, 발행, 버전과 복구

### 10.1 자동저장

- 900ms debounce
- `draftRevision` CAS 유지
- 충돌 시 자동 병합하지 않고 저장을 멈춘 뒤 최신 데이터와 충돌 위치를 알림
- 페이지 설정과 섹션을 하나의 draft로 저장해 캠페인·CTA·렌더가 어긋난 상태로 발행되지 않게 함

### 10.2 권한

- Workspace OWNER/ADMIN: 모든 프로젝트 편집·발행·사이트 관리
- Project EDITOR: 해당 프로젝트 편집·발행
- Project VIEWER: 읽기 전용
- Workspace MEMBER이지만 해당 프로젝트 멤버가 아니면 접근 불가
- 사이트 삭제, 템플릿 영구 삭제, 미리보기 토큰 회수는 관리자만 가능

발행 라우트는 버튼 표시와 별개로 서버에서 페이지 → 사이트 → 프로젝트 소속과 역할을 다시 검증한다.

### 10.3 발행 이력

`ExpoPageRevision`을 추가한다.

```prisma
model ExpoPageRevision {
  id          String   @id @default(cuid())
  pageId      String
  sequence    Int
  snapshot    Json
  codeDigest  String
  publishedBy String
  createdAt   DateTime @default(now())
  page        ExpoPage @relation(fields: [pageId], references: [id], onDelete: Cascade)

  @@unique([pageId, sequence])
  @@index([pageId, createdAt(sort: Desc)])
}
```

발행 트랜잭션은 서버가 정규화한 draft를 `published`에 복사하고 새 revision을 기록한다. 페이지당 최근 20개 revision을 보관한다. 복구는 선택한 revision을 현재 `published`에 복사하고, 복구 행위 자체를 새 revision으로 기록한다. 감사 화면에는 발행자, 시각, 버전, 요약을 표시한다.

## 11. 동적 임베드와 HTML 백업

### 11.1 동적 임베드

- 기존 페이지·섹션 단위 스니펫을 사용
- `getPublicAppOrigin()`으로 절대 주소 생성
- ShadowRoot로 아임웹 전역 CSS와 격리
- 섹션 sid는 정렬·발행·복구에도 바뀌지 않음
- loader는 마지막 발행 스냅샷만 읽음
- 공개 응답은 60초 캐시와 stale 응답을 사용
- mount 실패 시 기존 렌더가 있으면 지우지 않고 유지
- `lastSeenAt`과 `lastSeenOrigin`으로 설치 연결 상태 표시

연결 배지는 다음 상태를 구분한다.

- 연결됨: 최근 10분 안에 예상 host에서 요청
- 확인 필요: 10분 이상 요청 없음
- 다른 주소: 최근 origin이 등록한 아임웹 URL host와 다름
- 미설치: 한 번도 요청 없음

연결 상태는 발행을 막지 않지만 발행 패널 상단에서 경고한다.

### 11.2 HTML 내보내기

- 전체 관리 섹션 또는 개별 섹션 단위로 `.html` 다운로드
- CSS와 런타임 JS는 inline
- 이미지·영상은 공개 HTTPS URL
- 외부 API나 Mach 인증 세션 없이 동작
- 내보낸 시점의 캠페인 활성 상태를 고정
- 파일 상단에 page id, revision, exportedAt, campaign state 주석 기록

HTML 백업은 비상 복구용이다. 자동 일정 전환이 필요한 평상시 운영은 동적 임베드를 사용한다. 백업을 붙인 뒤 일정이 바뀌면 새 HTML을 다시 내보내야 함을 UI에 명시한다.

## 12. 발행 전 검증과 오류 처리

### 12.1 발행 차단 오류

- 필수 문구 누락
- 종료일이 시작일보다 빠르거나 같은 캠페인
- 존재하지 않는 destination, category, sponsor group 참조
- 비활성 또는 안전하지 않은 URL
- 실행 동작이 없는 CTA
- 누락·손상된 필수 이미지
- 페이지 draft 크기와 목록 상한 초과
- 공개 연사를 가진 카테고리 삭제 시도

오류는 섹션과 필드 경로, 사용자 문구를 함께 돌려주고 편집기가 해당 행으로 이동한다.

### 12.2 경고만 표시

- 이미지 alt가 비었지만 장식용으로 표시됨
- 캠페인 fallback CTA가 없음
- 공개 항목이 없는 선택 섹션
- 아임웹 연결 상태가 오래됨
- Hero 영상 권리 상태가 확인되지 않음
- 발행본과 초안이 다름

### 12.3 공개 렌더 방어

- 섹션은 `enabled=true`와 실제 데이터가 모두 있을 때만 렌더
- 모르는 섹션과 잘못된 행은 정규화에서 안전하게 제외
- 공개 텍스트는 HTML로 실행하지 않고 text node로 렌더
- URL·앵커·modal id는 타입별 allowlist 검증
- 외부 영상과 링크는 HTTPS만 허용
- reduced-motion에서 타이핑, 패럴랙스, 마퀴를 정지

## 13. 테스트와 완료 기준

### 13.1 단위 테스트

- 참가기업/사전등록 캠페인의 4개 조합
- 일정 시작·종료 경계와 수동 override 우선순위
- CTA 배치 최대 2개, 우선순위, fallback
- destination/category/group 참조 무결성
- 옛 V1 page config의 V2 호환 정규화
- 악성 URL, 깨진 JSON, 상한 초과 거절
- revision 보관 20개와 rollback 감사 이력
- 프로젝트별 EDITOR/VIEWER 발행 권한

### 13.2 렌더 테스트

- STK 템플릿의 6개 관리 섹션
- 공개 데이터가 없는 섹션 숨김
- 연사 카테고리 필터와 순서
- sponsor track 자동 복제와 reduced-motion 정적 그리드
- Hero SR 헤드라인 자동 파생
- CTA가 실제 anchor/url/download/modal 동작을 가짐

### 13.3 브라우저 테스트

- 1280×800과 390×844 편집기·미리보기
- 미리보기 클릭 → 편집 섹션 이동
- 연사 드래그·터치·키보드 필터·lazy image
- 이미지 crop과 긴 직책·긴 카테고리 한 줄 처리
- 아임웹의 공격적인 전역 CSS 아래 Shadow DOM 격리
- snippet 재삽입과 DOM 교체 후 재마운트
- 자동저장 충돌, 발행, rollback, HTML export

### 13.4 실제 아임웹 검증

1. 비공개 테스트 페이지에 섹션 스니펫 설치
2. native 구간과 관리 구간의 순서·여백 확인
3. CTA URL·anchor·modal·분석 이벤트 확인
4. PC와 모바일에서 공개 렌더 확인
5. connection badge와 `lastSeenOrigin` 확인
6. HTML 백업을 별도 코드 위젯에서 복구 시험
7. 승인 후 `/214`를 Hero부터 섹션별로 점진 전환

공개 완료는 Mach Studio의 발행 성공만으로 판단하지 않는다. 실제 `/214` 렌더, 연결 상태, CTA 동작을 확인한 뒤 완료로 기록한다.

## 14. 현재 STK 코드 이관

현재 커스텀 코드에서 다음을 데이터로 추출한다.

- Hero 문구, 영상, 타이핑 설정, CTA
- 6개 전문 전시 제목·설명·색·심볼
- Exhibitors / Visitors 8개 항목
- 연사 28명과 카테고리 3개, 이미지 crop 값
- Sponsors 그룹 4개와 추후 실제 로고
- Final CTA 2개

이관 과정에서 함께 바로잡는다.

- `href="#"` 링크를 공통 목적지로 교체
- 동작 없는 Final CTA `<button>` 제거
- 연도와 이전 행사 표기를 행사 설정에서 파생
- 중복 Pretendard import, reveal observer, full-bleed 측정 코드를 공통 runtime으로 통합
- speaker category 문자열 중복 제거
- sponsor 마퀴 수동 복제 제거
- 상대 이미지 경로를 Mach Storage HTTPS URL로 교체

## 15. 출시 순서

1. 최신 `origin/main` 기반 격리 worktree와 현 상태 회귀 테스트
2. V2 page config, campaigns, destinations, project-scoped publish 권한, revision history
3. 복합 section plugin 계약과 STK 6개 section plugin
4. STK 전용 템플릿과 현재 콘텐츠 이관
5. 3열 편집기 필드, 캠페인 상태 미리보기, 이미지 crop UI
6. dynamic embed, connection badge, HTML export
7. 자동·렌더·브라우저 테스트
8. 비공개 아임웹 페이지 설치·검증
9. `/214` 점진 전환과 복구 훈련

각 단계는 이전 단계의 테스트를 통과해야 다음으로 진행한다. 운영 페이지 교체는 한 번에 전체를 바꾸지 않고 관리 섹션 단위로 한다.

## 16. 초기 범위에서 제외

- STK 서브페이지 이관
- 다른 전시회의 실제 템플릿 제작
- Header, 뉴스룸, Newsletter, Footer, Channel Talk 재구축
- 완전한 화면 직접 편집 canvas
- 다국어 편집 UI
- 아임웹 관리자 로그인·자동 클릭·직접 게시
- 아임웹 네이티브 Board 또는 Stibee 데이터 복제
- 정적 파일만으로 Mach Studio를 완전히 대체하는 호스팅

## 17. 성공 기준

다음이 모두 충족되면 초기 STK CMS가 완료된 것으로 본다.

1. 운영자가 코드 없이 6개 관리 섹션의 필수 콘텐츠를 수정할 수 있다.
2. 참가기업 모집과 사전등록 일정·수동 상태가 독립적으로 작동한다.
3. 두 캠페인이 동시에 활성화될 때 위치별 CTA 규칙이 정확하다.
4. 편집자가 PC·모바일 초안을 확인하고 직접 발행할 수 있다.
5. `/214`의 관리 섹션이 60초 안에 새 발행본으로 갱신된다.
6. 이전 20개 발행본을 보고 한 번에 복구할 수 있다.
7. HTML 백업이 로그인 없이 독립 렌더된다.
8. 아임웹 네이티브 구간과 기존 뉴스룸·Newsletter·Footer는 계속 동작한다.
9. 실제 공개 페이지에서 이미지, CTA, 필터, 마퀴, 모바일 동작을 확인했다.
10. 같은 엔진에서 STK 템플릿을 복제해 새 전시회 사이트를 만들 수 있다.
