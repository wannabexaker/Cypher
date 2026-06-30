import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildEmbedUrl,
  classifyEmbedUrl,
  fetchEmbedMeta,
  oembedRequestUrl,
} from "@/lib/embeds";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("embed URL classification", () => {
  it.each([
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share",
    "https://m.youtube.com/shorts/dQw4w9WgXcQ",
    "https://music.youtube.com/embed/dQw4w9WgXcQ",
  ])("normalizes supported YouTube links: %s", (url) => {
    expect(classifyEmbedUrl(url)).toEqual({
      sourceType: "YOUTUBE",
      normalizedUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
  });

  it("normalizes official Spotify and SoundCloud URLs", () => {
    expect(classifyEmbedUrl("https://open.spotify.com/track/abc123?si=x")).toEqual({
      sourceType: "SPOTIFY",
      normalizedUrl: "https://open.spotify.com/track/abc123",
    });
    expect(classifyEmbedUrl("https://soundcloud.com/artist_name/my-track")).toEqual({
      sourceType: "SOUNDCLOUD",
      normalizedUrl: "https://soundcloud.com/artist_name/my-track",
    });
  });

  it.each([
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.example/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=too-short",
    "javascript:alert(1)",
  ])("rejects unsafe or malformed URLs: %s", (url) => {
    expect(classifyEmbedUrl(url)).toBeNull();
  });
});

describe("embed output hardening", () => {
  it("builds a fixed YouTube iframe URL", () => {
    expect(
      buildEmbedUrl(
        "YOUTUBE",
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      ),
    ).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
  });

  it("builds fixed Spotify and SoundCloud iframe hosts", () => {
    expect(
      buildEmbedUrl("SPOTIFY", "https://open.spotify.com/track/abc123"),
    ).toBe("https://open.spotify.com/embed/track/abc123");

    const soundcloud = buildEmbedUrl(
      "SOUNDCLOUD",
      "https://soundcloud.com/artist/my-track",
    );
    expect(soundcloud).not.toBeNull();
    expect(new URL(soundcloud!).origin).toBe("https://w.soundcloud.com");
    expect(new URL(soundcloud!).searchParams.get("url")).toBe(
      "https://soundcloud.com/artist/my-track",
    );
  });

  it("rejects a stored URL whose provider does not match", () => {
    expect(
      buildEmbedUrl("YOUTUBE", "https://attacker.example/dQw4w9WgXcQ"),
    ).toBeNull();
  });

  it("always sends oEmbed requests to a hardcoded provider host", () => {
    const request = oembedRequestUrl(
      "YOUTUBE",
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(request).not.toBeNull();
    expect(new URL(request!).origin).toBe("https://www.youtube.com");
    expect(oembedRequestUrl("UNKNOWN", "https://example.com")).toBeNull();
  });

  it("parses bounded oEmbed metadata without following user hosts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          title: "E2E Track",
          author_name: "E2E Artist",
          thumbnail_url: "https://i.ytimg.com/example.jpg",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchEmbedMeta("https://youtu.be/dQw4w9WgXcQ"),
    ).resolves.toEqual({
      provider: "YOUTUBE",
      title: "E2E Track",
      artist: "E2E Artist",
      thumbnailUrl: "https://i.ytimg.com/example.jpg",
    });

    const [requestUrl, options] = fetchMock.mock.calls[0];
    expect(new URL(requestUrl).origin).toBe("https://www.youtube.com");
    expect(options).toMatchObject({ redirect: "error" });
  });

  it("fails closed on provider errors and oversized responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response("nope", { status: 502 })),
    );
    await expect(
      fetchEmbedMeta("https://youtu.be/dQw4w9WgXcQ"),
    ).resolves.toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response("x".repeat(65 * 1024), { status: 200 }),
      ),
    );
    await expect(
      fetchEmbedMeta("https://youtu.be/dQw4w9WgXcQ"),
    ).resolves.toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline")));
    await expect(
      fetchEmbedMeta("https://youtu.be/dQw4w9WgXcQ"),
    ).resolves.toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response("not-json", { status: 200 })),
    );
    await expect(
      fetchEmbedMeta("https://youtu.be/dQw4w9WgXcQ"),
    ).resolves.toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response("null", { status: 200 })),
    );
    await expect(
      fetchEmbedMeta("https://youtu.be/dQw4w9WgXcQ"),
    ).resolves.toBeNull();
  });

  it("sanitizes optional oEmbed metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            title: "   ",
            author_name: 42,
            thumbnail_url: "http://insecure.example/cover.jpg",
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      fetchEmbedMeta("https://youtu.be/dQw4w9WgXcQ"),
    ).resolves.toEqual({
      provider: "YOUTUBE",
      title: null,
      artist: null,
      thumbnailUrl: null,
    });
  });
});
