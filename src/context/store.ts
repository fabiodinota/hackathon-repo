import { sessionIdPattern } from "./builder.js";
import { validateIntent } from "../intent/validator.js";
import type { StoredContext } from "./types.js";

export type ContextUpdate = {
  readonly sessionId: string;
  readonly token: symbol;
};

export interface ContextStore {
  beginUpdate(sessionId: string): ContextUpdate;
  commitUpdate(update: ContextUpdate, context: StoredContext): boolean;
  /** createdAt must be captured before any asynchronous processing begins. */
  set(sessionId: string, context: StoredContext): void;
  get(sessionId: string): StoredContext | null;
  delete(sessionId: string): boolean;
  pause(sessionId: string): void;
  resume(sessionId: string): void;
  isPaused(sessionId: string): boolean;
  clearExpired(): number;
}
export const DEFAULT_CONTEXT_TTL_MS = 300000;
export class ContextStoreError extends Error {
  constructor(readonly code: "INVALID_SESSION" | "INVALID_CONTEXT") {
    super(code);
  }
}

/** Retains only component 7's validated intent projection. Recommendations are
 * computed on read; arbitrary recommendation text is deliberately not retained.
 * Session adapters must also invalidate pending async work with processing leases.
 */
export class EphemeralContextStore implements ContextStore {
  private readonly contexts = new Map<string, StoredContext>();
  private readonly paused = new Map<string, number>();
  private readonly pending = new Map<
    string,
    { token: symbol; expiresAt: number }
  >();
  private readonly tombstones = new Map<string, number>();
  constructor(
    private readonly ttlMs = DEFAULT_CONTEXT_TTL_MS,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > DEFAULT_CONTEXT_TTL_MS)
      throw new Error("Invalid context TTL");
  }
  beginUpdate(sessionId: string): ContextUpdate {
    this.assertSessionId(sessionId);
    if (this.isPaused(sessionId))
      throw new ContextStoreError("INVALID_CONTEXT");
    const token = Symbol();
    this.pending.set(sessionId, { token, expiresAt: this.now() + this.ttlMs });
    return { sessionId, token };
  }
  commitUpdate(update: ContextUpdate, context: StoredContext): boolean {
    const pending = this.pending.get(update.sessionId);
    if (
      !pending ||
      pending.token !== update.token ||
      pending.expiresAt <= this.now() ||
      this.isPaused(update.sessionId)
    )
      return false;
    this.pending.delete(update.sessionId);
    this.write(update.sessionId, context, true);
    return true;
  }
  set(sessionId: string, context: StoredContext): void {
    this.write(sessionId, context, false);
  }
  private write(
    sessionId: string,
    context: StoredContext,
    leased: boolean,
  ): void {
    this.assertSessionId(sessionId);
    const now = this.now();
    const created = timestamp(context?.createdAt);
    const requestedExpiry = timestamp(context?.expiresAt);
    if (
      !context ||
      context.sessionId !== sessionId ||
      !Number.isFinite(created) ||
      created > now ||
      !Number.isFinite(requestedExpiry) ||
      requestedExpiry <= created ||
      Math.min(requestedExpiry, created + this.ttlMs) <= now
    )
      throw new ContextStoreError("INVALID_CONTEXT");
    if (
      this.isPaused(sessionId) ||
      (!leased && created <= (this.tombstones.get(sessionId) ?? -Infinity))
    )
      return;
    try {
      const generated = timestamp(context.intent?.generatedAt);
      if (!Number.isFinite(generated)) throw new Error();
      const intent = validateIntent(context.intent, 0, new Date(generated));
      this.contexts.set(sessionId, {
        sessionId,
        intent,
        createdAt: new Date(created).toISOString(),
        expiresAt: new Date(
          Math.min(requestedExpiry, created + this.ttlMs),
        ).toISOString(),
      });
    } catch {
      throw new ContextStoreError("INVALID_CONTEXT");
    }
  }
  get(sessionId: string): StoredContext | null {
    this.assertSessionId(sessionId);
    const value = this.contexts.get(sessionId);
    if (!value) return null;
    if (Date.parse(value.expiresAt) <= this.now()) {
      this.contexts.delete(sessionId);
      return null;
    }
    return structuredClone(value);
  }
  delete(sessionId: string): boolean {
    this.assertSessionId(sessionId);
    this.tombstones.set(sessionId, this.now());
    this.pending.delete(sessionId);
    return this.contexts.delete(sessionId);
  }
  pause(sessionId: string): void {
    this.assertSessionId(sessionId);
    this.paused.set(sessionId, this.now() + this.ttlMs);
    this.pending.delete(sessionId);
  }
  resume(sessionId: string): void {
    this.assertSessionId(sessionId);
    this.paused.delete(sessionId);
  }
  isPaused(sessionId: string): boolean {
    this.assertSessionId(sessionId);
    if ((this.paused.get(sessionId) ?? 0) <= this.now())
      this.paused.delete(sessionId);
    return this.paused.has(sessionId);
  }
  clearExpired(): number {
    const now = this.now();
    let removed = 0;
    for (const [id, value] of this.contexts) {
      if (Date.parse(value.expiresAt) <= now) {
        this.contexts.delete(id);
        removed++;
      }
    }
    for (const [id, until] of this.paused)
      if (until <= now) this.paused.delete(id);
    for (const [id, at] of this.tombstones)
      if (at + this.ttlMs <= now) this.tombstones.delete(id);
    for (const [id, value] of this.pending)
      if (value.expiresAt <= now) this.pending.delete(id);
    return removed;
  }
  private assertSessionId(id: string): void {
    if (typeof id !== "string" || !sessionIdPattern.test(id))
      throw new ContextStoreError("INVALID_SESSION");
  }
}
function timestamp(value: unknown): number {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)
  )
    return NaN;
  return Date.parse(value);
}
