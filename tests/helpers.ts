import type { SanitizedInput, SanitizedFrame } from "../src/context/types.js";
import type { IntentResult } from "../src/intent/types.js";
export const now = Date.parse("2026-09-30T12:00:00.000Z");
export const id = "00000000-0000-4000-8000-000000000001";
export const frame = (
  age = 1,
  extra: Partial<SanitizedFrame> = {},
): SanitizedFrame => ({
  id: "frame-" + age,
  safeText: ["property listing"],
  timestamp: new Date(now - age * 1000).toISOString(),
  source: "allowlisted_tab",
  ...extra,
});
export const input = (frames = [frame()]): SanitizedInput => ({
  sessionId: id,
  frames,
  timeWindowSeconds: 60,
});
export const valid: IntentResult = {
  intent: "home_purchase_planning",
  confidence: 0.91,
  signals: ["Viewed property listings", "Used a mortgage calculator"],
  uncertain: false,
  generatedAt: new Date(now).toISOString(),
};
// Construct synthetic values at runtime so complete sensitive-looking values are not committed.
export const sensitive = () => [
  ["fixture", "example.invalid"].join("@"),
  ["BE", "68", "5390", "0754", "7034"].join(""),
  Array(4).fill("4111").join(" "),
];
export const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC";
