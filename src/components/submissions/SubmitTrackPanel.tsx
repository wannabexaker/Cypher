"use client";

import { Link2, LoaderCircle, Music2, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX_UPLOAD_BYTES } from "@/lib/media";

import {
  SubmissionStatusPill,
  type SubmissionStatusValue,
} from "./SubmissionStatusPill";
import { TrackPlayer } from "./TrackPlayer";

export type MySubmission = {
  id: string;
  status: SubmissionStatusValue;
  sourceType: string;
  artistName: string;
  trackTitle: string;
  description: string | null;
  rejectionReason: string | null;
  externalUrl: string | null;
  mediaAssetId: string | null;
};

type SubmitTrackPanelProps = {
  code: string;
  mySubmission: MySubmission | null;
};

type Mode = "file" | "embed";

const MAX_MB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));

function mimeFromFilename(name: string): "audio/mpeg" | "audio/wav" | null {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "wav") return "audio/wav";
  return null;
}

export function SubmitTrackPanel({ code, mySubmission }: SubmitTrackPanelProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("file");
  const [artistName, setArtistName] = useState(mySubmission?.artistName ?? "");
  const [trackTitle, setTrackTitle] = useState(mySubmission?.trackTitle ?? "");
  const [description, setDescription] = useState(mySubmission?.description ?? "");
  const [externalUrl, setExternalUrl] = useState(mySubmission?.externalUrl ?? "");
  const [phase, setPhase] = useState<
    "idle" | "signing" | "uploading" | "saving"
  >("idle");
  const [error, setError] = useState("");

  const locked = mySubmission?.status === "APPROVED";
  const busy = phase !== "idle";

  async function submitFile() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose an MP3 or WAV file.");
      return;
    }
    const mimeType = mimeFromFilename(file.name);
    if (!mimeType) {
      setError("Only .mp3 and .wav files are supported.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`File is too large. Max ${MAX_MB} MB.`);
      return;
    }

    setError("");
    setPhase("signing");

    const signResponse = await fetch("/api/uploads/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelCode: code,
        filename: file.name,
        mimeType,
        sizeBytes: file.size,
      }),
    });
    const signPayload = (await signResponse.json()) as {
      mediaAssetId?: string;
      uploadUrl?: string;
      error?: string;
    };
    if (!signResponse.ok || !signPayload.uploadUrl || !signPayload.mediaAssetId) {
      setPhase("idle");
      setError(signPayload.error ?? "Unable to start the upload.");
      return;
    }

    setPhase("uploading");
    try {
      const putResponse = await fetch(signPayload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": mimeType },
        body: file,
      });
      if (!putResponse.ok) {
        setPhase("idle");
        setError("Upload failed. Try again.");
        return;
      }
    } catch {
      setPhase("idle");
      setError("Upload failed. Try again.");
      return;
    }

    setPhase("saving");
    const ok = await createSubmission({
      sourceType: "FILE",
      mediaAssetId: signPayload.mediaAssetId,
    });
    if (ok) router.refresh();
  }

  async function submitEmbed() {
    if (!externalUrl.trim()) {
      setError("Paste a Spotify or SoundCloud link.");
      return;
    }
    setError("");
    setPhase("saving");
    const ok = await createSubmission({
      sourceType: "EMBED",
      externalUrl: externalUrl.trim(),
    });
    if (ok) router.refresh();
  }

  async function createSubmission(
    source:
      | { sourceType: "FILE"; mediaAssetId: string }
      | { sourceType: "EMBED"; externalUrl: string },
  ): Promise<boolean> {
    const response = await fetch(`/api/channels/${code}/submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...source,
        artistName: artistName.trim(),
        trackTitle: trackTitle.trim(),
        description: description.trim() || undefined,
      }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setPhase("idle");
      setError(payload.error ?? "Unable to submit your track.");
      return false;
    }
    setPhase("idle");
    return true;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (mode === "file") {
      void submitFile();
    } else {
      void submitEmbed();
    }
  }

  const phaseLabel =
    phase === "signing"
      ? "Preparing…"
      : phase === "uploading"
        ? "Uploading…"
        : phase === "saving"
          ? "Submitting…"
          : null;

  return (
    <div className="rounded-xl border border-border bg-elevated p-6">
      <div className="flex items-center gap-3">
        <Music2 className="size-6 text-magenta" aria-hidden="true" />
        <h2 className="text-2xl font-bold text-foreground">Your track</h2>
      </div>

      {mySubmission && (
        <div className="mt-5 rounded-lg border border-border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-bold text-foreground">
              {mySubmission.artistName} — {mySubmission.trackTitle}
            </p>
            <SubmissionStatusPill status={mySubmission.status} />
          </div>
          {mySubmission.status === "REJECTED" && mySubmission.rejectionReason && (
            <p className="mt-3 rounded-md border border-magenta/30 bg-magenta/10 p-3 text-sm text-magenta">
              Host note: {mySubmission.rejectionReason}
            </p>
          )}
          <TrackPlayer
            sourceType={mySubmission.sourceType}
            mediaAssetId={mySubmission.mediaAssetId}
            externalUrl={mySubmission.externalUrl}
            trackTitle={mySubmission.trackTitle}
            artistName={mySubmission.artistName}
          />
        </div>
      )}

      {locked ? (
        <p className="mt-5 leading-7 text-muted-foreground">
          Your track is approved and locked in. Reach out to the host to make
          changes.
        </p>
      ) : (
        <>
          <p className="mt-5 text-sm leading-6 text-muted-foreground">
            {mySubmission
              ? "Submit again to replace your pending entry."
              : "Upload an MP3/WAV or paste an official Spotify/SoundCloud link."}
          </p>

          <div
            className="mt-5 flex gap-2"
            role="tablist"
            aria-label="Submission type"
          >
            <Button
              type="button"
              role="tab"
              aria-selected={mode === "file"}
              variant={mode === "file" ? "gradient" : "outline"}
              size="sm"
              onClick={() => setMode("file")}
            >
              <UploadCloud />
              File
            </Button>
            <Button
              type="button"
              role="tab"
              aria-selected={mode === "embed"}
              variant={mode === "embed" ? "gradient" : "outline"}
              size="sm"
              onClick={() => setMode("embed")}
            >
              <Link2 />
              Embed link
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
            {mode === "file" ? (
              <div>
                <label
                  htmlFor="track-file"
                  className="mb-2 block text-sm font-bold text-foreground"
                >
                  Audio file (.mp3 / .wav, max {MAX_MB} MB)
                </label>
                <input
                  id="track-file"
                  ref={fileRef}
                  type="file"
                  accept=".mp3,.wav,audio/mpeg,audio/wav"
                  required
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:min-h-11 file:rounded-md file:border file:border-border file:bg-surface file:px-4 file:text-sm file:font-bold file:text-foreground hover:file:bg-elevated"
                />
              </div>
            ) : (
              <div>
                <label
                  htmlFor="external-url"
                  className="mb-2 block text-sm font-bold text-foreground"
                >
                  Spotify or SoundCloud link
                </label>
                <Input
                  id="external-url"
                  name="externalUrl"
                  type="url"
                  inputMode="url"
                  placeholder="https://open.spotify.com/track/…"
                  value={externalUrl}
                  onChange={(event) => setExternalUrl(event.target.value)}
                />
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="artist-name"
                  className="mb-2 block text-sm font-bold text-foreground"
                >
                  Artist name
                </label>
                <Input
                  id="artist-name"
                  required
                  maxLength={60}
                  placeholder="MC Handle"
                  value={artistName}
                  onChange={(event) => setArtistName(event.target.value)}
                />
              </div>
              <div>
                <label
                  htmlFor="track-title"
                  className="mb-2 block text-sm font-bold text-foreground"
                >
                  Track title
                </label>
                <Input
                  id="track-title"
                  required
                  maxLength={120}
                  placeholder="Bars at midnight"
                  value={trackTitle}
                  onChange={(event) => setTrackTitle(event.target.value)}
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="track-description"
                className="mb-2 block text-sm font-bold text-foreground"
              >
                Notes (optional)
              </label>
              <Textarea
                id="track-description"
                maxLength={2000}
                placeholder="Anything the host should know."
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            <Button
              type="submit"
              variant="gradient"
              size="lg"
              className="w-full"
              disabled={busy}
            >
              {busy ? (
                <LoaderCircle className="motion-safe:animate-spin" />
              ) : (
                <Music2 />
              )}
              {phaseLabel ??
                (mySubmission ? "Replace submission" : "Submit track")}
            </Button>

            {error && (
              <p role="alert" className="text-sm text-magenta">
                {error}
              </p>
            )}
          </form>
        </>
      )}
    </div>
  );
}
