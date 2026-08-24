function isLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return normalized === "localhost"
    || normalized.endsWith(".localhost")
    || normalized === "127.0.0.1"
    || normalized.startsWith("127.")
    || normalized === "0.0.0.0"
    || normalized === "[::1]"
    || normalized.endsWith(".local");
}

function isVercelDeploymentHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  return normalized === "vercel.app" || normalized.endsWith(".vercel.app");
}

type OriginValidationOptions = {
  rejectVercelDeploymentHost?: boolean;
};

function toCanonicalOutboundOrigin(
  value: string | undefined,
  { rejectVercelDeploymentHost = false }: OriginValidationOptions = {},
) {
  const configured = value?.trim();
  if (!configured) return "";

  try {
    const url = new URL(configured);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:")
      || url.username
      || url.password
      || url.pathname !== "/"
      || url.search
      || url.hash
      || isLocalHostname(url.hostname)
      || (rejectVercelDeploymentHost && isVercelDeploymentHostname(url.hostname))
    ) {
      return "";
    }
    return url.origin;
  } catch {
    return "";
  }
}

/**
 * Stable address for code and links copied to partner sites.
 *
 * This deliberately never falls back to the browser location: a local or preview
 * host copied once becomes a broken external integration later. `NEXT_PUBLIC_APP_URL`
 * remains a backwards-compatible fallback only when it is already a safe canonical URL;
 * Vercel hosts require the explicit operator assertion in the canonical variable.
 */
export function getPublicAppOrigin() {
  return toCanonicalOutboundOrigin(process.env.NEXT_PUBLIC_CANONICAL_APP_URL)
    || toCanonicalOutboundOrigin(process.env.NEXT_PUBLIC_APP_URL, { rejectVercelDeploymentHost: true });
}

export function getAuthCallbackUrl() {
  // OAuth and password-reset callbacks must return to the browser that initiated
  // the flow. They are runtime navigation, not a URL copied to an external site.
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  if (!origin) return "/auth/callback";
  return new URL("/auth/callback", origin).toString();
}
