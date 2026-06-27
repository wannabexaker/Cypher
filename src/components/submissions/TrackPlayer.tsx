"use client";

import { Lock, LoaderCircle, Music2, Play, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { buildEmbedUrl } from "@/lib/embeds";

type TrackPlayerProps = {
  sourceType: string;
  mediaAssetId?: string | null;
  externalUrl?: string | null;
  trackTitle: string;
  artistName: string;
  // H14: only host/ADMIN, channel MODERATORs, and the uploader may play FILE
  // tracks. Embeds (Spotify/SoundCloud) are public and ignore this flag.
  canPlayFile?: boolean;
};

const IFRAME_SANDBOX = "allow-scripts allow-same-origin allow-popups allow-presentation";

function FilePlayer({ mediaAssetId }: { mediaAssetId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function loadTrack() {
    setError("");
    setPending(true);
    try {
      const response = await fetch(`/api/media/${mediaAssetId}/url`);
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        setError(payload.error ?? "Unable to load this track.");
        return;
      }
      setUrl(payload.url);
    } catch {
      setError("Unable to load this track.");
    } finally {
      setPending(false);
    }
  }

  if (url) {
    return (
      <audio
        controls
        autoPlay
        preload="none"
        src={url}
        className="mt-4 w-full"
      >
        Your browser does not support the audio element.
      </audio>
    );
  }

  return (
    <div className="mt-4">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void loadTrack()}
        disabled={pending}
      >
        {pending ? (
          <LoaderCircle className="motion-safe:animate-spin" />
        ) : (
          <Play />
        )}
        Load audio
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-magenta">
          {error}
        </p>
      )}
    </div>
  );
}

export function TrackPlayer({
  sourceType,
  mediaAssetId,
  externalUrl,
  trackTitle,
  artistName,
  canPlayFile = true,
}: TrackPlayerProps) {
  const title = `${artistName} — ${trackTitle}`;

  if (sourceType.startsWith("FILE")) {
    if (!mediaAssetId) {
      return (
        <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
          <TriangleAlert className="size-4" />
          Audio is unavailable.
        </p>
      );
    }
    if (!canPlayFile) {
      return (
        <p className="mt-4 inline-flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-2 text-sm text-muted-foreground">
          <Lock className="size-4 text-magenta" aria-hidden="true" />
          Only the host, moderators, and the artist can play uploaded tracks.
        </p>
      );
    }
    return <FilePlayer mediaAssetId={mediaAssetId} />;
  }

  const embedUrl = externalUrl ? buildEmbedUrl(sourceType, externalUrl) : null;

  if (!embedUrl) {
    return (
      <p className="mt-4 inline-flex items-center gap-2 text-sm text-muted-foreground">
        <TriangleAlert className="size-4" />
        This embedded track is unavailable.
      </p>
    );
  }

  const isSpotify = sourceType === "SPOTIFY";
  const isYouTube = sourceType === "YOUTUBE";
  const providerLabel = isSpotify
    ? "Spotify"
    : isYouTube
      ? "YouTube"
      : "SoundCloud";

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
        <Music2 className="size-3.5 text-magenta" />
        {providerLabel}
      </div>
      {isYouTube ? (
        <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
          <iframe
            title={title}
            src={embedUrl}
            loading="lazy"
            sandbox={IFRAME_SANDBOX}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
            style={{ border: 0 }}
          />
        </div>
      ) : (
        <iframe
          title={title}
          src={embedUrl}
          loading="lazy"
          sandbox={IFRAME_SANDBOX}
          allow="encrypted-media; clipboard-write; picture-in-picture"
          className="w-full"
          height={isSpotify ? 152 : 166}
          style={{ border: 0 }}
        />
      )}
    </div>
  );
}
