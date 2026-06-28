// H19: oEmbed proxy route.
//
// SECURITY (SSRF):
//   The classify-first guard MUST run before any outbound fetch. If
//   classifyEmbedUrl returns null, the route responds 400 and never touches
//   the network — that prevents reviewers' SSRF probes (e.g.
//   http://169.254.169.254/…, https://evil.com/…) from reaching the
//   provider fetch in src/lib/embeds.ts at all. The fetch itself is
//   further constrained (hardcoded host allowlist, redirect: "error",
//   5s timeout, response cap) inside fetchEmbedMeta.
//
// On a successful provider lookup we return { title, artist, thumbnailUrl }.
// On any failure (provider down, parse miss, throttled) we return
// { title: null } with status 200 so the submit flow degrades gracefully —
// the user just types the title manually instead of seeing a 500.

import { NextResponse } from "next/server";

import { classifyEmbedUrl, fetchEmbedMeta } from "@/lib/embeds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");

  if (!target) {
    return NextResponse.json(
      { error: "Missing url query parameter." },
      { status: 400 },
    );
  }

  if (!classifyEmbedUrl(target)) {
    return NextResponse.json(
      { error: "Unsupported embed URL." },
      { status: 400 },
    );
  }

  const meta = await fetchEmbedMeta(target);
  if (!meta) {
    return NextResponse.json(
      { title: null, artist: null, thumbnailUrl: null },
      {
        status: 200,
        headers: { "Cache-Control": "public, max-age=86400" },
      },
    );
  }

  return NextResponse.json(
    {
      provider: meta.provider,
      title: meta.title,
      artist: meta.artist,
      thumbnailUrl: meta.thumbnailUrl,
    },
    {
      status: 200,
      headers: { "Cache-Control": "public, max-age=86400" },
    },
  );
}
