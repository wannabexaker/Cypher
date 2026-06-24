// Embed allowlist + normalization. Isomorphic: NO Node-only imports so this can
// be bundled into the client <TrackPlayer>. Only official hosts are accepted and
// every produced iframe src is re-validated here (defense in depth vs SSRF/XSS).

export type EmbedSourceType = "SPOTIFY" | "SOUNDCLOUD";

export type ClassifiedEmbed = {
  sourceType: EmbedSourceType;
  normalizedUrl: string;
};

const SPOTIFY_HOSTS = new Set(["open.spotify.com"]);
const SOUNDCLOUD_FULL_HOSTS = new Set(["soundcloud.com", "www.soundcloud.com"]);
const SOUNDCLOUD_SHORT_HOST = "on.soundcloud.com";

const SPOTIFY_TYPES = new Set([
  "track",
  "album",
  "playlist",
  "episode",
  "show",
]);

const SPOTIFY_ID = /^[A-Za-z0-9]+$/;
const SOUNDCLOUD_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

function parseHttpsUrl(rawUrl: string): URL | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  return url;
}

export function classifyEmbedUrl(rawUrl: string): ClassifiedEmbed | null {
  const url = parseHttpsUrl(rawUrl);
  if (!url) return null;
  const host = url.hostname.toLowerCase();

  if (SPOTIFY_HOSTS.has(host)) {
    const segments = url.pathname.split("/").filter(Boolean);
    // Tolerate an optional locale prefix, e.g. /intl-de/track/<id>.
    const offset = segments[0]?.startsWith("intl-") ? 1 : 0;
    const type = segments[offset];
    const id = segments[offset + 1];
    if (!type || !id) return null;
    if (!SPOTIFY_TYPES.has(type)) return null;
    if (!SPOTIFY_ID.test(id)) return null;
    return {
      sourceType: "SPOTIFY",
      normalizedUrl: `https://open.spotify.com/${type}/${id}`,
    };
  }

  if (host === SOUNDCLOUD_SHORT_HOST) {
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 1 || !SOUNDCLOUD_SEGMENT.test(segments[0])) {
      return null;
    }
    return {
      sourceType: "SOUNDCLOUD",
      normalizedUrl: `https://on.soundcloud.com/${segments[0]}`,
    };
  }

  if (SOUNDCLOUD_FULL_HOSTS.has(host)) {
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 1 || segments.length > 4) return null;
    if (!segments.every((segment) => SOUNDCLOUD_SEGMENT.test(segment))) {
      return null;
    }
    return {
      sourceType: "SOUNDCLOUD",
      normalizedUrl: `https://soundcloud.com/${segments.join("/")}`,
    };
  }

  return null;
}

// Build the sandbox-safe iframe src from a previously stored normalized URL.
// Re-validates the host so bad data can never produce an off-allowlist iframe.
export function buildEmbedUrl(
  sourceType: string,
  normalizedUrl: string,
): string | null {
  if (sourceType === "SPOTIFY") {
    const url = parseHttpsUrl(normalizedUrl);
    if (!url || url.hostname.toLowerCase() !== "open.spotify.com") return null;
    const segments = url.pathname.split("/").filter(Boolean);
    const type = segments[0];
    const id = segments[1];
    if (!type || !id || !SPOTIFY_TYPES.has(type) || !SPOTIFY_ID.test(id)) {
      return null;
    }
    return `https://open.spotify.com/embed/${type}/${id}`;
  }

  if (sourceType === "SOUNDCLOUD") {
    const url = parseHttpsUrl(normalizedUrl);
    if (!url) return null;
    const host = url.hostname.toLowerCase();
    if (host !== "soundcloud.com" && host !== SOUNDCLOUD_SHORT_HOST) return null;
    const widget = new URL("https://w.soundcloud.com/player/");
    widget.searchParams.set("url", url.toString());
    widget.searchParams.set("color", "#ff2d8b");
    widget.searchParams.set("visual", "true");
    return widget.toString();
  }

  return null;
}
