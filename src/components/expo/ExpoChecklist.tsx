"use client";

import { CircleAlert } from "lucide-react";
import { FINISH, R } from "@/components/ui/primitives";
import type { ChecklistItem } from "@/lib/expo/template-service";

/**
 * 템플릿을 오갈 때 **끊어 둔 것**을 알려 준다.
 *
 * ── 왜 반드시 보여야 하나 ─────────────────────────────────────────────
 * 템플릿은 이전 전시의 흔적을 한 톨도 가져가지 않는다 — 사전등록 소스도, 내부 링크도,
 * 아임웹 주소도 **일부러 비운다**(`template.ts` 머리말). 그게 맞는 동작이지만, 비웠다는
 * 사실을 말해 주지 않으면 운영자는 **다 된 줄 알고 발행한다.** 그러면 사전등록 폼이
 * 소스 없이 통째로 안 그려지고, 버튼은 아무 데도 안 가고, 아무도 이유를 모른다.
 *
 * 서버가 문장까지 만들어 준다(`reconnectChecklist`) — 화면이 따로 짜면 새 사유를 추가할 때
 * 한쪽만 고쳐진다. 여기서는 그대로 그린다.
 */
export function ExpoChecklist({
  items, title = "이어서 할 일",
}: { items: readonly ChecklistItem[]; title?: string }) {
  if (items.length === 0) return null;

  return (
    <div className={`${R.surface} ${FINISH.s2} bg-secondary p-2.5`}>
      <p className="flex items-center gap-1.5 text-[11px] font-medium">
        <CircleAlert className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
        {title}
      </p>
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => (
          <li key={item.code} className="flex gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <span aria-hidden className="select-none">·</span>
            <span className="min-w-0">{item.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
