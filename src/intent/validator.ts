import { PipelineError } from "../errors/pipeline-errors.js";
import type { IntentResult } from "./types.js";
import { allowedIntents, allowedSignals } from "./vocabulary.js";

export function uncertainResult(now = new Date()): IntentResult {
  return {
    intent: null,
    confidence: 0,
    signals: [],
    uncertain: true,
    generatedAt: now.toISOString(),
  };
}
export function validateIntent(
  value: unknown,
  threshold = 0.8,
  now = new Date(),
): IntentResult {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1)
    throw new Error("Invalid threshold");
  if (typeof value === "string") {
    if (value.length > 4096) invalid();
    try {
      value = JSON.parse(value);
    } catch {
      invalid();
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  const record = value as Record<string, unknown>;
  const { confidence, intent, signals, uncertain } = record;
  if (
    typeof confidence !== "number" ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  )
    invalid();
  if (
    typeof uncertain !== "boolean" ||
    !Array.isArray(signals) ||
    signals.length > 3
  )
    invalid();
  if (
    intent !== null &&
    (typeof intent !== "string" ||
      intent.length > 64 ||
      !(allowedIntents as readonly string[]).includes(intent))
  )
    invalid();
  // A closed vocabulary prevents model-generated personal information from reaching clients.
  if (
    !signals.every(
      (s) =>
        typeof s === "string" &&
        s.length <= 80 &&
        (allowedSignals as readonly string[]).includes(s),
    )
  )
    invalid();
  const isUncertain =
    uncertain ||
    confidence < threshold ||
    intent === null ||
    signals.length === 0;
  return {
    intent: isUncertain ? null : intent,
    confidence,
    signals: isUncertain ? [] : [...new Set(signals)],
    uncertain: isUncertain,
    generatedAt: now.toISOString(),
  };
}
function invalid(): never {
  throw new PipelineError("INVALID_INTENT", "Invalid intent response.");
}
