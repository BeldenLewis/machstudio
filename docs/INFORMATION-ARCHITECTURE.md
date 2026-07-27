# mach studio — 전체 정보구조 (IA)

> **실측 기준** — 커밋 `c6d1dcd` (`feat/landing-links-timetable`), 2026-07-27.
> 페이지 28개 · API 라우트 136개 · 비-API 라우트 핸들러 6개 · Prisma 모델 42개 · `src/lib` 모듈 46개.
> 이 문서의 모든 경로·라벨·순서는 코드에서 읽은 값이다. 추정한 곳은 그렇다고 적었다.
> 그림: [`information-architecture.svg`](information-architecture.svg) · [`.png`](information-architecture.png)
>
> [`IA.md`](IA.md) 와의 관계 — 그쪽은 v1.0(2026-07-20)이고 §5 가 **제안 중인 타깃 IA** 다.
> 이 문서는 제안을 담지 않은 **현재 구현 전수 조사**다. 값이 어긋나면 이 문서가 최신이다.

---

## 0. 이 문서를 읽는 법

**"면(surface)"이 단위다.** 라우트가 아니라 *사용자가 마주하는 하나의 화면 상태*를 센다. 이 앱에서 둘은 자주 어긋난다 —
`/webinar/[slug]/live` 는 라우트 1개인데 면은 4개(대기·입장 확인·시청·종료)이고, `/webinar/[slug]` 는 라우트 1개인데 탭 4개 × 섹션 6개 × 시청 상태 4개가 URL 쿼리로 갈린다.
반대로 `/settings` 는 라우트가 있지만 면은 0개다(`redirect()` 뿐).

**세 개의 층으로 나눠 본다.**

| 층 | 인증 | 무엇 | 면 수 |
|---|---|---|---|
| **공개 면** | 없음 | 시청자·외부 수신자가 보는 것. 토큰 또는 slug 로만 도달 | 약 60 |
| **앱 면** | Supabase 세션 | 운영자가 만들고 다루는 것. 사이드바 셸 안 | 약 120 |
| **관리자 면** | 세션 + `User.isSuperAdmin` | 제품 전체 운영 | 8 |

**스코프 사슬이 IA의 척추다.**

```
User ──(WorkspaceMember: OWNER|ADMIN|MEMBER)── Workspace
                                                  │
                                    ┌─────────────┼──────────────┐
                            Project │      워크스페이스 자산      │
                                    │  UTM 규칙 · 약관 템플릿      │
                                    │  API 토큰 · 활동 로그        │
          ┌──────────┬──────────┬───┴──┬─────────┐
     CollectSource  Dashboard  Webinar  UTMLink  AdPerformanceBatch
          │                       │
     CollectRecord          WebinarSession · Registration · QA · Poll · Survey …
```

거의 모든 화면은 **워크스페이스 하나 + 프로젝트 하나**가 걸린 상태에서만 의미가 있다. 그 선택은 사이드바에 있고, URL 쿼리가 단일 소스다.

---

## 1. 진입 계층 — 인증과 셸

### 1.1 비로그인 진입

| 경로 | 면 | 비고 |
|---|---|---|
| `/` | 로그인 (이메일·비밀번호 / Google) | 좌 폼 + 우 WebGL 스모키 배경·후기 카드 |
| `/signup` | 가입 (이름·이메일·비밀번호·확인) | Supabase Auth 계정만 생성 |
| `/reset-password` | 재설정 메일 발송 | `redirectTo = {origin}/auth/callback?next=/reset-password/update` |
| `/reset-password/update` | 새 비밀번호 저장 (8자+ · 확인 일치) | 성공 → `/?reset=success` |
| `/auth/callback` *(route handler)* | 세션 교환 후 302 | `?next` 또는 `/dashboard`. **워크스페이스 유무를 확인하지 않는다** |

**강제 온보딩이 없다.** 예전에는 워크스페이스 0개면 온보딩으로 보냈으나 제거했다 — 0개는 정상 상태다.
대신 두 장치가 그 상태를 받는다:

- `ensureAppUser()` — 로그인 시점에 DB `User` 행을 보장한다. 없으면 초대 대상으로 보이지 않고(`관리자 → 사용자` 목록은 `prisma.user` 기준) 초대 자체가 "가입된 계정이 없어요"로 실패한다. *(실측 2026-07-27: Auth 9개 중 DB 행 4개)*
- `WorkspaceGate` — 워크스페이스 0개면 각 화면의 빈 상태 대신 **"아직 워크스페이스가 없어요"** 안내로 받는다. 주 메시지는 "초대를 기다린다", 직접 만들기는 보조 위계. `/settings` 와 `/admin/*` 은 예외로 통과시킨다.

### 1.2 앱 셸 — `(app)` 그룹 레이아웃

데스크톱은 `lg:ml-64` 고정 사이드바 + 라운드 카드형 `main`, `lg` 미만은 상단 고정 바 + 화면 하단 floating "메뉴" 버튼 + 바텀시트(같은 `aside` 를 `translate-y` 로 전환).

사이드바 구성 — **위에서 아래 순서 그대로**:

1. **워크스페이스 스위처** — 이니셜 배지 + 이름 + 부라벨 "워크스페이스". 전환 / 설정 / 생성
2. **프로젝트 선택기** — 전환 + 행 단위 이름 변경·삭제 + 새 프로젝트
3. **주 내비게이션** (`navItems` 배열 순서)
   | 라벨 | 경로 |
   |---|---|
   | 대시보드 | `/dashboard` |
   | 사전등록 | `/collect` |
   | 광고 성과 | `/analytics` |
   | UTM 빌더 | `/utm-builder` |
   | 웨비나 | `/webinar` |

   활성 항목은 `layoutId="nav-active-bg"` 스프링 배경 + 바이올렛 텍스트 + 아이콘 1.15배.
4. **관리자** — `isSuperAdmin` 에게만. `ShieldCheck` 아이콘, 별도 블록
5. **알림** — 벨 + 미읽음 배지(9 초과는 `9+`), 30초 폴링. 클릭하면 사이드바 오른쪽 고정 패널
6. **테마 토글** — `html.dark` + `localStorage['mach_theme']`
7. **프로필 메뉴** — 최하단, 위로 열림

### 1.3 설정은 페이지가 아니라 모달이다

`/settings` → `redirect("/dashboard")`, `/settings/workspace` → `redirect("/settings")` → 다시 `/dashboard`. **면이 0개인 2단 리다이렉트**다.
실제 설정 UI 전부가 사이드바 모달로 이동했다:

| 모달 | 내용 |
|---|---|
| **워크스페이스 설정** | 탭 3개 — **일반**(이름·멤버·역할·제거·이메일 초대 + OWNER 전용 삭제) / **UTM 규칙**(프리셋·템플릿) / **약관**(전문 템플릿) |
| **프로필 설정** | 이름 인라인 편집. 이메일은 "변경 불가" |
| **알림 설정** | 인앱 알림 종류 체크박스 |
| **API 토큰** | 워크스페이스 PAT 발급·목록·폐기. "토큰은 발급 직후 한 번만 표시" |
| **알림 패널** | 인앱 인박스. **워크스페이스 초대 수락/거절의 유일한 UI** |
| **프로젝트 권한** *(`/collect` 에서)* | 프로젝트 단위 권한 오버라이드 — VIEWER / EDITOR / ADMIN |

> 워크스페이스 설정 모달은 **역할로 탭 수가 달라지는 유일한 화면**이다. MEMBER 는 "일반" 하나뿐이어서 탭 바가 사라지고 구분선만 남는다. (→ §8.1)

---

## 2. 대시보드 — `/dashboard`

사이드바 첫 항목. 화면 안 제목은 **"실시간 보고서"**. 위젯을 조립하는 화면이 아니라 **고정 순서의 보고서 한 장**을 기간·필터로만 다시 그린다. 원천은 `CollectRecord` (사전등록 수집 데이터).

| 순서 | 섹션 | 내용 |
|---|---|---|
| — | **보고서 필터** | "필터" 버튼으로 펼침. *"선택한 조건은 실시간 보고서 전체에 적용됩니다."* 수집 폼 + UTM 3종 + 기여 기준 |
| 1 | **오늘의 사전등록 흐름** | 핵심 3지표 → 기간 합계 → 신규/중복 → 추이 차트 3개 → 요일·시간 히트맵. 우상단 "업데이트 {KST}" |
| 2 | **주요 관람객 구성** | 등록 응답에서 자동 추출한 차원별 상위 5개 막대. 차원은 **코드 고정**(산업/업종, 직무/직책, 관심 분야, 회사/기관), 값이 있는 것만 최대 4개 |
| 3 | **유입 경로** | UTM 순위. 탭으로 소스 / 매체 / 소스·매체. 막대는 **섹션 최댓값 대비** 상대 길이(퍼센트가 아니다) |
| 4 | **이메일 도메인** | "등록자 회사·기관 분포 (TOP 10)" |

**공유** — 헤더 "공유" 버튼 → 모달. *"{프로젝트명} · 최근 30일 실시간 등록 현황을 읽기 전용으로 공유합니다"*. 프로젝트 단위 토큰 발급·회전·비밀번호.

그 뒤에 **도달하기 어려운 실행 계층**이 하나 더 있다 — 위젯 보드(`Dashboard` + `DashboardWidget`, 위젯 타입 12종)와 예약 리포트(`ScheduledReport`, Slack/이메일). API 는 다 있는데 편집 UI 가 없다. (→ §8.5)

---

## 3. 사전등록 — `/collect`

외부 사이트(주로 아임웹) 폼에 스크립트를 심어 제출 데이터 + UTM 유입을 "수집 소스"로 모으고, 그 레코드를 끝까지 운영하는 영역. API 라우트 24개로 앱에서 가장 두꺼운 운영면이다.

**`/collect`** — 현재 프로젝트의 소스 목록. 생성 · 이름 인라인 수정 · 활성 토글 · 삭제 · 백업 복구 · 프로젝트 권한 진입.

**`/collect/[id]`** — 소스 하나의 운영 화면. 헤더(아이콘·이름·설명·사이트 URL 외부링크·활성 토글) + **탭 7개**:

| 탭 | 무엇을 하는 곳 |
|---|---|
| **수집 데이터** | 레코드 테이블(서버 페이지네이션·검색·필터·정렬). 선택 삭제 · CSV 내보내기 · 컬럼 표시 토글 · 행 클릭 → 상세. 더보기에 가져오기/정규화/중복정리/백업 |
| **필드** | 폼 `form-group` 인덱스 ↔ 저장 키/라벨/타입 매핑을 **테이블형 인라인 편집**. 스크립트가 실제 제출에서 감지한 필드를 한 번에 적용 |
| **스크립트** | 설치 코드 발급 + 폼 감지 페이지 패턴 + 가져오기 중복 판정 기준 필드 + 설치 전 필드 자동 감지 |
| **설치** | 제출 성공 판정과 후속 이동 — "성공 트리거 텍스트", "제출 후 리다이렉트 URL (선택)" |
| **설정** | 알림 · 웹훅 · CORS · API 키 · 자동 보관 기간 |
| **데이터 관리** | 백업 다운로드 · GDPR 검색·삭제 · 위험 영역(전체 삭제) |
| **활동** | 이 소스의 활동 로그(기본 최근 100건). 한글 라벨 + 요약 + KST + 행위자 |

**모달 7개** — 레코드 상세 / 엑셀·CSV 가져오기(2단계 위저드, 헤더 자동 탐지, 대량은 4000건 분할) / 중복 정리(dry-run → 확인 → 실행) / 데이터 정규화(공백·이메일 소문자·휴대폰 숫자만) / GDPR 검색·삭제 / **모든 레코드 삭제**(소스 이름 타이핑 + 체크박스 + 서버측 카운트 일치 3중 확인) / 스크립트 설치 테스트(1단계 HTML 정적 검증 → 2단계 실제 제출 폴링 2초 간격 최대 2분).

**공개 면 1개** — `/s/[id]` : `utmScript` + 수집 script 를 이어붙인 1줄 설치용 공개 JS.

---

## 4. 광고 성과 — `/analytics`

Google / Meta / LinkedIn 리포트 파일(또는 Google Sheets)을 프로젝트 단위로 가져와 읽는 영역. **탭이 아니라 위→아래 섹션 + 세그먼트 컨트롤** 구조.

- **성과 범위** — 매체(ALL/GOOGLE/META/LINKEDIN) 카드 → 캠페인 → 광고세트 **3단 드릴다운**. 선택이 KPI·차트·테이블 전체에 반영되고 헤더에 스코프 라벨("전체 매체 · 캠페인명 · 광고세트명")로 표시
- **소스 관리** *(우측 드로어)* — 업로드 배치 이력 확인·삭제, 소스 추가 진입
- **소스 추가** *(드로어)* — 파일/Sheets URL → 헤더 자동 인식 → 컬럼 매핑 → 미리보기 → 가져오기
- **공유** *(모달)* — `/share/analytics/[token]` 발급·비활성화·회전·비밀번호

정규화 정본은 `src/lib/ad-parse.ts` (`SourceType` 4종, `AdColumnKey` 18종). 원본 행은 `AdPerformanceRecord.raw` 에 보존한다.

---

## 5. UTM 빌더 — `/utm-builder`

- **목록** — 그룹 뷰 2종: **날짜별**(`createdAt` 상대 날짜) / **캠페인별**(`utm_campaign` + 그룹 헤더에 source 배지들). 행은 이름(없으면 URL) + 원본 URL + source/medium/campaign 배지 + "단축 완료" 배지, 호버 액션 5개(복사·수정·복제·새 탭·삭제)
- **행 펼침** — 배포에 필요한 산출물을 한 자리에(전체 URL · 단축 URL · QR)
- **생성 드로어 2모드** — **기본**(질문형 라벨, 최소 입력) / **고급**(URL × source × medium 데카르트 곱 일괄 생성, 원시 파라미터명을 라벨로). 수정·복제 드로어는 기본 모드 레이아웃 재사용

**규칙값의 집은 여기가 아니다** — 드롭다운·추천값·템플릿(`UTMPreset`, `UTMTemplate`)은 **워크스페이스 설정 모달 → UTM 규칙** 에서만 고친다. 빌더 화면에는 그리로 가는 링크가 없다. (→ §8.6)

**공개 면** — `/r/[code]` : 7자 코드를 `longUrl` 로 302. 실제 단축링크 진입점.

---

## 6. 웨비나

앱에서 가장 큰 도메인. API 라우트 57개(`/api/webinars/*` 38 + `/api/webinar/*` 19), 모델 21개.

### 6.1 목록 — `/webinar`

워크스페이스·프로젝트 스코프 웨비나 목록 + 등록자 수(`_count.registrations`) + 상태 배지. 여기서 **웨비나 만들기 / 다른 웨비나에서 복제** 모달을 연다. 복제는 같은 워크스페이스 안에서 `theme`·`config`·`components`·`sessions`(연사 정보 포함)를 가져온다.

> **주의** — 목록은 `webinar.id` 로 링크하는데 라우트 파라미터 이름은 `[slug]` 다. (→ §8.4)

### 6.2 허브 — `/webinar/[slug]`

헤더: 이름 · 일정 · 등록자 수 · 상태 배지 · 라이브 URL 복사 · 라이브 페이지 열기 · 미리보기 · **`···` 더보기**(현재 항목은 "웨비나 삭제" 하나 — 파괴 액션을 편집 화면 밖으로 옮긴 결과).

**상위 탭 4개** (`type Tab = "create" | "deploy" | "operate" | "analytics"`). 위치(탭·섹션·시청 상태)는 **URL 쿼리가 단일 소스**다.

```
/webinar/[slug]?tab=create      만들기 — 사실 한 벌 + 네 산출물 + 거울
              ?tab=deploy       배포 — 아임웹 부착의 단일 창구
              ?tab=operate      운영 — 라이브 콘솔 · 등록자
              ?tab=analytics    분석 — 끝난 뒤 읽기
```

### 6.3 만들기 탭 — `?tab=create`

좌측 레일(3그룹 6칸) + 본문 헤더(섹션 라벨·설명·**자동저장 표시 1개**) + 우측 인접 미리보기의 3열 셸.
레일 설명: *"외부 페이지와 운영 기본값을 정리합니다."*

| 그룹 | `sec=` | 라벨 | 태그라인 |
|---|---|---|---|
| **사실** | `source` | 원본 정보 | *"이름·일정, 진행 순서, 브랜드 — 네 산출물이 모두 여기서 읽어갑니다."* |
| **산출물** | `landing` | 랜딩 페이지 | *"외부 사이트에 임베드하는 상세페이지 — 히어로·소개·프로그램·FAQ를 구성합니다."* |
| | `registration` | 등록 폼 | *"사전등록에서 수집할 항목과 동의 문구를 설정합니다."* |
| | `watch` | 시청 화면 | *"등록자가 라이브 전·중·후에 보는 한 몸의 화면 — 상태별로 골라 편집합니다."* |
| | `survey` | 설문 | *"자체 설문을 만들어 종료 화면·라이브 푸시·링크로 응답을 모읍니다."* |
| **확인** | `check` | 노출 점검 | *"어떤 요소가 어느 공개 면에 나가는지 한 자리에서 봅니다 — 읽기 전용이에요."* |

**원본 정보** 안에 대문자 표지(`AreaDivider`)로 갈린 세 영역:
- 이름·일정 — 일정 캘린더는 정해진 값이면 한 줄, 고칠 때만 펼침
- **진행 순서** — 한 행 = 한 칸. 유형 5종(오프닝 · 세션 · Q&A · 휴식 · 클로징), 순서·제목·시간, 연사 이름 / 소속·직책 / 약력·경력 / 홈페이지 / SNS 링크(최대 6) / 연사 사진, 로고, 세션 내용
- 브랜드 — 키·배경·서피스·텍스트 컬러 + 폰트 5종 + 테두리 둥글기 4종 + 카드 미리보기. `theme` 컬럼만 PATCH

**시청 화면** 은 한 라우트(`/webinar/[slug]/live`)의 네 순간을 세그먼트로 고른다. `?st=` 가 단일 소스:

| `st=` | 무엇 |
|---|---|
| `waiting` | 대기·입장 화면 요소 토글 + 캘린더 링크 |
| `entry` | 라이브 중 미인증 방문자의 입장 확인 화면 — 현재 토글 1개 |
| `live` | 방송 중 — 영상 소스, 안내 문구, CTA 카드, 알림 카드, 참여 구성(채팅·Q&A) |
| `ended` | 방송 후 — 인사말, 요소 토글, 설문 연결 3택, 자료·다음 웨비나 |

**노출 점검** 은 값의 집이 아니라 **조건을 읽는 거울**이다(6면 × 요소 표, "사용 안 함" 상태 포함). 좌측 레일의 준비 상태 미터가 이 리포트에서 파생된다.

**인접 미리보기 패널** — 목업이 아니라 **실물**이다. 공개 페이지를 소유자 미리보기 파라미터로 iframe 에 그대로 띄운다. 데스크톱/모바일 폭 전환 · 새로고침 · 새 탭 · 접기.

### 6.4 배포 탭 — `?tab=deploy`

아임웹 부착의 단일 창구. 카드 순서:

1. **랜딩 페이지 임베드** — 사이트 연결과 독립. 직접 링크(`{origin}/webinar/{slug}/landing`) + 임베드 코드(아임웹 HTML 위젯)
2. **하단 배너 문구** — 상태별 4칸 인라인 편집 + 자동저장. 순서: 사전등록 중 / 라이브·입장 중 / 시작 전 / 종료 후. 비우면 웨비나 이름 기반 기본 문구(placeholder 가 그 기본값)
3. **아임웹 사이트 연결** — 사이트당 1회 부착. 사이트별 연결 배지 · **노출 웨비나 전환** · 부착 스니펫 · 라이브 페이지 URL · 배너 표시 범위
4. **컴포넌트 위치 지정** *(기본 접힘)* — 마운트 마커 3종: 히어로 버튼 / 사전등록 폼 / 라이브 시청. 하단 배너는 마커 없이 자동
5. **아임웹 부착 순서** *(기본 펼침)* — 비개발자용 5단계 가이드

> `WebinarEmbedSite` 는 **프로젝트 단위 공유 자원**인데(`activeWebinarId` 하나만 외부에 노출) 편집 진입점이 개별 웨비나의 이 탭 하나뿐이다. (→ §8.7)

### 6.5 운영 탭 — `?tab=operate`

세그먼트 컨트롤 2개. 기본은 라이브 콘솔.

#### 라이브 콘솔 (`sec=console`) — 레이아웃이 상태에 따라 두 벌

**공통**
- **상태(커맨드) 바** — 상태 배지(시작 대기 / 등록 중 / LIVE / 종료) + "수동 전환됨" 배지 + 새로고침 + 신선도 배지 + 라이브 시계 + 자동/등록 중/라이브/종료 세그먼트 전환
- **실시간 지표 6칸** — 현재 시청(대형 숫자 + 스파크라인 + "최근 90초 · 피크 N") → 입장률 → 입장(사전등록 N) → 페이지 유지(최근 5분) → 평균 접속(분) → 대기 질문(>0이면 주황)
- **동시 접속 추이** — canvas 직접 렌더. 동시(면적+라인) · 입장(점선) · 채팅(하단 막대, 자체 스케일) + 운영 이벤트 마커 + 호버 툴팁. 범위 토글 전체/60분/30분
- **러닝오더** — 세션 시각(HH:MM)을 웨비나 KST 날짜에 앵커링해 진행 중/다음/완료/예정 판정. 세션이 아닌 항목은 유형 배지, 휴식만 회색
- **문의·폼 응답** — CTA 폼·설문 응답 최신순 피드. 전체 + 폼별 필터 칩(응답 1건 이상만), 행 펼침
- **시청자** — 현재 접속자 미리보기 표(이름/회사/접속 분/상태). **서버가 상위 8명만** 내려주고 배지 숫자는 집계값(`presenceViewers`)
- **운영 로그** — 이 웨비나 최근 활동 24건을 한글 라벨로
- **라이브 전 준비** — 등록 중·시작 대기 + 입장 0명일 때만 뜨는 4칸 체크리스트(등록 폼 / 등록자 / 세션 구성 / 영상 연결), 각 칸이 해당 화면으로 점프

**라이브 레이아웃**
- **인터랙션** *(통합 송출 카드)* — 타입별 현재 항목을 한 행씩 토글 스위치로. 헤더 배지 "N개 송출 중" / "대기", ⚙ 로 우측 **인터랙션 설정 드로어**(Esc · Tab 트랩 · 스크롤 잠금 · 포커스 복원). 활성 투표가 있으면 카드 하단에 실시간 집계 프리뷰
- **Q&A 대기열** — 대기 건수 배지 + 공개 범위 라디오(오픈형/폐쇄형) + "추천순" 배지
- **채팅 모더레이션** — "켜짐/꺼짐" + 시청자 채팅 스위치, 최근 100건 피드(고정 최상단) + 모더레이션 클러스터 + 진행자 컴포저

**비라이브 레이아웃** — 같은 기능의 두 번째 표현. 아코디언 3그룹:
- **인터랙션 · 한 번에 하나만** — 공지 / 팝업 푸시 / 실시간 투표
- **참여 관리** — Q&A 모더레이션 / 실시간 채팅
- **발송** — 설문 푸시 / Tally 설문 푸시 / 알림 발송

**종료 상태** — **방송 요약** 4칸 recap(누적 입장 / 평균 접속 / 피크 동시 / 입장률) + "등록자 내보내기 (CSV) →".

#### 등록자 (`sec=registrants`)

요약 카드 → 도구 바 → 표 → 페이지네이션.

- **요약 카드 5개** — 사전 등록 → 입장(입장률 %) → 현재 시청(초록) → 미입장 → 설문 참여(참여율 %, 보라). **검색 필터와 무관한 전체 집계**
- **표** — 1행 = 1명. 열 순서: 체크박스 / 이름 / 연락처(2행에 이메일) / 소속(2행에 부서) / 직함 / 업종 / 마케팅 / **설문** / **문의** / 접속 / 최초 입장 / 등록일 / 상태 / 관리
- **상세 드로어** — 위에서 아래로: 편집 필드 → 등록 시 추가 응답(읽기 전용) → 동의 → 접속 메타 → **설문 응답** → **남긴 문의** → 저장/삭제
- **CSV / 텍스트 일괄등록** — 헤더가 있으면 별칭 자동 매핑, 없으면 순서 기반. 중복 처리 모드 + 상위 5명 미리보기 + 실패 행 목록
- **CSV 내보내기** — 기본 필드 + 커스텀 문항 + UTM + **설문 응답 열** + **문의(Q&A) 열**. 헤더와 값 함수를 짝으로 묶어(`src/lib/webinar-registrant-csv.ts`) 어긋나지 않게 만들었고, 수식 인젝션을 중화한다

### 6.6 분석 탭 — `?tab=analytics`

위에서 아래로 읽는 단일 스크롤. **수동 새로고침만**(폴링 없음).

| 순서 | 섹션 |
|---|---|
| 1 | **요약 KPI 8칸** — 총 등록 / 실제 입장 / 피크 동시 / 평균 시청 / 30분+ 체류 / Q&A / 채팅 / 리마인더 옵트인 |
| 2 | **시청·참여 타임라인** — recharts ComposedChart: 동시 시청(면적) + 누적 입장(점선) + 채팅(우축 막대) + 운영 이벤트 세로 점선. 이벤트 칩 최대 12 |
| 3 | **참여 성적표** — 좌: 투표 결과(선택지별 표·%, 최다 강조) / 우: Q&A(총 건수·답변율 + 상위 질문). 부제에 채팅 참여율·CTA 클릭 |
| 4 | **설문 결과** — 문항 타입별 집계: rating(평균 + 5~1 분포) / nps(점수 + 0~10 막대) / single·multiple(선택지 막대) / text(상위 5건 + 외 N건). "개별 응답 보기" |
| 5 | **리드 스코어링** — 0~100 참여 점수. 분포 스택 바(핫·웜·콜드·노쇼) + 상위 참여자 목록 |
| 6 | **참가 퍼널** — (페이지 방문) → 사전 등록 → 실제 입장 → 30분+ → 60분+ |
| 7 | **일자별 등록 추이** |
| 8 | **유입 채널별 성과** — 소스/매체 × (방문)/등록/(등록률)/입장/입장률 |
| 9 | **캠페인별 성과 · 광고비** — 광고 성과에 같은 캠페인명이 있으면 광고비를 붙여 CPR·CPA |

---

## 7. 관리자 — `/admin`

슈퍼어드민 전용. 상단 8개 지표 칩 + 좌측 "관리 메뉴" 6개 뷰의 **단일 페이지**(뷰 전환은 `?view=`). 헤드라인 *"관리 업무를 메뉴별로 나눠서 봅니다."*, 우측 "로그인 {이메일}" 배지, 액션 성공 시 `?message=` 초록 배너.

| `view=` | 무엇 | 액션 |
|---|---|---|
| *(개요)* | 다음 행동을 고르는 진입. 4개 카드에 현재 수치를 박아 넣음 | 뷰 이동만 |
| `system` | DB 응답 · 필수 환경변수 존재 · 수집 운영 신호 | **읽기 전용** |
| `users` | 최근 가입 7명(검색 시 결과 7명) 카드 + "관리 열기" 안에 소속·활동 이력 | 회원 삭제 · 슈퍼어드민 부여/회수 |
| `workspaces` | 최근 수정 7개 + 소유자·규모 | 이름 변경 · 보관/복구 · 영구 삭제 |
| `projects` | 좌 프로젝트 7개 / 우 수집 소스 7개 | 프로젝트 이름·설명 저장 + 보관/복구, 소스 활성/중지 |
| `activity` | 전체 워크스페이스 최근 `ActivityLog` 12건 | 없음 |

---

## 8. 공개 면 — 비로그인 도달 지도

로그인 면과 달리 **인증이 아니라 토큰·slug 가 접근을 결정한다**. 세 계통으로 갈린다.

### 8.1 계통 A — 토큰 공유 링크 (`/share/*`)

| 경로 | 토큰의 집 | 무엇 | 편집 화면 |
|---|---|---|---|
| `/share/analytics/[token]` | `Project.analyticsShareToken` | 광고 성과 최근 30일 요약. 필터·드릴다운·상세 테이블 없음 | `/analytics > 공유` 모달 |
| `/share/dashboard/[token]` | `Project.dashboardShareToken` | 실시간 보고서. **앱과 똑같은 `RealtimeReport` 컴포넌트 재사용**, 기간 30일 고정, 필터 컨트롤 없음 | `/dashboard > 공유` 모달 |
| `/share/[token]` | `Dashboard.shareToken` | 위젯 보드. 12열 그리드에 위젯 `width`(full/half/third)대로 배치, 위젯별 공개 API 개별 호출 | **없음** (→ §9.5) |

셋 다 `deletedAt` 을 확인한다 — 프로젝트를 보관하면 **즉시** 닫힌다.

### 8.2 계통 B — 스크립트 배포 면 (route handler 4개)

전부 인증 없음 · CORS `*` · noindex. **페이지가 아니라 응답이 산출물**이다.

| 경로 | 응답 | 비활성/삭제 시 |
|---|---|---|
| `/w/[id]` | 웨비나 임베드 로더 JS. 본문은 사이트 ID만 다른 정적 코드, 설정은 런타임에 `/api/webinar-embed/{id}/config`(sessionStorage 60초 SWR) | `WebinarEmbedSite.deletedAt` 확인 → 404 |
| `/w/l/[slug]` | 랜딩 런타임 번들 + `__msLanding.boot({slug, origin, webinar})` — **데이터를 스크립트에 실어 요청 1회** | 비공개면 payload 미포함 |
| `/s/[id]` | 사전등록 수집 스크립트(`utmScript` + collect script) | 200 + 경고 주석 |
| `/r/[code]` | 302 → `longUrl` | **조건 없이 리다이렉트** (→ §9.10) |

호스트 사이트의 마운트 지점:

| 마커 | 무엇 |
|---|---|
| `[data-ms-landing-mount][data-ms-slug]` | 랜딩 부착. 아임웹 위젯 숨김 해제, 옛 iframe 제거, 호스트 재렌더 감시(1분 5회 한도) 재마운트, 히어로 가시성을 `<html data-ms-landing-hero>` 로 게시(로더 배너와 겹침 방지) |
| `[data-mach-webinar-mount="hero-button"]` | 상태별 CTA — 등록중 "웨비나 사전등록" / 입장 열림 "웨비나 입장하기"(+"사전등록하기") / 종료 `endedLinks` 또는 "만족도 조사 참여하기" / 그 외 "사전등록 마감"(비활성) |
| `[data-mach-webinar-mount="register-form"]` | 등록 폼 → `/api/webinar/{slug}/register` 직행. 허니팟(`_hp`) · UTM 봉투(`_utm`) · 실시간 중복 확인 · 복수선택 상한 잠금 |
| `[data-mach-webinar-mount="live"]` | `/webinar/{slug}/live` iframe + `mach-resize` postMessage(해당 프레임이 보낼 때만 신뢰) 자동 높이. slug 가 바뀌면 재렌더 |
| *(마커 없음)* 하단 배너 | 사이트 전역 상태 알림 한 줄 + CTA. 종료 / 입장(LIVE·OPEN 배지) / 등록중(사전등록 배지) / 시작 대기 4분기 |
| *(마커 없음)* 등록 폼 모달 | 폼 마운트가 없는 페이지에서 배너 CTA·랜딩 히어로 CTA(`machstudio:open-register`)가 여는 모달. 스크롤 잠금·ESC·포커스 트랩을 로더가 책임진다 |

### 8.3 계통 C — 웨비나 시청자 면

#### 랜딩 — `/webinar/[slug]/landing`

단독 페이지 / 어드민 미리보기 / 외부 임베드가 **같은 렌더러**(`src/lib/landing`)를 쓰는 얇은 셸. 데이터는 `/api/webinar/[slug]/info` 1회 fetch.
런타임은 커밋된 esbuild 번들 `src/generated/landing-runtime.ts` (재생성: `node scripts/build-landing-runtime.mjs`, `predev`/`prebuild` 에도 걸려 있음).

**렌더 순서** (`mount.ts`):

```
히어로 → 인트로(About) → Sessions → Time Table
  → [dark-zone: Programs → Highlights → Audience → Join → FAQ]
```

| 섹션 | 내용 |
|---|---|
| **히어로** | 브랜드 라벨 · 대형 타이틀(줄 단위) · 부제 · 일시+장소 · **상태별 CTA**. 배경은 `heroMedia`(image\|video) |
| **About** | 인트로 카피 + 스크롤 큐. `id="lnd-about"`, 목차 라벨 "About" |
| **Sessions** | **실제 세션(`isRealSession`)만** 카드로. 시간·제목·연사(이름/소속)·"자세히 보기". `detailPopup` 이면 카드가 `button` 이 되고 연사 상세 팝업을 연다 |
| **Time Table** | 한 줄 = 한 세션(**전체 유형 포함**). 접힌 줄은 시각·제목(+유형 태그)·`"이름 \| 소속·직책"`, 상세/로고가 있으면 `details` 로 펼침(높이 애니메이션은 JS) |
| **Programs** | 아이콘+제목+설명 카드 그리드 |
| **Highlights** | `01`, `02`… 번호 붙은 베네핏 카드 |
| **Audience** | "이런 분들께 추천합니다" 체크 목록. 아이콘 비우면 ✓. Join 바로 위, dark-zone 안(키컬러가 비치지 않게) |
| **Join** | Step 1..N 절차 카드 + *"{일시} 라이브 시작 · 사전 등록 후 입장 안내를 보내드려요"* |
| **FAQ** | 카테고리 탭(제어형, `role="group" aria-label="FAQ 카테고리"`) + `details` 아코디언. 첫 항목만 열린 채 시작 |
| **섹션 목차** | 좌측 세로. 실제로 그려진 섹션만. 스크롤 스파이가 `aria-current` |
| **연사 상세 팝업** | 세션 시간·제목·설명 + 연사 사진/이름/소속 + 약력 + "홈페이지 바로가기" + **하단 SNS 아이콘 줄**. `body` 직계 레이어 + 스크롤 잠금 + 포커스 트랩 + ESC |

#### 라이브 — `/webinar/[slug]/live` : 한 URL, 네 면

서버 상태머신(`resolveWebinarStatus`)이 `view` 3값(`signup`/`live`/`ended`)을 내리고, `registrationId` 유무가 그중 하나를 다시 갈라 **면 4개**가 된다.

| 면 | 조건 | 내용 |
|---|---|---|
| **대기** (`PreLiveWaiting`) | `view=signup` | 히어로(이름·설명) + Days/Hours/Min/Sec 카운트다운 + "{일시} 라이브 시작" + 중앙 행동 카드 + CTA 3종 + `[이 웨비나는 / 세션 순서]` 2단 + **"N명이 함께 기다려요" 밴드**(2명 이상) |
| **입장 확인** | `view=live`, `registrationId` 없음 | 대기와 같은 히어로·아젠다에 카운트다운 자리만 인증 카드로. 전화/이메일 세그먼트 + "웨비나 입장하기" |
| **시청** (`LiveContentStk`) | `view=live` + `registrationId` | 아래 표 |
| **종료** (`EndedScreen`) | `view=ended` | 감사 인사 + 다시보기 / 설문 카드 N장 / 받아가세요(자료) / Next Webinar / 공유 |

**시청 면 구성** — 상단바(LIVE · 시청자 수 · 웨비나명 · 공유) + 16:9 YouTube 플레이어 + 메타(지금/다음 세션·제목·설명·연사) + 참여 독 + 하단 카드 + 안내 문구.

| 탭 | 내용 |
|---|---|
| **Q&A** | 세션 칩 선택 + "궁금한 걸 질문해보세요" + 전송, 아래 추천순 보드(▲ 추천, 이름 마스킹, "답변 완료" 배지) |
| **채팅** *(조건부)* | 피드(HOST 태그 · 마스킹된 이름) + "메시지 보내기…" |
| **세션** | 전체 목록 + 상태(완료/진행 중/다음/예정) + 진행 중 프로그레스 바. 자정 넘김(`dayOffset`) 보정 |

**푸시 레이어** — 운영 콘솔에서 ON 한 인터랙션을 `/live-state` 폴 결과로 받아 띄운다. 닫은 항목은 우하단 "알림" 버튼(개수 배지)으로 다시 열림.
**상단 배너 3종** — 공지(accent 배경 띠) / 송출 질문 / 고정 메시지(뒤 둘은 높이 애니메이션).

부속 면: 사전등록 폼 모달 · **사전등록 완료 팝업**(자동으로 닫지 않는다) · 약관 전문 팝업(본문이 설정된 경우에만 텍스트 클릭으로, 체크 토글은 체크박스에서만) · 종료 화면 설문 팝업(새 창 대신 이 자리에서 — 자료·다음 웨비나 맥락 유지) · **소유자 미리보기 전환 바**(*"실제 전송·입장·집계 없음 · 팝업·투표 등 라이브 푸시는 표시되지 않아요"*).

#### 설문 — `/webinar/[slug]/survey/[surveyId]`

종료 화면·이메일 링크에서 오는 단독 응답 페이지. 웨비나명 키커 + 제목·설명 + `SurveyForm`. 테마는 `/info` 의 `theme` 로 STK 토큰 구성.

`SurveyForm` 은 설문 노출 경로 전부가 공유한다 — 필수 미응답은 문항 바로 아래 인라인(*"필수 항목이에요 — 답해주세요."*) + 첫 오류로 스크롤, `localStorage` 임시저장/복원.

---

## 9. 데이터 모델 — 42개

`enum` 은 `Role`(OWNER·ADMIN·MEMBER) **하나뿐**이다. 나머지 상태·유형은 전부 `String` + 코드 화이트리스트.

### 9.1 도메인별 목록

| 도메인 | 모델 |
|---|---|
| **인증·조직** (9) | `User` `Workspace` `WorkspaceMember` `WorkspaceInvitation` `Notification` `NotificationPref` `ApiToken` `ActivityLog` + `Role`(enum) |
| **프로젝트** (2) | `Project` `ProjectMember` |
| **광고 성과** (2) | `AdPerformanceImportBatch` `AdPerformanceRecord` |
| **UTM·링크** (4) | `UTMPreset` `UTMTemplate` `UTMLink` `ShortLink` |
| **수집** (4) | `CollectSource` `FieldMapping` `CollectRecord` `CollectRetentionPolicy` |
| **대시보드·리포트** (3) | `Dashboard` `DashboardWidget` `ScheduledReport` |
| **웨비나 코어** (3) | `Webinar` `WebinarSession` `WebinarRegistration` |
| **웨비나 인터랙션** (12) | `WebinarQA` `WebinarQAVote` `WebinarAnnouncement` `WebinarPopup` `WebinarPopupClick` `WebinarPoll` `WebinarPollOption` `WebinarPollVote` `WebinarChatMessage` `WebinarReminder` `WebinarTallyPush` |
| **웨비나 설문·배포·계측** (5) | `WebinarSurvey` `WebinarSurveyResponse` `WebinarEmbedSite` `WebinarAttendanceSegment` `WebinarVisitStat` |

### 9.2 관계 규칙

- **Cascade 3계층** — `Workspace` → (멤버·프로젝트·UTM·링크·프리셋·템플릿·초대·수집소스·레코드·활동로그·대시보드·위젯·예약리포트·API토큰·웨비나·임베드사이트·광고배치) → 각자의 자식
- **`SetNull` 은 5곳뿐** — `AdPerformanceImportBatch.uploadedBy` · `ActivityLog.source` · `ActivityLog.user` · `WebinarPopupClick.popup` · `WebinarEmbedSite.activeWebinar`. *사람·팝업·전시 웨비나가 사라져도 기록은 남긴다*
- **`registrationId` 를 가진 모델이 8개인데 FK+cascade 가 걸린 건 `WebinarAttendanceSegment` 하나**다. 나머지 7개는 FK 없는 소프트 참조 → 등록자 삭제는 반드시 `src/lib/webinar-registrant-delete.ts` 를 지나야 한다
- **등록자 파기 원칙 — "행사 기록은 남기고 사람은 지운다"**: 리마인더는 삭제 / Q&A·채팅은 본문 남기고 PII 만 제거(채팅 `name` 은 NOT NULL 이라 "삭제된 참석자"로 익명화) / 투표·클릭·설문응답은 `registrationId = null` 로 연결만 끊음

### 9.3 소프트 삭제는 4개 모델만

`Workspace` · `Project` · `CollectSource` · `WebinarEmbedSite`. 나머지 38개는 전부 하드 삭제.
라벨도 갈린다 — 워크스페이스·프로젝트는 "보관 / 보관됨 / 복구", collect 소스는 "삭제됨".

### 9.4 부분 유니크 인덱스 9개 — 스키마에 없고 SQL 에만 있다

정본 목록은 `scripts/ensure-partial-unique-indexes.mjs` 의 `EXPECTED`.

- `WebinarPopup` / `WebinarPoll` / `WebinarSurvey` / `WebinarTallyPush` / `WebinarAnnouncement` 의 `_webinarId_active_key` (`WHERE isActive`) = **웨비나당 활성 1개**
- `WebinarQA` 의 화면 송출 1건, 채팅 고정 1건, 등록 중복 방지 등

> **`prisma db push` 는 이 9개를 "스키마에 없는 잔재"로 보고 지운다. 에러도 없다.**
> 지워지면 라이브 중 두 명이 거의 동시에 조작할 때만 활성 2개(팝업 2개 송출)·중복 등록이 터진다.
> push 뒤에는 반드시 `node scripts/ensure-partial-unique-indexes.mjs --apply`.
> 활성화·등록 코드는 `P2002` 를 잡아 409 로 바꿔야 한다 — 인덱스가 없으면 `P2002` 자체가 안 나서 경합 처리가 무력화된다.

`'등록자당 1표/1응답'` 은 `registrationId` 가 NULL 이면 강제되지 않는다(Postgres 가 NULL 을 서로 다른 값으로 본다) — 익명 응답·파기 후 null 화가 충돌 없이 남는 **의도된 설계**다.

### 9.5 JSON 블롭과 그 정본 모듈

이 앱의 설정은 대부분 컬럼이 아니라 JSON 블롭에 있다. **각 블롭에는 정규화 모듈이 하나씩 있고 그것이 계약이다.**

| 블롭 | 정본 모듈 | 주요 키 |
|---|---|---|
| `Webinar.theme` | *(전용 모듈 없음)* — CSS 변수 생성 정본은 `LiveContentStk.tsx` 의 `buildStkCss(accent, text, surface)` | accentColor · bgColor · surfaceColor · textColor · font · borderRadius · bgEffect |
| `Webinar.config` | `src/lib/webinar-config.ts` | youtubeId · calendarUrl · surveyUrl · registrationForm · livePage · landingPage |
| `config.livePage` | `normalizeLivePageConfig` | waiting{agenda,social,calendar,share,notify} · entry{viewerCount} · ended{replay,survey,resources,nextWebinar,share,title,description} · resources[] · nextWebinar |
| `config.landingPage` | 랜딩 normalize | enabled · heroMedia · brand · titleLines[] · subtitle · venue · ctaLabel · intro · sessions{enabled,detailPopup} · timetable · audience · programs · highlights · join{steps} · faq |
| `Webinar.components` | — | heroButton · banner · formWidget · allowLiveRegistration · entryOpenBeforeMinutes |
| `WebinarSession.speakerLinks` | `src/lib/webinar-speaker-links.ts` | **URL 문자열 배열만** 저장하고 플랫폼은 호스트로 판정. `SPEAKER_LINKS_MAX = 6` |
| `WebinarSurvey.questions` / `Response.answers` | `src/lib/webinar-survey.ts` | `[{id, type: rating\|single\|multiple\|text\|nps, title, required, options[]}]`. 상한 문항 30 · 선택지 20 |
| `Registration.journey` / `CollectRecord.journey` | `src/lib/webinar-attribution.ts` | 터치포인트 최대 20개. 텍스트 500자 절단 |
| `AdPerformanceRecord.raw` | `src/lib/ad-parse.ts` | CSV 원본 행 |
| `DashboardWidget.config` | `/api/dashboard-data/route.ts` | 위젯 타입 12종 |
| `CollectSource.discoveredFields` | `/api/collect/route.ts` | 자동 탐지 필드 메타 → 소스 화면에서 `FieldMapping` 으로 "적용" |

**`components` vs `config` 의 구분선**: *라이브 중에 콘솔에서도 바꾸는 스위치*는 `components` 에 둔다.
**채팅 모더레이션 값**(`chatSlowSec` · `chatBannedWords[]` · `chatBannedRegIds[]` · `chatHideLinks`)은 일부러 블롭이 아니라 `Webinar` 전용 컬럼이다 — 설정탭 저장이 블롭을 통째로 덮어쓰는 것을 막기 위한 것.

**`WebinarRegistration.memo` 는 의사 JSON** 이다 — 타입은 `String` 인데 `{ memo, customFields }` JSON 문자열을 담는다(등록 폼 커스텀 문항 답변이 여기 들어간다). 정본 `src/lib/webinar-memo.ts` 의 `parseMemo`/`buildMemo` 를 짝으로 써야 한다. 과거 textarea 직접 저장으로 `customFields` 를 날린 사고의 결과물.

### 9.6 값 규칙의 단일 소스

| 규칙 | 정본 |
|---|---|
| 웨비나 상태 4종(upcoming/registration/live/ended) + 입장 오픈 시각 | `src/lib/webinar-status.ts` `resolveWebinarStatus` |
| 전화·이메일 정규화(숫자만, 소문자) · `PHONE_MIN_DIGITS=10` `MAX=15` | `src/lib/webinar-config.ts` |
| 세션 유형 5종 (`opening`\|`session`\|`qa`\|`break`\|`closing`) | `src/lib/webinar-sessions.ts` `SESSION_TYPES`. **enum 도 CHECK 도 없는 `TEXT DEFAULT 'session'`** → 유형 추가는 마이그레이션 0건 |
| 연사 표기 `이름 \| 소속·직책` 파싱 | `webinar-sessions.ts` `parseSpeaker` |
| 약관 전문 상속(웨비나가 비우면 워크스페이스 템플릿) | `src/lib/consent-template.ts` `resolveConsentBody` |
| 종료 화면 설문 **배타적 폴백**(자체 설문이 하나라도 있으면 외부 URL 미사용) | `src/lib/webinar-ended-surveys.ts` `endedSurveyLinks` |
| 시청 시간 = `connectedSeconds`(ping 간격 누적, 끊긴 구간 제외). `focusSeconds` 는 그중 탭이 보였던 시간. `stayMinutes` 는 자리비움 포함 레거시 → 폴백 전용 | `ping` 라우트 + `webinar-status.ts` |
| "지금 보고 있는 사람" 창 = **90초 하나로 통일** — `ACTIVE_VIEWER_WINDOW_MS` 와 `SEGMENT_GAP_MS` 가 같은 값이어야 한다 | 위 둘 |
| 복수 선택 저장은 배열이 아니라 `', '` 결합 문자열 | `joinMultiValue`/`splitMultiValue` |
| KST 표시(`hourCycle: "h23"` 기본) | `src/lib/datetime.ts` `formatKst` |

### 9.7 운영 메모

- `datasource` 에 `url` 이 없다(`driverAdapters` preview). 클라이언트 출력은 `../src/generated/prisma` → **스키마 변경 후 `prisma generate` + dev 재시작 필수**
- 마이그레이션 이력 = `prisma/migrations` 29개 + `prisma/sql/*.sql` 4개. 후자는 **`db push` 금지**(§9.4) · 풀링 URL(`:6543`, pgbouncer) 대신 **세션 URL(`:5432`)** 로 적용

---

## 10. 크로스컷 규칙

| 관심사 | 규칙 |
|---|---|
| **시간대** | 전 표시가 KST. `formatKst` 가 `hourCycle: "h23"` 을 고정(호출자가 opt-out 할 수 있게 `hour12` 를 안 쓴다) |
| **레이트리밋** | 공개 라우트는 `rateLimitAsync`(Upstash Redis). Vercel 에 `UPSTASH_REDIS_REST_URL/TOKEN` 이 없으면 인메모리 폴백 |
| **뷰어 폴링** | 라이브 중은 `/live-state` **하나로 통합**, 라이브 전은 `/status`(30초). **새 폴러를 추가하지 않는다** |
| **크론** | 라우트 5개가 있지만 `vercel.json` 이 예약하는 건 2개(`daily`, `run-reports`) — `daily` 가 소프트삭제 영구파기 + 보존정책 적용 + 만료 토큰 정리를 흡수했다. 5개 전부 `CRON_SECRET` 게이트 |
| **관측** | Sentry. 라우트 세그먼트 오류 경계 + 루트 오류 경계 모두 `Sentry.captureException` |
| **파괴 액션** | `window.confirm` 전면 제거 → 프로미스 기반 공용 확인 모달. `tone="danger"`, 계정 수준 파괴는 `requireText` 문구 게이트로 확인 버튼을 잠금 |
| **저장** | 저장 버튼 대신 **자동저장 표시**. `AutosaveScope` 로 화면당 하나로 집계 |
| **삭제 피드백** | 토스트 + `useUndoableDelete` 5초 유예 + "실행취소" |
| **로드 실패** | fetch 실패를 '빈 상태'로 위장하지 않는 표준 인라인 오류 블록 |
| **PII** | 공개 노출 시 이름 마스킹(Q&A·채팅). 등록자 파기는 §9.2 |
| **모션** | reduced-motion 전역 가드. 아코디언 등 JS 모션은 `prefers-reduced-motion` 이면 개입하지 않고 브라우저 기본에 맡긴다 |

### 개발 전용 하니스 — `process.env.NODE_ENV === "production" && notFound()` + 미들웨어가 `/dev/*` 를 `/` 로

| 경로 | 무엇을 격리해 검증하나 |
|---|---|
| `/dev/primitives` | Surface/Field/Btn/Chip/Segmented/확인대화상자를 라이트·다크 나란히 |
| `/dev/row-harness` | 중간 행 삭제 후 값 유지 · 실행취소 · 드래그 · 키보드 재정렬 |
| `/dev/choice-harness` | 복수/단일 선택의 상한 잠금 · 기타 자유입력 · 저장 문자열과 파싱 |
| `/dev/registrants-harness` | 목록 API 만 가로채 문의 열 노출 조건 · 상세 문의 섹션 · 미연결 안내 |
| `/dev/landing-harness` | `mountLanding` 을 목업 payload 로 — 연사 카드 위계 · 상세 팝업 · 로고 규격 |
| `/dev/no-workspace-harness` | `/api/workspace` 만 가로채 `WorkspaceGate` 0개 안내와 통과 경로 |
| `/dev/embed-harness` *(route.ts, 생 HTML)* | 외부 부착 로더를 실제와 같은 환경에서 — 폼 렌더 · 제출 · 완료 팝업 |
| `/live-preview` | 상태머신·인증·타이밍 없이 4상태. `?slug=` 면 공개 `/info` 로 실제 저장값 |
| `/sentry-example-page` | Sentry 연결 확인 |

---

## 11. IA 상의 이음새 — 알려진 어긋남 15건

지금의 정보구조가 **답을 주지 못하는 질문들**이다. 전부 코드에서 확인한 사실이고, 대부분은 버그가 아니라 *"어느 화면이 이 값의 집인가"가 정해지지 않은* 자리다.

### 11.1 화면 × 역할 권한 매트릭스가 없다

클라이언트에서 역할로 UI 를 가리는 코드는 **워크스페이스 설정 모달 한 곳뿐**이다(`canManage` 로 탭을 숨김).
즉 MEMBER 도 소스 추가·가져오기·전체 삭제·공유 관리 버튼을 **전부 보고**, 누른 뒤 서버 403("권한 없음" / "ADMIN 이상 필요" / "공유 관리 권한 없음")으로만 막힌다.
→ *"뷰어에게 이 화면은 어떻게 보이는가"* 에 답할 수 없다.

### 11.2 데이터 수명 규칙이 세 갈래인데 한 표에 모여 있지 않다

| 갈래 | 대상 | 규칙 |
|---|---|---|
| ① 소프트 → 30일 → 영구 | `Workspace` `Project` `CollectSource` `WebinarEmbedSite` | `deletedAt` 후 30일에 `cron/daily` 가 Cascade 영구 삭제. 그 30일 안에만 슈퍼관리자가 복구 |
| ② 즉시 하드 | 나머지 38개 모델 | 되돌릴 수 없다 |
| ③ 보존정책 자동 | `CollectRecord` | `CollectRetentionPolicy.retainDays`(0 = 영구), 크론이 전부 훑어 적용 |

### 11.3 프로젝트를 보관하면 공개 웨비나 면은 그대로 살아 있다

`src/app/webinar/**` 와 `src/app/api/webinar/**` 전체에서 `deletedAt` 검사가 **0건**이다(확인: 유일한 2건은 `/w/[id]` 가 자기 `WebinarEmbedSite.deletedAt` 을 보는 것).
→ 프로젝트나 워크스페이스를 보관해도 그 안 웨비나의 **랜딩·라이브·설문·등록 API 가 최대 30일간 살아 있고 신규 등록까지 받는다.**
반면 같은 프로젝트의 공유 대시보드·광고성과 링크는 `deletedAt` 을 확인해 **즉시 닫힌다**. 같은 "보관"이 두 결과를 낸다.

### 11.4 `/webinar/[slug]` 의 `[slug]` 는 두 개의 식별자 공간이다

| 라우트 | `[slug]` 의 실제 값 |
|---|---|
| `src/app/(app)/webinar/[slug]/page.tsx` | **`webinar.id`** — `const { slug: id } = use(params)` |
| `src/app/webinar/[slug]/live/page.tsx` 등 공개 면 | **`webinar.slug`** |

같은 접두어를 쓰면서 파라미터 의미가 다르다. 링크를 만들 때 근거로 쓰면 틀린다.

### 11.5 "등록자"가 두 테이블을 가리킨다 — 정본 선언이 없다

`CollectRecord` 와 `WebinarRegistration` 은 별개 테이블이고 **UTM 어트리뷰션 세트까지 거의 같은 구성**인데, 화면마다 한쪽만 읽는다.

| 화면 | 읽는 테이블 |
|---|---|
| `/dashboard` 실시간 보고서 · `/share/dashboard` | `CollectRecord` **만** |
| 웨비나 허브 등록자·분석 탭 | `WebinarRegistration` **만** |

→ 한 프로젝트의 "누적 등록"이 어디를 봐야 맞는 값인지 문서·UI 어디에도 없다.

### 11.6 UTM 규칙은 읽는 곳과 고치는 곳이 끊겨 있다

`/utm-builder` 는 `/api/utm-presets?workspaceId=` · `/api/utm-templates` 를 **소비만** 한다. 규칙을 고치는 워크스페이스 설정 모달로 가는 링크가 페이지에 0건.
게다가 규칙은 워크스페이스 스코프, 생성물인 `UTMLink` 는 프로젝트 스코프다(`projectId` nullable).

### 11.7 `WebinarEmbedSite` 는 프로젝트 자원인데 편집 진입점이 웨비나 한 개 안에 있다

임베드 사이트는 프로젝트의 여러 웨비나가 공유하고 `activeWebinarId` 하나만 외부에 노출된다.
그런데 사이트를 보고 고치는 유일한 화면이 **"어떤 웨비나 하나"의 배포 탭**이라, 웨비나 A 의 탭에서 "이 웨비나가 노출되도록 전환"을 누르면 웨비나 B 의 공개 노출이 조용히 끝난다.

### 11.8 시청 화면의 정본이 필드 하나로 뒤집힌다

임베드 "입장하기"의 목적지는 `CFG.links.livePageUrl` 이 채워져 있으면 **고객 사이트**, 비어 있으면 **자체 `/webinar/{slug}/live`** 다(`webinar-loader-script.ts`).
즉 시청 면의 정본이 사이트 설정 한 칸으로 바뀌는데, 그 칸은 배포 탭 안에 있고 그 사실을 알려 주는 표시가 없다.

### 11.9 위젯 보드는 실질적으로 도달 불가능하다

`Dashboard`/`DashboardWidget` 모델·`/api/dashboard-data`(위젯 타입 12종)·공개 면 `/share/[token]` 은 다 있는데 **위젯을 만들고 배치하는 편집 UI 가 없다**. `ScheduledReport`(Slack/이메일)도 같다.
`/dashboard` 가 "위젯 보드"가 아니라 "고정 보고서 한 장"으로 바뀐 뒤 남은 계층이다.

### 11.10 숏링크는 생성만 있고 회수 경로가 없다

`/api/shorten-url` 은 `export` 가 `POST` 하나뿐이고, `/r/[code]` 는 **조건 없이** 리다이렉트한다.
→ `UTMLink` 를 삭제해도 그 링크로 만든 `/r/{code}` 는 영구히 원본 URL 로 보낸다. 외부에 뿌린 링크를 회수할 화면이 없다.

### 11.11 공유 링크가 두 계통으로 병존한다

프로젝트 단위 2개(`analyticsShareToken`, `dashboardShareToken`) + 보드 단위 1개(`Dashboard.shareToken`). §8.1 표가 어느 것이 도달 가능한 면인지까지 적어야 한다 — 세 번째는 §11.9 때문에 실질 도달 불가.

### 11.12 오류·빈 면이 화면마다 불균일하다

`error.tsx` 는 `(app)` · `dashboard` · `analytics` · `collect` · `collect/[id]` · `webinar` 에만 있다.
→ `/utm-builder` · `/admin` 은 자체 경계가 없어 상위 `(app)/error.tsx` 문구("이 화면을 불러오는 중 오류가 났어요")로 떨어진다.
**전역 `not-found.tsx` 가 없다** — 잘못된 주소는 Next 기본 404 를 본다.

### 11.13~15 인벤토리 감사가 잡은 누락 3건 *(이 문서에 반영 완료)*

- `/webinar` 목록 페이지 — 웨비나 도메인의 진입점인데 초기 지도에서 빠져 있었다 → §6.1
- `GET/POST /api/webinars` — 컬렉션 라우트(스코프 목록 + `_count.registrations` / 생성 + 슬러그 유니크 409) → §6.1
- 웨비나 만들기·복제 모달 → §6.1

---

## 부록 A. 라우트 인덱스

### 페이지 28개

| 층 | 경로 |
|---|---|
| **인증** (4) | `/` · `/signup` · `/reset-password` · `/reset-password/update` |
| **앱** (9) | `/dashboard` · `/collect` · `/collect/[id]` · `/analytics` · `/utm-builder` · `/webinar` · `/webinar/[slug]` · `/settings`† · `/settings/workspace`† |
| **관리자** (1) | `/admin` |
| **공개 — 웨비나** (3) | `/webinar/[slug]/landing` · `/webinar/[slug]/live` · `/webinar/[slug]/survey/[surveyId]` |
| **공개 — 공유** (3) | `/share/[token]` · `/share/analytics/[token]` · `/share/dashboard/[token]` |
| **개발 전용** (8) | `/live-preview` · `/sentry-example-page` · `/dev/primitives` · `/dev/row-harness` · `/dev/choice-harness` · `/dev/registrants-harness` · `/dev/landing-harness` · `/dev/no-workspace-harness` |

† 면 0개 — `redirect()` 뿐.

### 비-API 라우트 핸들러 6개

`/auth/callback` · `/w/[id]` · `/w/l/[slug]` · `/s/[id]` · `/r/[code]` · `/dev/embed-harness`

### API 라우트 136개 — 그룹별

| 그룹 | 수 | 그룹 | 수 |
|---|---|---|---|
| `webinars/*` (어드민) | 38 | `webinar-embed-sites` / `webinar-embed` | 2 / 2 |
| `webinar/*` (공개) | 19 | `utm` / `utm-templates` / `utm-presets` | 2 / 1 / 1 |
| `collect-sources/*` | 19 | `invitations` / `api-tokens` | 2 / 2 |
| `public/*` | 6 | `dashboard-widgets` | 3 |
| `projects` / `dashboards` / `cron` | 5 / 5 / 5 | `ad-performance` | 3 |
| `workspace` | 4 | 단일 라우트 11개 | 11 |

단일 라우트: `collect` · `dashboard-data` · `dashboard-report` · `health` · `heartbeat` · `notifications` · `notification-prefs` · `shorten-url` · `user` · `validate-url` · `sentry-example-api`

## 부록 B. `src/lib` 정본 모듈 지도 (발췌)

| 모듈 | 무엇의 유일한 진실 |
|---|---|
| `webinar-status.ts` | 상태 4종 · 입장 오픈 · 활성 시청자 90초 창 |
| `webinar-config.ts` | `config` 정규화 · 전화/이메일 규칙 · `safeHttpUrl` |
| `webinar-sessions.ts` | 세션 유형 5종 · `parseSpeaker` · 번호 부여 |
| `webinar-speaker-links.ts` | 연사 링크 호스트 판정 · 상한 6 · 스킴 차단 |
| `webinar-survey.ts` | 문항/응답 스키마 · 상한 30·20 · 답변 표시 |
| `webinar-qa.ts` | Q&A 상태 3종 라벨 · CSV 셀 포맷 |
| `webinar-memo.ts` | `memo` 의사 JSON `parse`/`build` 짝 |
| `webinar-registrant-csv.ts` | 헤더 ↔ 값 함수 쌍 · 수식 인젝션 중화 |
| `webinar-registrant-delete.ts` | 등록자 파기 순서(FK 없는 7개 포함) |
| `webinar-ended-surveys.ts` | 종료 설문 배타적 폴백 |
| `webinar-attribution.ts` | UTM 봉투 파싱 · journey 상한 20 |
| `consent-template.ts` | 약관 전문 상속 판정 |
| `datetime.ts` | KST 표시 · `hourCycle h23` |
| `app-user.ts` | 로그인 시 DB `User` 행 보장(실패해도 던지지 않음) |
| `ad-parse.ts` | 광고 CSV 정규화 · 컬럼 18종 |
| `activity.ts` | `ActivityAction` 화이트리스트 약 100종 |
| `landing/*` | 프레임워크 비의존 랜딩 렌더러 + 바닐라 런타임 |
