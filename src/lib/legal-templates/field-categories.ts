import type { DataCategory, InferableField } from "./types";

/**
 * 폼 필드 → 수집 항목 카테고리 추론.
 *
 * `email`/`tel`/`image`/`youtube` 타입은 카테고리가 타입만으로 확정된다. `text`/`select`는
 * 애매해서 key(가끔 label)에 있는 키워드로만 잡고, 걸리는 게 없으면 `otherText`로 둔다 —
 * "회사명"이라고 잘못 단정해서 문서에 없는 사실을 적는 것보다, 뭉뚱그려 안전한 쪽이 낫다.
 *
 * 대소문자·한/영 키워드를 같이 본다 — 이 저장소의 필드 key는 보통 영문(email, phone, company)이지만
 * label은 한국어일 수 있고(예: key="company", label="회사명"), 반대로 운영자가 key 자체를
 * 한국어로 지었을 수도 있다.
 */
const KEYWORD_RULES: ReadonlyArray<{ category: DataCategory; pattern: RegExp }> = [
  { category: "company", pattern: /company|organi[sz]ation|business|회사|소속|기업|단체/i },
  { category: "jobTitle", pattern: /job.?title|position|직책|직위|담당/i },
  { category: "address", pattern: /address|addr|주소/i },
  { category: "name", pattern: /\bname\b|성명|이름|대표자/i },
];

/** "contactName" → "contact Name" — camelCase 키에도 단어 경계 매칭이 걸리게 한다. */
function splitCamelCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

function categorizeAmbiguousField(field: InferableField): DataCategory {
  const haystack = splitCamelCase(`${field.key} ${field.label ?? ""}`);
  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(haystack)) return rule.category;
  }
  return "otherText";
}

/**
 * 필드 목록에서 실제 수집되는 카테고리 집합을 뽑는다. 순서를 보존하되 중복은 제거한다 —
 * 문서에 "이메일, 이메일, 전화번호" 처럼 나오면 안 된다.
 */
export function inferDataCategories(fields: readonly InferableField[]): DataCategory[] {
  const seen = new Set<DataCategory>();
  const ordered: DataCategory[] = [];

  const add = (category: DataCategory) => {
    if (seen.has(category)) return;
    seen.add(category);
    ordered.push(category);
  };

  for (const field of fields) {
    switch (field.type) {
      case "email":
        add("email");
        break;
      case "tel":
        add("phone");
        break;
      case "image":
        add("photo");
        break;
      case "youtube":
        add("video");
        break;
      case "text":
      case "select":
      case "multiple":
        add(categorizeAmbiguousField(field));
        break;
      case "checkbox":
        // 체크박스는 동의 여부 자체를 저장하는 경우가 많아 "수집 항목" 목록에서는 뺀다.
        break;
      default:
        add("otherText");
    }
  }

  return ordered;
}
