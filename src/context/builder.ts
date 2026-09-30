import { PipelineError } from "../errors/pipeline-errors.js";
import { defaultContextPolicy, type ContextPolicy } from "./policy.js";
import type { ModelContext, ModelFrame, SanitizedInput } from "./types.js";
import { validSanitizedPng } from "./image-policy.js";
import { violatesTextPolicy } from "./text-policy.js";
export type ContextBuilderOptions = Partial<ContextPolicy> & {
  now?: () => number;
};
export const sessionIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class ContextBuilder {
  private readonly policy: ContextPolicy;
  private readonly now: () => number;
  constructor(options: ContextBuilderOptions = {}) {
    this.policy = { ...defaultContextPolicy, ...options };
    this.policy.maxFrames = Math.min(3, this.policy.maxFrames);
    this.policy.maxSeconds = Math.min(60, this.policy.maxSeconds);
    if (
      Object.values(this.policy).some(
        (v) => typeof v === "number" && (!Number.isFinite(v) || v < 1),
      )
    )
      throw new Error("Invalid context policy");
    this.now = options.now ?? Date.now;
  }
  build(input: SanitizedInput): ModelContext {
    if (
      !input ||
      typeof input !== "object" ||
      typeof input.sessionId !== "string" ||
      !sessionIdPattern.test(input.sessionId)
    )
      throw new PipelineError("INVALID_INPUT", "Invalid session.");
    if (!Array.isArray(input.frames) || input.frames.length === 0)
      throw new PipelineError("EMPTY_CONTEXT", "No sanitized frames.");
    if (
      input.frames.length > 20 ||
      !Number.isFinite(input.timeWindowSeconds) ||
      input.timeWindowSeconds <= 0
    )
      throw new PipelineError("INVALID_INPUT", "Invalid context.");
    const now = this.now();
    const window = Math.min(input.timeWindowSeconds, this.policy.maxSeconds);
    const valid = input.frames
      .map((frame) => this.frame(frame))
      .filter((f): f is ModelFrame => !!f)
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    if (!valid.length)
      throw new PipelineError("EMPTY_CONTEXT", "No usable sanitized frames.");
    const frames = valid
      .filter(
        (f) =>
          Date.parse(f.timestamp) >= now - window * 1000 &&
          Date.parse(f.timestamp) <= now,
      )
      .slice(0, this.policy.maxFrames);
    if (!frames.length)
      throw new PipelineError("EXPIRED_SESSION", "Context expired.");
    const context = {
      sessionId: input.sessionId,
      frames,
      timeWindowSeconds: window,
    };
    if (
      Buffer.byteLength(JSON.stringify(context)) > this.policy.maxPayloadBytes
    )
      throw new PipelineError("PAYLOAD_TOO_LARGE", "Context too large.");
    return context;
  }
  private frame(value: unknown): ModelFrame | undefined {
    if (!value || typeof value !== "object") return;
    const f = value as Record<string, unknown>;
    if (
      typeof f.id !== "string" ||
      !f.id.trim() ||
      f.id.length > 100 ||
      f.source !== "allowlisted_tab"
    )
      return;
    if (
      typeof f.timestamp !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(f.timestamp) ||
      !Number.isFinite(Date.parse(f.timestamp)) ||
      new Date(f.timestamp).toISOString() !== f.timestamp
    )
      return;
    if (
      f.ocrConfidence !== undefined &&
      (typeof f.ocrConfidence !== "number" ||
        !Number.isFinite(f.ocrConfidence) ||
        f.ocrConfidence < 0.8 ||
        f.ocrConfidence > 1)
    )
      return;
    if (
      !Array.isArray(f.safeText) ||
      f.safeText.length > this.policy.maxTextItemsPerFrame
    )
      return;
    if (
      !f.safeText.every(
        (t) =>
          typeof t === "string" &&
          t.length <= this.policy.maxTextItemLength &&
          !violatesTextPolicy(t),
      )
    )
      return;
    const safeText = f.safeText
      .map((t) => (t as string).trim())
      .filter(Boolean);
    if (
      f.imageBase64 !== undefined &&
      !validSanitizedPng(f.imageBase64, this.policy.maxImageBytes)
    )
      return;
    if (!safeText.length && !f.imageBase64) return;
    return {
      safeText,
      timestamp: f.timestamp,
      ...(f.imageBase64 ? { imageBase64: f.imageBase64 as string } : {}),
    };
  }
}
