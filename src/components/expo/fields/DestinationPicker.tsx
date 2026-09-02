"use client";

import { isSafePublicUrl } from "@/lib/expo/destination";
import { EXPO_V2_RULES, type DestinationAction, type DestinationConfig } from "@/lib/expo/types";

export interface DestinationPickerProps {
  label: string;
  destinations: readonly DestinationConfig[];
  value: string;
  disabled?: boolean;
  onChange(value: string): void;
}

export function isAvailableDestination(destination: DestinationConfig): boolean {
  if (!destination.enabled) return false;
  const action: DestinationAction = destination.action;
  if (action.type === "url" || action.type === "download") return isSafePublicUrl(action.href);
  if (action.type === "anchor") return EXPO_V2_RULES.anchorOrModal.test(action.target);
  return EXPO_V2_RULES.anchorOrModal.test(action.modalId)
    && (!action.fallbackHref || isSafePublicUrl(action.fallbackHref));
}

export function DestinationPicker({ label, destinations, value, disabled, onChange }: DestinationPickerProps) {
  return (
    <label className="block min-w-0 text-[11px] text-muted-foreground">
      {label}
      <select aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="mt-0.5 min-h-9 w-full min-w-0 rounded-md bg-background px-2 text-xs text-foreground disabled:opacity-60">
        <option value="">목적지 선택</option>
        {destinations.map((destination) => {
          const available = isAvailableDestination(destination);
          return <option key={destination.id} value={destination.id} disabled={!available}>{destination.label}{available ? "" : " — 사용할 수 없음"}</option>;
        })}
      </select>
    </label>
  );
}
