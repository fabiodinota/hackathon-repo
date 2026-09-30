import { PipelineError } from '../errors/pipeline-errors.js';
import { defaultContextPolicy, type ContextPolicy } from './policy.js';
import type { ModelContext, SanitizedFrame, SanitizedInput } from './types.js';
const email = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/i;
const iban = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/i;
const card = /\b(?:\d[ -]?){13,19}\b/;
const secret = /\b(?:password|passwd|secret|api[_ -]?key|token)\s*[:=]/i;
export type ContextBuilderOptions = Partial<ContextPolicy> & { now?: () => number };
export class ContextBuilder {
  private readonly policy: ContextPolicy; private readonly now: () => number;
  constructor(options: ContextBuilderOptions = {}) { this.policy = { ...defaultContextPolicy, ...options }; this.now = options.now ?? Date.now; }
  build(input: SanitizedInput): ModelContext {
    if (!input || typeof input !== 'object' || !this.validSessionId(input.sessionId)) throw new PipelineError('INVALID_INPUT', 'The sanitized session is malformed.');
    if (!Array.isArray(input.frames) || input.frames.length === 0) throw new PipelineError('EMPTY_CONTEXT', 'No sanitized frames were provided.');
    if (!Number.isFinite(input.timeWindowSeconds) || input.timeWindowSeconds <= 0) throw new PipelineError('INVALID_INPUT', 'The context time window is invalid.');
    const window = Math.min(input.timeWindowSeconds, this.policy.maxSeconds);
    const validFrames = input.frames.filter((frame) => this.isUsableFrame(frame)).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, this.policy.maxFrames);
    if (validFrames.length === 0) throw new PipelineError('EMPTY_CONTEXT', 'No usable sanitized frames remain.');
    const newest = Date.parse(validFrames[0].timestamp);
    if (this.now() - newest > window * 1000) throw new PipelineError('EXPIRED_SESSION', 'The sanitized session has expired.');
    const frames = validFrames.map((frame) => ({ ...(frame.imageBase64 ? { imageBase64: frame.imageBase64 } : {}), safeText: frame.safeText.filter((text) => this.safeText(text)).slice(0, this.policy.maxTextItemsPerFrame), timestamp: frame.timestamp }));
    const context: ModelContext = { sessionId: input.sessionId, frames, timeWindowSeconds: window };
    if (Buffer.byteLength(JSON.stringify(context), 'utf8') > this.policy.maxPayloadBytes) throw new PipelineError('PAYLOAD_TOO_LARGE', 'The sanitized context exceeds its size limit.');
    if (frames.every((frame) => !frame.imageBase64 && frame.safeText.length === 0)) throw new PipelineError('EMPTY_CONTEXT', 'No safe content remains after filtering.');
    return context;
  }
  private isUsableFrame(frame: SanitizedFrame): boolean {
    if (!frame || typeof frame !== 'object' || typeof frame.id !== 'string' || !frame.id.trim() || frame.source !== 'allowlisted_tab' || !Array.isArray(frame.safeText)) return false;
    const timestamp = Date.parse(frame.timestamp); if (!Number.isFinite(timestamp) || timestamp > this.now() + 5000) return false;
    if (frame.ocrConfidence !== undefined && (!Number.isFinite(frame.ocrConfidence) || frame.ocrConfidence < 0 || frame.ocrConfidence > 1)) return false;
    if (frame.imageBase64 !== undefined && (typeof frame.imageBase64 !== 'string' || Buffer.byteLength(frame.imageBase64, 'utf8') > this.policy.maxImageBytes)) return false;
    return true;
  }
  private safeText(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 && value.length <= this.policy.maxTextItemLength && !email.test(value) && !iban.test(value.replaceAll(' ', '')) && !card.test(value) && !secret.test(value); }
  private validSessionId(value: unknown): value is string { return typeof value === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(value); }
}
