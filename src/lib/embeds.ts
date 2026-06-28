// Embed allowlist + normalization. Isomorphic: NO Node-only imports so this can
// be bundled into the client <TrackPlayer>. Only official hosts are accepted and
// every produced iframe src is re-validated here (defense in depth vs SSRF/XSS).

export type EmbedSourceType = "SPOTIFY" | "SOUNDCLOUD" | "YOUTUBE";

export type ClassifiedEmbed = {
  sourceType: EmbedSourceType;
  normalizedUrl: string;
};

const SPOTIFY_HOSTS = new Set(["open.spotify.com"]);
const SOUNDCLOUD_FULL_HOSTS = new Set(["soundcloud.com", "www.soundcloud.com"]);
const SOUNDCLOUD_SHORT_HOST = "on.soundcloud.com";

const YOUTUBE_WATCH_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
]);
const YOUTUBE_SHORT_HOST = "youtu.be";

const SPOTIFY_TYPES = new Set([
  "track",
  "album",
  "playlist",
  "episode",
  "show",
]);

const SPOTIFY_ID = /^[A-Za-z0-9]+$/;
const SOUNDCLOUD_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

function extractYoutubeId(url: URL): string | null {
  const host = url.hostname.toLowerCase();

  if (host === YOUTUBE_SHORT_HOST) {
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 1) return null;
    return YOUTUBE_ID.test(segments[0]) ? segments[0] : null;
  }

  if (YOUTUBE_WATCH_HOSTS.has(host)) {
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length === 0) {
      const id = url.searchParams.get("v");
      return id && YOUTUBE_ID.test(id) ? id : null;
    }
    // /watch?v=<id>
    if (segments[0] === "watch" && segments.length === 1) {
      const id = url.searchParams.get("v");
      return id && YOUTUBE_ID.test(id) ? id : null;
    }
    // /shorts/<id>
    if (segments[0] === "shorts" && segments.length === 2) {
      return YOUTUBE_ID.test(segments[1]) ? segments[1] : null;
    }
    // /embed/<id> — accept so a normalized share link round-trips cleanly.
    if (segments[0] === "embed" && segments.length === 2) {
      return YOUTUBE_ID.test(segments[1]) ? segments[1] : null;
    }
    return null;
  }

  return null;
}

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

  if (YOUTUBE_WATCH_HOSTS.has(host) || host === YOUTUBE_SHORT_HOST) {
    const id = extractYoutubeId(url);
    if (!id) return null;
    return {
      sourceType: "YOUTUBE",
      normalizedUrl: `https://www.youtube.com/watch?v=${id}`,
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

  if (sourceType === "YOUTUBE") {
    const url = parseHttpsUrl(normalizedUrl);
    if (!url) return null;
    const id = extractYoutubeId(url);
    if (!id) return null;
    return `https://www.youtube.com/embed/${id}`;
  }

  return null;
}

// --------------------------------------------------------------------------
// H19: oEmbed auto-title.
//
// SECURITY (SSRF): the oEmbed helpers below NEVER fetch a user-supplied URL
// host. The flow is:
//   1. classifyEmbedUrl(rawUrl) → null bails the caller BEFORE any fetch.
//   2. The classified provider picks one of three hardcoded oEmbed base URLs
//      (defined in OEMBED_BASES). The user's normalizedUrl is passed only as
//      the `url=` query parameter to that base; the host never comes from
//      user input.
//   3. fetchEmbedMeta uses `redirect: "error"` so a provider that tries to
//      bounce us to another host fails closed rather than following.
//   4. A 5s AbortSignal.timeout and a hard response-size cap (64 KB) bound
//      the cost of one call.
// `fetch` and `AbortSignal.timeout` exist in both Node and the browser, so
// this module stays bundle-safe; only the /api/oembed route imports
// fetchEmbedMeta in practice (per H19 spec — don't import into the client
// TrackPlayer).

const OEMBED_BASES = {
  SPOTIFY: "https://open.spotify.com/oembed",
  SOUNDCLOUD: "https://soundcloud.com/oembed",
  YOUTUBE: "https://www.youtube.com/oembed",
} as const;

const OEMBED_TIMEOUT_MS = 5000;
const OEMBED_MAX_BYTES = 64 * 1024; // oEmbed payloads are ~1-2 KB; 64 KB is paranoid headroom.

export type EmbedMeta = {
  provider: EmbedSourceType;
  title: string | null;
  artist: string | null;
  thumbnailUrl: string | null;
};

export function oembedRequestUrl(
  sourceType: string,
  normalizedUrl: string,
): string | null {
  const base = OEMBED_BASES[sourceType as EmbedSourceType];
  if (!base) return null;

  const requestUrl = new URL(base);
  requestUrl.searchParams.set("url", normalizedUrl);
  // SoundCloud + YouTube default to JSON when explicitly asked; Spotify only
  // serves JSON. The format pin is harmless and keeps responses predictable.
  if (sourceType === "SOUNDCLOUD" || sourceType === "YOUTUBE") {
    requestUrl.searchParams.set("format", "json");
  }
  return requestUrl.toString();
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asHttpsUrl(value: unknown): string | null {
  const raw = asString(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function fetchEmbedMeta(rawUrl: string): Promise<EmbedMeta | null> {
  const classified = classifyEmbedUrl(rawUrl);
  if (!classified) return null;

  const requestUrl = oembedRequestUrl(
    classified.sourceType,
    classified.normalizedUrl,
  );
  if (!requestUrl) return null;

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  let body: string;
  try {
    body = await response.text();
  } catch {
    return null;
  }
  if (body.length > OEMBED_MAX_BYTES) return null;

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  if (!json || typeof json !== "object") return null;

  const data = json as Record<string, unknown>;
  const title = asString(data.title);
  const thumbnailUrl = asHttpsUrl(data.thumbnail_url);
  // Spotify oEmbed has no author/uploader field. SoundCloud + YouTube expose
  // it as `author_name` (uploader / channel).
  const artist =
    classified.sourceType === "SPOTIFY" ? null : asString(data.author_name);

  return {
    provider: classified.sourceType,
    title,
    artist,
    thumbnailUrl,
  };
}
