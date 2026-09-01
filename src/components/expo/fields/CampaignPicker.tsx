"use client";

import type { CampaignConfig } from "@/lib/expo/types";

export interface CampaignPickerProps {
  label: string;
  campaigns: readonly CampaignConfig[];
  value: readonly string[];
  disabled?: boolean;
  onChange(value: string[]): void;
}

export function CampaignPicker({ label, campaigns, value, disabled, onChange }: CampaignPickerProps) {
  const selected = new Set(value);
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="text-[11px] text-muted-foreground">{label}</legend>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {campaigns.map((campaign) => (
          <label key={campaign.id} className={`inline-flex min-h-8 items-center gap-1.5 text-xs ${campaign.enabled ? "" : "opacity-50"}`}>
            <input
              type="checkbox"
              checked={selected.has(campaign.id)}
              disabled={disabled || !campaign.enabled}
              onChange={(event) => {
                const next = new Set(value);
                if (event.target.checked) next.add(campaign.id); else next.delete(campaign.id);
                onChange(campaigns.map((item) => item.id).filter((id) => next.has(id)));
              }}
            />
            {campaign.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
