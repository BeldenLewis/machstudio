/**
 * 사전등록의 **이메일 규칙 한 곳** — 정규화와 유효성(설계 §6.2).
 *
 * ── 왜 별도 파일인가 ──────────────────────────────────────────────────
 * 이 두 함수는 서버(제출·중복확인·조회)와 **브라우저 런타임**이 같이 쓴다. 그런데
 * `collect-submit.ts` 에는 등록번호 발급이 있고 그건 `node:crypto` 를 쓴다 — 거기서
 * 가져오면 임베드 번들 빌드가 통째로 실패한다(실제로 그렇게 한 번 깨졌다).
 *
 * 규칙이 한 곳에 있어야 하는 이유는 더 단순하다: 저장·중복확인·조회가 서로 다른 규칙을
 * 쓰면 **"등록은 됐는데 조회가 안 되는"** 사람이 생기고, 그 사람은 QR 을 영영 못 받는다.
 */
import { isValidEmail } from "@/lib/webinar-config";

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/**
 * 보이지 않는 문자 — 붙여넣기로 딸려 들어오고, 화면에서는 구분할 방법이 없다.
 * 제로폭 공백/조이너와 BOM. `\s` 에 안 잡히므로 trim 이 못 지운다.
 */
const INVISIBLE = /[\u200B-\u200D\uFEFF]/g;

/**
 * 이메일 정규화 — 중복 판정의 전제. trim + 소문자.
 *
 * **보이지 않는 문자를 먼저 지운다.** 웹페이지나 PDF 에서 주소를 복사해 오면 제로폭
 * 공백이 섞여 오는 일이 실제로 있고, 그러면 같은 사람이 같은 주소로 두 번 등록된다
 * (키가 갈리므로 유니크 인덱스도 안 막는다). 그 주소로는 메일도 안 나간다.
 */
export function normalizeEmail(value: unknown): string | null {
  const s = str(value).replace(INVISIBLE, "").trim().toLowerCase();
  return s || null;
}

/**
 * 사전등록의 이메일 유효성 — 공용 `isValidEmail`(형식 + 길이 ≤320) **위에** 설계 §6.2 의
 * '추가 차단' 을 얹는다: 연속 점, 로컬파트 시작·끝 점.
 *
 * **공용 EMAIL_REGEX 자체는 건드리지 않는다.** 웨비나 등록이 같은 상수를 쓰고, 조이는
 * 방향의 변경은 `john.doe+expo@company.co.uk` 같은 실제 고객 주소를 거부하는 회귀로
 * 이어지기 쉽다(§6.2 이 그 주소를 이름으로 지목해 경고한다). 여기서 막는 셋은 RFC 위반이라
 * **발송 자체가 거부되는** 주소이고, 그건 QR 을 영영 못 받는다는 뜻이다.
 */
export function isValidCollectEmail(email: string): boolean {
  if (!isValidEmail(email)) return false;
  // 도메인의 점은 정상이다 — 로컬파트만 본다.
  const local = email.slice(0, email.lastIndexOf("@"));
  if (local.includes("..")) return false;
  if (local.startsWith(".") || local.endsWith(".")) return false;
  return true;
}
