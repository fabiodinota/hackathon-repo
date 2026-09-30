export type AssistContext = {
  intent: string;
  confidence: "high" | "medium" | "low";
  signals: string[];
  receivedAt: string;
  expiresAt: string;
};

export const CONTEXT_DELAY_MS = 1100;
export const CONTEXT_TTL_MS = 15 * 60 * 1000;

// Replace this adapter with the local service later. No screenshots are used here.
export function createContextFixture(now = new Date()): AssistContext {
  return {
    intent: "Planning to buy a home",
    confidence: "high",
    signals: ["Viewed housing listings", "Used a budget calculator"],
    receivedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CONTEXT_TTL_MS).toISOString(),
  };
}

export function canSuggestHome(
  context: AssistContext | null,
  now = Date.now(),
): boolean {
  return (
    !!context &&
    context.confidence === "high" &&
    context.intent === "Planning to buy a home" &&
    context.signals.length > 0 &&
    Date.parse(context.expiresAt) > now
  );
}
