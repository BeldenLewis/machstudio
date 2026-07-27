"use client";

/**
 * 워크스페이스가 없는 사용자에게 보여주는 화면.
 *
 * 왜 필요한가: 예전에는 가입 직후 `/onboarding`(워크스페이스 만들기)을 **강제로** 거쳤다.
 * 그 강제 단계를 없애면서 생기는 빈 자리를 여기서 받는다 — 예전 대시보드는 워크스페이스가
 * 없으면 아무 안내 없이 빈 화면이었다(fetch 를 건너뛰기만 했다).
 *
 * 강제 온보딩을 버린 이유: 이 도구는 관리자가 기존 워크스페이스로 초대하는 방식으로 쓴다.
 * 가입한 사람마다 자기 워크스페이스를 만들게 하면 쓸모 없는 1인 워크스페이스가 쌓이고,
 * 정작 초대받아야 할 사람은 엉뚱한 곳에 들어가 있게 된다. 그래서 **기다리는 것이 기본**,
 * 만들기는 옆에 둔다.
 *
 * 생성은 사이드바 스위처와 **같은 라우트**(POST /api/workspace)를 쓴다 — 만드는 길이
 * 두 개인데 동작이 갈라지면, 한쪽으로 만든 워크스페이스에만 기본 프로젝트가 없는 식이 된다.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { Building2, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/contexts/workspace";

const spring = { type: "spring" as const, stiffness: 400, damping: 30 };

export function NoWorkspace() {
  const { switchWorkspace } = useWorkspace();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || isCreating) return;
    setIsCreating(true);
    try {
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "만들지 못했어요. 잠시 후 다시 시도해주세요");
        return;
      }
      await switchWorkspace(data.workspace);
      toast.success(`'${data.workspace.name}' 워크스페이스가 생성됐어요`);
    } catch {
      toast.error("만들지 못했어요. 연결 상태를 확인해주세요");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-muted-foreground">
          <Building2 className="h-6 w-6" />
        </div>
        <h1 className="mt-5 text-lg font-semibold tracking-tight">아직 워크스페이스가 없어요</h1>
        {/* 초대를 먼저 말한다 — 대부분은 팀에 합류하는 경우라, 만들기를 앞세우면
            혼자 쓰는 워크스페이스를 만들고 나서 팀을 못 찾는다. */}
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          팀에 합류하려면 관리자에게 초대를 요청해주세요.
          <br />
          초대를 받으면 이 화면 대신 팀의 데이터가 보여요.
        </p>

        {showForm ? (
          <div className="mt-6 space-y-2 text-left">
            <label htmlFor="new-workspace-name" className="text-xs font-medium text-muted-foreground">
              워크스페이스 이름
            </label>
            <input
              id="new-workspace-name"
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") create();
                if (e.key === "Escape") { setShowForm(false); setName(""); }
              }}
              placeholder="예: 마케팅팀"
              className="w-full rounded-xl bg-secondary px-3.5 py-2.5 text-sm shadow-sm outline-none focus:ring-2 focus:ring-violet-500/40"
            />
            <div className="flex gap-2 pt-1">
              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={spring}
                onClick={create}
                disabled={!name.trim() || isCreating}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-600 disabled:opacity-50"
              >
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                만들기
              </motion.button>
              <button
                onClick={() => { setShowForm(false); setName(""); }}
                className="rounded-xl px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          // 보조 위계 — 주 행동은 "초대를 기다린다" 라서 버튼을 채우지 않는다.
          <motion.button
            whileTap={{ scale: 0.97 }}
            transition={spring}
            onClick={() => setShowForm(true)}
            className="mt-6 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground shadow-sm transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            직접 워크스페이스 만들기
          </motion.button>
        )}
      </div>
    </div>
  );
}
