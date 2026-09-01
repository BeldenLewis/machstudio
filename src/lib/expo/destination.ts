import { isSafePublicUrl as inspectSafePublicUrl } from "@/lib/url-safety";
import type { DestinationConfig, ResolvedDestination } from "@/lib/expo/types";

/** Public runtime targets are HTTPS-only and cannot carry URL credentials. */
export function isSafePublicUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const checked = inspectSafePublicUrl(value);
  if (!checked.ok || !checked.url) return false;
  return checked.url.username === "" && checked.url.password === "";
}

export function resolveDestinations(destinations: readonly DestinationConfig[]): ResolvedDestination[] {
  return destinations
    .filter((destination) => destination.enabled)
    .map(({ id, label, action, analytics }) => ({
      id,
      label,
      action,
      ...(analytics ? { analytics } : {}),
    }));
}
