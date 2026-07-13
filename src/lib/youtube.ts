/**
 * Accept either a YouTube video ID or the share URLs YouTube exposes, and
 * return the canonical 11-character video ID used by the embed player.
 */
export function getYouTubeVideoId(value: string | null | undefined): string | null {
  const input = value?.trim();
  if (!input) return null;

  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  let id: string | null = null;

  if (hostname === "youtu.be") {
    id = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(hostname)) {
    const segments = url.pathname.split("/").filter(Boolean);
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else if (["embed", "live", "shorts", "v"].includes(segments[0] ?? "")) id = segments[1] ?? null;
  }

  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}
