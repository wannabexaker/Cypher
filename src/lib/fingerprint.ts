import type { Agent } from "@fingerprintjs/fingerprintjs";

let agentPromise: Promise<Agent> | null = null;

export async function getBrowserFingerprint() {
  agentPromise ??= import("@fingerprintjs/fingerprintjs").then(
    ({ default: FingerprintJS }) => FingerprintJS.load(),
  );
  const agent = await agentPromise;
  const result = await agent.get();
  return result.visitorId;
}
