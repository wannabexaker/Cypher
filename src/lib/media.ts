// Audio media validation primitives. Intentionally free of Node-only imports so
// these constants/helpers stay isomorphic (usable in client + server bundles).
// Magic-byte sniffing + filename sanitizing are pure functions.

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB hard cap

export type FileSourceType = "FILE_MP3" | "FILE_WAV";
export type AudioMimeType = "audio/mpeg" | "audio/wav";

type AudioMimeConfig = {
  extensions: readonly string[];
  sourceType: FileSourceType;
};

export const AUDIO_MIME_TYPES: Record<AudioMimeType, AudioMimeConfig> = {
  "audio/mpeg": { extensions: ["mp3"], sourceType: "FILE_MP3" },
  "audio/wav": { extensions: ["wav"], sourceType: "FILE_WAV" },
};

export const AUDIO_MIME_VALUES = Object.keys(AUDIO_MIME_TYPES) as AudioMimeType[];

export function isAudioMimeType(value: string): value is AudioMimeType {
  return value in AUDIO_MIME_TYPES;
}

export function extensionForMime(mime: AudioMimeType): string {
  return AUDIO_MIME_TYPES[mime].extensions[0];
}

export function sourceTypeForMime(mime: AudioMimeType): FileSourceType {
  return AUDIO_MIME_TYPES[mime].sourceType;
}

export function extensionMatchesMime(filename: string, mime: AudioMimeType): boolean {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot < 0) return false;
  const extension = filename.slice(lastDot + 1).toLowerCase();
  return AUDIO_MIME_TYPES[mime].extensions.includes(extension);
}

// Strip any path components and unsafe characters. Never trust the user filename
// for storage keys — this output is used only for display + Content-Disposition.
export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^[._]+/, "")
    .slice(0, 120);
  return cleaned || "track";
}

// Number of leading bytes to read for magic-byte detection.
export const MAGIC_BYTE_READ_LENGTH = 16;

// Detect the real container from the leading bytes:
//   MP3: "ID3" tag (49 44 33) OR an MPEG frame sync (FF followed by E_/F_).
//   WAV: "RIFF"...."WAVE".
export function sniffAudioFormat(bytes: Uint8Array): AudioMimeType | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0x49 &&
    bytes[1] === 0x44 &&
    bytes[2] === 0x33
  ) {
    return "audio/mpeg";
  }

  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return "audio/mpeg";
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  ) {
    return "audio/wav";
  }

  return null;
}

export function magicBytesMatchMime(bytes: Uint8Array, mime: AudioMimeType): boolean {
  return sniffAudioFormat(bytes) === mime;
}
