import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "Cypher — drop your bars, the crowd decides";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const signature = "linear-gradient(120deg, #ff2e97 0%, #8b5cf6 50%, #22d3ee 100%)";

export default function OpengraphImage() {
  const bars = [140, 260, 180, 300, 210];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#08080c",
          padding: "80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", height: "72px" }}>
            {[40, 72, 52, 64].map((h, i) => (
              <div
                key={i}
                style={{
                  width: "14px",
                  height: `${h}px`,
                  borderRadius: "7px",
                  background: signature,
                }}
              />
            ))}
          </div>
          <div
            style={{
              color: "#a1a1aa",
              fontSize: "30px",
              fontWeight: 700,
              letterSpacing: "6px",
              textTransform: "uppercase",
            }}
          >
            Music competitions
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: "180px",
              fontWeight: 800,
              letterSpacing: "-4px",
              color: "transparent",
              backgroundImage: signature,
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              lineHeight: 1,
            }}
          >
            CYPHER
          </div>
          <div style={{ display: "flex", color: "#e4e4e7", fontSize: "48px", marginTop: "28px" }}>
            Drop your bars. The crowd decides.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", color: "#71717a", fontSize: "30px" }}>
            cypher.olamov.com
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "8px", height: "72px" }}>
            {bars.map((h, i) => (
              <div
                key={i}
                style={{
                  width: "12px",
                  height: `${h / 5}px`,
                  borderRadius: "6px",
                  background: signature,
                  opacity: 0.85,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
