"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, X, Edit2, Check, Plus, Trash2, Crown, ShieldCheck, User as UserIcon, GripVertical, Tag, Layers, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/contexts/workspace";
import { Select } from "@/components/ui/select";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Member {
  id: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  user: { id: string; name: string | null; email: string; avatarUrl: string | null };
}

type ModalTab = "general" | "utm" | "consent";

const ROLE_LABEL: Record<string, string> = { OWNER: "소유자", ADMIN: "편집자", MEMBER: "뷰어" };
const ROLE_ICON: Record<string, React.ElementType> = { OWNER: Crown, ADMIN: ShieldCheck, MEMBER: UserIcon };
const ROLE_COLOR: Record<string, string> = {
  OWNER: "bg-violet-500/10 text-violet-500",
  ADMIN: "bg-blue-500/10 text-blue-500",
  MEMBER: "bg-secondary text-muted-foreground",
};

const PRESET_FIELDS = [
  { key: "source", label: "utm_source", labelPlaceholder: "구글", valuePlaceholder: "google" },
  { key: "medium", label: "utm_medium", labelPlaceholder: "검색 광고", valuePlaceholder: "cpc" },
  { key: "campaign", label: "utm_campaign", labelPlaceholder: "여름 이벤트", valuePlaceholder: "summer_event" },
] as const;
type Field = (typeof PRESET_FIELDS)[number]["key"];

function getPresetFieldMeta(field: string) {
  return PRESET_FIELDS.find((item) => item.key === field) ?? PRESET_FIELDS[0];
}

interface Preset { id: string; field: string; value: string; label?: string | null; sortOrder: number; }
interface Template { id: string; name: string; source: string; medium: string; campaign?: string | null; term?: string | null; content?: string | null; }

const smInputCls = "rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 transition-all";
const inputCls = "w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 transition-all";

function SortablePresetRow({ p, activeField, editingPresetId, editingLabel, editingValue, isSavingPreset, onEdit, onSave, onCancel, onDelete, setEditingLabel, setEditingValue }: {
  p: Preset; activeField: string; editingPresetId: string | null;
  editingLabel: string; editingValue: string; isSavingPreset: boolean;
  onEdit: (p: Preset) => void; onSave: () => void; onCancel: () => void; onDelete: (id: string) => void;
  setEditingLabel: (v: string) => void; setEditingValue: (v: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: p.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  if (editingPresetId === p.id) {
    return (
      <div ref={setNodeRef} style={style} className="p-3 rounded-xl border border-violet-400/40 bg-violet-500/5 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">표시 이름</label>
            <input type="text" value={editingLabel} onChange={(e) => setEditingLabel(e.target.value)}
              placeholder={getPresetFieldMeta(activeField).labelPlaceholder}
              className={smInputCls} autoFocus />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground">UTM 값 *</label>
            <input type="text" value={editingValue} onChange={(e) => setEditingValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSave(); if (e.key === "Escape") onCancel(); }}
              className={smInputCls} />
          </div>
        </div>
        <div className="flex gap-1.5">
          <motion.button whileTap={{ scale: 0.95 }} onClick={onSave}
            disabled={!editingValue.trim() || isSavingPreset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500 text-white text-xs font-medium hover:bg-violet-600 transition-colors disabled:opacity-40">
            <Check className="w-3 h-3" />저장
          </motion.button>
          <button onClick={onCancel}
            className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-secondary transition-colors">
            취소
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style}
      className="flex items-center justify-between px-3 py-2 rounded-xl border border-border hover:bg-secondary/40 transition-colors group">
      <div className="flex items-center gap-2 min-w-0">
        <button {...attributes} {...listeners}
          className="text-muted-foreground/40 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none shrink-0">
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        {p.label ? (
          <>
            <span className="text-sm font-medium">{p.label}</span>
            <span className="text-xs text-muted-foreground font-mono shrink-0">({p.value})</span>
          </>
        ) : (
          <span className="text-sm font-mono">{p.value}</span>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onEdit(p)}
          className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onDelete(p.id)}
          className="p-1 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

interface Props { open: boolean; onClose: () => void; }

export function WorkspaceSettingsModal({ open, onClose }: Props) {
  const router = useRouter();
  const { workspace, refreshWorkspaces } = useWorkspace();

  const [activeTab, setActiveTab] = useState<ModalTab>("general");

  // 일반
  const [wsName, setWsName] = useState(workspace?.name ?? "");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingWsName, setEditingWsName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);

  // 위험 영역 — 워크스페이스 삭제
  const [showDangerConfirm, setShowDangerConfirm] = useState(false);
  const [confirmDeleteName, setConfirmDeleteName] = useState("");
  const [isDeletingWorkspace, setIsDeletingWorkspace] = useState(false);

  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [isInviting, setIsInviting] = useState(false);
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);

  // UTM 허용값
  const [activeField, setActiveField] = useState<Field>("source");
  const [presets, setPresets] = useState<Preset[]>([]);
  const [newPresetValue, setNewPresetValue] = useState("");
  const [newPresetLabel, setNewPresetLabel] = useState("");
  const [isAddingPreset, setIsAddingPreset] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [editingLabel, setEditingLabel] = useState("");
  const [isSavingPreset, setIsSavingPreset] = useState(false);

  // UTM 템플릿
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [tForm, setTForm] = useState({ name: "", source: "", medium: "", campaign: "", term: "", content: "" });
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);

  useEffect(() => {
    if (workspace?.name) setWsName(workspace.name);
  }, [workspace?.name]);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const fetchMembers = useCallback(async () => {
    if (!workspace?.id) return;
    const res = await fetch(`/api/workspace/${workspace.id}/members`);
    const data = await res.json();
    setMembers(data.members ?? []);
  }, [workspace?.id]);

  const fetchPresets = useCallback(async () => {
    if (!workspace?.id) return;
    const res = await fetch(`/api/utm-presets?workspaceId=${workspace.id}`);
    const data = await res.json();
    setPresets(data.presets ?? []);
  }, [workspace?.id]);

  const fetchTemplates = useCallback(async () => {
    if (!workspace?.id) return;
    const res = await fetch(`/api/utm-templates?workspaceId=${workspace.id}`);
    const data = await res.json();
    setTemplates(data.templates ?? []);
  }, [workspace?.id]);

  useEffect(() => {
    if (!open) return;
    fetchMembers();
    fetchPresets();
    fetchTemplates();
  }, [open, fetchMembers, fetchPresets, fetchTemplates]);

  const handleSaveName = async () => {
    if (!editingWsName.trim() || !workspace?.id) return;
    setIsSavingName(true);
    try {
      const res = await fetch(`/api/workspace/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingWsName.trim() }),
      });
      if (!res.ok) { toast.error("워크스페이스 이름을 저장하지 못했어요. 다시 시도해주세요"); return; }
      setWsName(editingWsName.trim());
      setIsEditingName(false);
      // 사이드바·전역 컨텍스트에도 즉시 반영.
      await refreshWorkspaces();
      toast.success("워크스페이스 이름이 변경됐어요");
    } finally { setIsSavingName(false); }
  };

  /**
   * 약관 전문 템플릿 — 웨비나가 자기 값을 비워 두면 이 값을 상속한다.
   * 이름과 **따로** 저장한다(라우트가 보낸 키만 반영) — 함께 보내면 옛 이름 스냅샷이 되돌린다.
   */
  const [privacyTpl, setPrivacyTpl] = useState("");
  const [marketingTpl, setMarketingTpl] = useState("");
  const [isSavingTpl, setIsSavingTpl] = useState(false);
  useEffect(() => {
    setPrivacyTpl(workspace?.privacyBodyTemplate ?? "");
    setMarketingTpl(workspace?.marketingBodyTemplate ?? "");
  }, [workspace?.privacyBodyTemplate, workspace?.marketingBodyTemplate]);

  const handleSaveTemplates = async () => {
    if (!workspace?.id) return;
    setIsSavingTpl(true);
    try {
      const res = await fetch(`/api/workspace/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privacyBodyTemplate: privacyTpl, marketingBodyTemplate: marketingTpl }),
      });
      if (!res.ok) { toast.error("약관 템플릿을 저장하지 못했어요"); return; }
      await refreshWorkspaces();
      toast.success("약관 템플릿을 저장했어요 — 전문을 비워 둔 웨비나가 이 값을 씁니다");
    } finally { setIsSavingTpl(false); }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !workspace?.id) return;
    setIsInviting(true);
    try {
      // 1차: 기존 회원 초대 시도
      const res = await fetch(`/api/workspace/${workspace.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();

      // 가입하지 않은 사용자면 이메일 초대로 fallback
      if (!res.ok && (data.error?.includes("가입") || res.status === 404)) {
        const inviteRes = await fetch(`/api/workspace/${workspace.id}/invite-email`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
        });
        const inviteData = await inviteRes.json();
        if (!inviteRes.ok) { toast.error(inviteData.error ?? "초대 실패"); return; }
        if (inviteData.signupLink) {
          await navigator.clipboard.writeText(inviteData.signupLink).catch(() => {});
          toast.success("미가입자 — 가입 링크를 클립보드에 복사했어요. 직접 전달해주세요.");
        } else {
          toast.success("초대 발송됨");
        }
        setInviteEmail("");
        return;
      }

      if (!res.ok) { toast.error(data.error ?? "초대 실패"); return; }
      setInviteEmail("");
      toast.success("초대를 보냈어요. 상대방이 수락하면 멤버로 추가돼요");
    } finally { setIsInviting(false); }
  };

  const handleChangeRole = async (memberId: string, role: string) => {
    if (!workspace?.id) return;
    setChangingRoleId(memberId);
    try {
      const res = await fetch(`/api/workspace/${workspace.id}/members`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, role }),
      });
      if (!res.ok) { toast.error("역할을 변경하지 못했어요. 다시 시도해주세요"); return; }
      fetchMembers();
    } finally { setChangingRoleId(null); }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!workspace?.id) return;
    const res = await fetch(`/api/workspace/${workspace.id}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error ?? "제거 실패"); return; }
    fetchMembers();
    toast.success("멤버가 제거됐어요");
  };

  const handleAddPreset = async () => {
    if (!newPresetValue.trim() || !workspace?.id) return;
    setIsAddingPreset(true);
    try {
      const res = await fetch("/api/utm-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: workspace.id, field: activeField, value: newPresetValue.trim(), label: newPresetLabel.trim() || null }),
      });
      if (!res.ok) { toast.error("이미 존재하는 값이에요"); return; }
      setNewPresetValue(""); setNewPresetLabel("");
      fetchPresets();
      toast.success("허용값이 추가됐어요");
    } finally { setIsAddingPreset(false); }
  };

  const handleDeletePreset = async (id: string) => {
    try {
      const res = await fetch("/api/utm-presets", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!res.ok) { toast.error("삭제하지 못했어요. 다시 시도해주세요"); return; }
      fetchPresets();
      toast.success("삭제됐어요");
    } catch { toast.error("삭제하지 못했어요. 다시 시도해주세요"); }
  };

  const startEditPreset = (p: Preset) => {
    setEditingPresetId(p.id);
    setEditingValue(p.value);
    setEditingLabel(p.label ?? "");
  };

  const handleSavePreset = async () => {
    if (!editingPresetId || !editingValue.trim()) return;
    setIsSavingPreset(true);
    try {
      const res = await fetch("/api/utm-presets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingPresetId, value: editingValue.trim(), label: editingLabel.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "수정하지 못했어요. 다시 시도해주세요"); return; }
      setEditingPresetId(null);
      fetchPresets();
      toast.success("수정됐어요");
    } finally { setIsSavingPreset(false); }
  };

  const handleSaveTemplate = async () => {
    if (!workspace?.id) return;
    if (!tForm.name.trim() || !tForm.source.trim() || !tForm.medium.trim() || !tForm.campaign.trim()) {
      toast.error("템플릿 이름, source, medium, campaign을 모두 입력해주세요");
      return;
    }
    setIsSavingTemplate(true);
    try {
      const res = await fetch("/api/utm-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: workspace.id, ...tForm }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "템플릿을 저장하지 못했어요. 다시 시도해주세요"); return; }
      setTForm({ name: "", source: "", medium: "", campaign: "", term: "", content: "" });
      setShowNewTemplate(false);
      fetchTemplates();
      toast.success("템플릿이 저장됐어요");
    } finally { setIsSavingTemplate(false); }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      const res = await fetch("/api/utm-templates", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (!res.ok) { toast.error("삭제하지 못했어요. 다시 시도해주세요"); return; }
      fetchTemplates();
      toast.success("삭제됐어요");
    } catch { toast.error("삭제하지 못했어요. 다시 시도해주세요"); }
  };

  const fieldPresets = presets.filter((p) => p.field === activeField);
  const activeFieldMeta = getPresetFieldMeta(activeField);
  const templatePresetValues = (field: Field) => presets.filter((p) => p.field === field);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fieldPresets.findIndex((p) => p.id === active.id);
    const newIndex = fieldPresets.findIndex((p) => p.id === over.id);
    const reordered = arrayMove(fieldPresets, oldIndex, newIndex);
    setPresets((prev) => {
      const others = prev.filter((p) => p.field !== activeField);
      return [...others, ...reordered.map((p, i) => ({ ...p, sortOrder: i }))];
    });
    await fetch("/api/utm-presets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orders: reordered.map((p, i) => ({ id: p.id, sortOrder: i })) }),
    });
  };

  const isOwner = workspace?.role === "OWNER";
  const canManage = workspace?.role === "OWNER" || workspace?.role === "ADMIN";

  const handleDeleteWorkspace = async () => {
    if (!workspace?.id) return;
    if (confirmDeleteName.trim() !== workspace.name) {
      toast.error("워크스페이스 이름이 일치하지 않아요");
      return;
    }
    setIsDeletingWorkspace(true);
    try {
      const res = await fetch(`/api/workspace/${workspace.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName: confirmDeleteName.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error || "삭제하지 못했어요. 다시 시도해주세요");
        return;
      }
      toast.success("워크스페이스가 삭제됐어요");
      localStorage.removeItem("currentWorkspaceId");
      localStorage.removeItem("currentProjectId");
      onClose();
      // 컨텍스트 실시간 반영. 다른 워크스페이스 없으면 onboarding으로 이동.
      const list = await refreshWorkspaces();
      if (list.length === 0) {
        router.push("/onboarding");
      } else {
        router.push("/dashboard");
      }
    } catch {
      toast.error("삭제하지 못했어요. 다시 시도해주세요");
    } finally {
      setIsDeletingWorkspace(false);
    }
  };

  const tabs: { key: ModalTab; label: string; icon: React.ElementType }[] = [
    { key: "general", label: "일반", icon: UserIcon },
    ...(canManage ? [{ key: "utm" as ModalTab, label: "UTM 규칙", icon: Tag }] : []),
    // 약관 전문은 조직 자산이라 워크스페이스에 둔다 — 웨비나마다 다시 붙여넣을 값이 아니다(IA 8단계).
    ...(canManage ? [{ key: "consent" as ModalTab, label: "약관", icon: FileText }] : []),
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="w-full max-w-lg bg-background rounded-2xl shadow-xl pointer-events-auto flex flex-col max-h-[85vh]">

              {/* 헤더 */}
              <div className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0">
                <div>
                  <h2 className="text-base font-semibold">워크스페이스 설정</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{wsName}</p>
                </div>
                <button onClick={onClose}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 탭 */}
              {tabs.length > 1 && (
                <div className="flex gap-0.5 px-6 border-b border-border shrink-0">
                  {tabs.map(({ key, label, icon: Icon }) => (
                    <button key={key} onClick={() => setActiveTab(key)}
                      className={`relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${
                        activeTab === key ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}>
                      <Icon className="w-3.5 h-3.5" />{label}
                      {activeTab === key && (
                        <motion.div layoutId="ws-tab-indicator"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-500 rounded-full" />
                      )}
                    </button>
                  ))}
                </div>
              )}
              {tabs.length === 1 && <div className="mx-6 h-px bg-border shrink-0" />}

              {/* 콘텐츠 */}
              <div className="overflow-y-auto flex-1 px-6 py-5">
                <AnimatePresence mode="wait">

                  {activeTab === "general" && (
                    <motion.div key="general" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="space-y-6">
                      {/* 워크스페이스 이름 */}
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">이름</p>
                        <div className="flex items-center gap-2">
                          {isEditingName ? (
                            <>
                              <input type="text" value={editingWsName}
                                onChange={(e) => setEditingWsName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setIsEditingName(false); }}
                                className={`${smInputCls} flex-1`} autoFocus />
                              <motion.button whileTap={{ scale: 0.95 }} onClick={handleSaveName}
                                disabled={!editingWsName.trim() || isSavingName}
                                className="p-2 rounded-xl bg-violet-500 text-white hover:bg-violet-600 transition-colors disabled:opacity-40">
                                <Check className="w-4 h-4" />
                              </motion.button>
                              <button onClick={() => setIsEditingName(false)}
                                className="p-2 rounded-xl border border-border hover:bg-secondary transition-colors">
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <span className="flex-1 text-sm font-medium">{wsName}</span>
                              {canManage && (
                                <button onClick={() => { setEditingWsName(wsName); setIsEditingName(true); }}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-xs hover:bg-secondary transition-colors text-muted-foreground">
                                  <Edit2 className="w-3 h-3" />편집
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      <div className="h-px bg-border" />

                      {/* 멤버 */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">멤버</p>
                          <span className="text-xs text-muted-foreground">{members.length}명</span>
                        </div>

                        <div className="space-y-1">
                          <AnimatePresence initial={false}>
                            {members.map((m) => {
                              const RoleIcon = ROLE_ICON[m.role] ?? UserIcon;
                              return (
                                <motion.div key={m.id} layout
                                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, overflow: "hidden" }}
                                  className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-secondary/50 transition-colors group">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-7 h-7 rounded-full bg-violet-500/10 flex items-center justify-center text-violet-500 text-xs font-semibold shrink-0">
                                      {(m.user.name || m.user.email)[0].toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium truncate leading-tight">{m.user.name || m.user.email}</p>
                                      {m.user.name && <p className="text-xs text-muted-foreground truncate">{m.user.email}</p>}
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 shrink-0 ml-2">
                                    {isOwner && m.role !== "OWNER" ? (
                                      <Select
                                        size="sm"
                                        value={m.role}
                                        onChange={(role) => handleChangeRole(m.id, role)}
                                        options={[
                                          { value: "ADMIN", label: "편집자" },
                                          { value: "MEMBER", label: "뷰어" },
                                        ]}
                                      />
                                    ) : (
                                      <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg font-medium whitespace-nowrap ${ROLE_COLOR[m.role]}`}>
                                        <RoleIcon className="w-3 h-3" />{ROLE_LABEL[m.role]}
                                      </span>
                                    )}
                                    {canManage && m.role !== "OWNER" && !(workspace?.role === "ADMIN" && m.role === "ADMIN") && (
                                      <button onClick={() => handleRemoveMember(m.id)}
                                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-red-500/10 hover:text-red-500 text-muted-foreground">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </motion.div>
                              );
                            })}
                          </AnimatePresence>
                        </div>

                        {canManage && (
                          <div className="pt-3 border-t border-border space-y-2">
                            <p className="text-xs text-muted-foreground">이메일로 멤버 초대</p>
                            <div className="flex gap-2">
                              <input type="email" placeholder="team@example.com" value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") handleInvite(); }}
                                className={`${smInputCls} flex-1`} />
                              <Select
                                value={inviteRole}
                                onChange={setInviteRole}
                                options={[
                                  { value: "MEMBER", label: "뷰어" },
                                  { value: "ADMIN", label: "편집자" },
                                ]}
                                className="w-28"
                              />
                              <motion.button whileTap={{ scale: 0.95 }} onClick={handleInvite}
                                disabled={!inviteEmail.trim() || isInviting}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-40 shrink-0">
                                <Plus className="w-3.5 h-3.5" />{isInviting ? "추가 중..." : "추가"}
                              </motion.button>
                            </div>
                            <p className="text-xs text-muted-foreground">이미 mach에 가입된 계정만 추가할 수 있어요</p>
                          </div>
                        )}
                      </div>

                      {/* 위험 영역 — OWNER만 워크스페이스 삭제 가능 */}
                      {isOwner && (
                        <>
                          <div className="h-px bg-border" />
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-red-500" />
                              <p className="text-xs font-medium text-red-500 uppercase tracking-wider">위험 영역</p>
                            </div>
                            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-3">
                              <div>
                                <p className="text-sm font-medium">워크스페이스 삭제</p>
                                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                                  삭제하면 워크스페이스 내 모든 프로젝트·사전등록 데이터·웨비나·광고 성과 데이터에 접근할 수 없게 됩니다. 30일간 복구 가능합니다.
                                </p>
                              </div>
                              {!showDangerConfirm ? (
                                <motion.button
                                  whileHover={{ y: -1 }}
                                  whileTap={{ scale: 0.96 }}
                                  onClick={() => setShowDangerConfirm(true)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs font-medium text-red-600 hover:bg-red-500/20 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  워크스페이스 삭제
                                </motion.button>
                              ) : (
                                <div className="space-y-2">
                                  <label className="block text-xs text-muted-foreground">
                                    계속하려면 <code className="px-1.5 py-0.5 rounded bg-secondary border border-border font-mono">{workspace?.name}</code> 을(를) 그대로 입력하세요
                                  </label>
                                  <input
                                    type="text"
                                    value={confirmDeleteName}
                                    onChange={(e) => setConfirmDeleteName(e.target.value)}
                                    placeholder={workspace?.name ?? ""}
                                    autoFocus
                                    className={`w-full px-3 py-2 rounded-xl border bg-background text-sm focus:outline-none transition-colors ${
                                      confirmDeleteName.trim() === workspace?.name ? "border-red-500/60" : "border-border focus:border-red-400"
                                    }`}
                                  />
                                  <div className="flex gap-2">
                                    <motion.button
                                      whileHover={{ y: -1 }}
                                      whileTap={{ scale: 0.96 }}
                                      onClick={() => { setShowDangerConfirm(false); setConfirmDeleteName(""); }}
                                      className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                      취소
                                    </motion.button>
                                    <motion.button
                                      whileHover={{ y: -1 }}
                                      whileTap={{ scale: 0.96 }}
                                      onClick={handleDeleteWorkspace}
                                      disabled={confirmDeleteName.trim() !== workspace?.name || isDeletingWorkspace}
                                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                      {isDeletingWorkspace ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                      {isDeletingWorkspace ? "삭제 중..." : "삭제 확정"}
                                    </motion.button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </motion.div>
                  )}

                  {activeTab === "consent" && (
                    <motion.div key="consent" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="space-y-5">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">약관 전문 템플릿</p>
                        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                          웨비나 등록 폼에서 동의 문구를 눌렀을 때 뜨는 전문이에요. 여기 넣어 두면
                          <b className="font-semibold text-foreground"> 전문을 비워 둔 웨비나가 이 값을 물려받아요</b>.
                          특정 웨비나만 다르게 하려면 그 웨비나의 등록 탭에서 덮어쓰면 돼요.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[11px] font-medium text-muted-foreground" htmlFor="ws-privacy-tpl">개인정보 수집·이용 동의 전문</label>
                        <textarea
                          id="ws-privacy-tpl"
                          rows={7}
                          value={privacyTpl}
                          onChange={(e) => setPrivacyTpl(e.target.value)}
                          placeholder="제1조 (수집 항목) ..."
                          className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm leading-relaxed transition-colors focus:border-violet-400 focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[11px] font-medium text-muted-foreground" htmlFor="ws-marketing-tpl">마케팅 정보 수신 동의 전문</label>
                        <textarea
                          id="ws-marketing-tpl"
                          rows={7}
                          value={marketingTpl}
                          onChange={(e) => setMarketingTpl(e.target.value)}
                          placeholder="수신 동의 시 제공되는 정보 ..."
                          className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm leading-relaxed transition-colors focus:border-violet-400 focus:outline-none"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleSaveTemplates}
                          disabled={isSavingTpl}
                          className="rounded-xl bg-violet-500 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-violet-600 disabled:opacity-50"
                        >
                          {isSavingTpl ? "저장 중…" : "저장"}
                        </button>
                        <span className="text-[11px] text-muted-foreground/70">비워 두면 템플릿 없음으로 저장돼요.</span>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === "utm" && (
                    <motion.div key="utm" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="space-y-6">

                      {/* UTM 허용값 */}
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">UTM 허용값</p>
                          <p className="text-xs text-muted-foreground mt-1">source, medium, campaign 규칙값이 UTM 빌더 드롭다운과 추천값에 표시돼요.</p>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {PRESET_FIELDS.map(({ key, label }) => {
                            const count = presets.filter((p) => p.field === key).length;
                            return (
                              <button key={key} onClick={() => setActiveField(key)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeField === key ? "bg-violet-500 text-white" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                                {label}
                                {count > 0 && <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${activeField === key ? "bg-white/20" : "bg-border"}`}>{count}</span>}
                              </button>
                            );
                          })}
                        </div>

                        {fieldPresets.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-3 text-center border border-dashed border-border rounded-xl">아직 등록된 허용값이 없어요</p>
                        ) : (
                          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                            <SortableContext items={fieldPresets.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                              <div className="space-y-1.5">
                                {fieldPresets.map((p) => (
                                  <SortablePresetRow key={p.id} p={p} activeField={activeField}
                                    editingPresetId={editingPresetId} editingLabel={editingLabel}
                                    editingValue={editingValue} isSavingPreset={isSavingPreset}
                                    onEdit={startEditPreset} onSave={handleSavePreset}
                                    onCancel={() => setEditingPresetId(null)} onDelete={handleDeletePreset}
                                    setEditingLabel={setEditingLabel} setEditingValue={setEditingValue}
                                  />
                                ))}
                              </div>
                            </SortableContext>
                          </DndContext>
                        )}

                        <div className="space-y-2 pt-1 border-t border-border">
                          <p className="text-xs text-muted-foreground pt-1">새 항목 추가</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[11px] text-muted-foreground">표시 이름</label>
                              <input type="text"
                                placeholder={activeFieldMeta.labelPlaceholder}
                                value={newPresetLabel} onChange={(e) => setNewPresetLabel(e.target.value)}
                                className={smInputCls} />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[11px] text-muted-foreground">UTM 값 *</label>
                              <input type="text"
                                placeholder={activeFieldMeta.valuePlaceholder}
                                value={newPresetValue} onChange={(e) => setNewPresetValue(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") handleAddPreset(); }}
                                className={smInputCls} />
                            </div>
                          </div>
                          <motion.button whileTap={{ scale: 0.95 }} onClick={handleAddPreset}
                            disabled={!newPresetValue.trim() || isAddingPreset}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-40">
                            <Plus className="w-3.5 h-3.5" />추가
                          </motion.button>
                        </div>
                      </div>

                      <div className="h-px bg-border" />

                      {/* UTM 템플릿 */}
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">UTM 템플릿</p>
                          <p className="text-xs text-muted-foreground mt-1">자주 쓰는 UTM 조합을 저장해두면 UTM 빌더에서 원클릭으로 자동 완성돼요.</p>
                        </div>

                        {templates.length === 0 && !showNewTemplate ? (
                          <p className="text-sm text-muted-foreground py-3 text-center border border-dashed border-border rounded-xl">아직 등록된 템플릿이 없어요</p>
                        ) : (
                          <div className="space-y-2">
                            <AnimatePresence>
                              {templates.map((t) => (
                                <motion.div key={t.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0, overflow: "hidden" }}
                                  className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border hover:bg-secondary/40 transition-colors group">
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm">{t.name}</p>
                                    <div className="flex flex-wrap gap-1.5 mt-1">
                                      {([["source", t.source], ["medium", t.medium], ...(t.campaign ? [["campaign", t.campaign]] : []), ...(t.term ? [["term", t.term]] : []), ...(t.content ? [["content", t.content]] : [])] as [string, string][]).map(([k, v]) => (
                                        <span key={k} className="text-[11px] px-2 py-0.5 rounded-md bg-secondary text-muted-foreground font-mono">
                                          {k}=<span className="text-foreground">{v}</span>
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                  <button onClick={() => handleDeleteTemplate(t.id)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-500 text-muted-foreground">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </motion.div>
                              ))}
                            </AnimatePresence>
                          </div>
                        )}

                        <AnimatePresence mode="wait">
                          {showNewTemplate ? (
                            <motion.div key="form" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                              className="space-y-4 p-4 rounded-2xl border border-violet-400/30 bg-violet-500/5">
                              <p className="text-sm font-medium">새 템플릿 추가</p>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">템플릿 이름 *</label>
                                  <input type="text" placeholder="예: 구글 검색 광고" value={tForm.name}
                                    onChange={(e) => setTForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">utm_source *</label>
                                  <input type="text" list="utm-template-source-presets" placeholder="예: google" value={tForm.source}
                                    onChange={(e) => setTForm((f) => ({ ...f, source: e.target.value }))} className={inputCls} />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">utm_medium *</label>
                                  <input type="text" list="utm-template-medium-presets" placeholder="예: cpc" value={tForm.medium}
                                    onChange={(e) => setTForm((f) => ({ ...f, medium: e.target.value }))} className={inputCls} />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">utm_campaign *</label>
                                  <input type="text" list="utm-template-campaign-presets" placeholder="예: 2025_브랜드" value={tForm.campaign}
                                    onChange={(e) => setTForm((f) => ({ ...f, campaign: e.target.value }))} className={inputCls} />
                                </div>
                                <div>
                                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">utm_term (선택)</label>
                                  <input type="text" placeholder="예: 브랜드_키워드" value={tForm.term}
                                    onChange={(e) => setTForm((f) => ({ ...f, term: e.target.value }))} className={inputCls} />
                                </div>
                                <div className="col-span-2">
                                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">utm_content (선택)</label>
                                  <input type="text" placeholder="예: 배너_상단" value={tForm.content}
                                    onChange={(e) => setTForm((f) => ({ ...f, content: e.target.value }))} className={inputCls} />
                                </div>
                              </div>
                              {PRESET_FIELDS.map(({ key: field }) => (
                                <datalist key={field} id={`utm-template-${field}-presets`}>
                                  {templatePresetValues(field).map((preset) => (
                                    <option key={preset.id} value={preset.value}>{preset.label || preset.value}</option>
                                  ))}
                                </datalist>
                              ))}
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => { setShowNewTemplate(false); setTForm({ name: "", source: "", medium: "", campaign: "", term: "", content: "" }); }}
                                  className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary transition-colors">취소</button>
                                <motion.button whileTap={{ scale: 0.95 }} onClick={handleSaveTemplate}
                                  disabled={!tForm.name.trim() || !tForm.source.trim() || !tForm.medium.trim() || !tForm.campaign.trim() || isSavingTemplate}
                                  className="px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600 transition-colors disabled:opacity-40">
                                  {isSavingTemplate ? "저장 중..." : "저장"}
                                </motion.button>
                              </div>
                            </motion.div>
                          ) : (
                            <motion.button key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                              onClick={() => setShowNewTemplate(true)}
                              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:border-violet-400 hover:text-violet-400 transition-colors">
                              <Plus className="w-3.5 h-3.5" />새 템플릿 추가
                            </motion.button>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}

                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
