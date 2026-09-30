import { randomUUID, randomBytes, timingSafeEqual } from "node:crypto";
import type { IntentResult } from "../intent/types.js";
import {
  EphemeralContextStore,
  type ContextStore,
  type ContextUpdate,
} from "../context/store.js";
import type { StoredContext } from "../context/types.js";
import { uncertainResult, validateIntent } from "../intent/validator.js";

type Session = {
  token: string;
  expiresAt: number;
  paused: boolean;
  pending?: AbortController;
  generation: number;
};
export class SessionError extends Error {
  constructor(
    readonly code:
      | "UNAUTHORIZED"
      | "EXPIRED_SESSION"
      | "SESSION_PAUSED"
      | "BUSY"
      | "STALE_REQUEST",
  ) {
    super(code);
  }
}
export type ProcessingLease = {
  id: string;
  signal: AbortSignal;
  controller: AbortController;
  contextUpdate: ContextUpdate;
};
export class EphemeralIntentStore {
  private readonly sessions = new Map<string, Session>();
  constructor(
    private readonly ttlMs = 300000,
    private readonly now = Date.now,
    private readonly contexts: ContextStore = new EphemeralContextStore(
      ttlMs,
      now,
    ),
  ) {}
  start(): { sessionId: string; sessionToken: string; expiresAt: string } {
    this.cleanup();
    if (this.sessions.size >= 100) throw new SessionError("BUSY");
    const sessionId = randomUUID(),
      sessionToken = randomBytes(32).toString("hex");
    const expiresAt = this.now() + this.ttlMs;
    this.sessions.set(sessionId, {
      token: sessionToken,
      expiresAt,
      paused: false,
      generation: 0,
    });
    return {
      sessionId,
      sessionToken,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }
  authorize(id: string, token: string): number {
    const session = this.sessions.get(id);
    if (
      !session ||
      Buffer.byteLength(token) !== Buffer.byteLength(session.token) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(session.token))
    )
      throw new SessionError("UNAUTHORIZED");
    if (session.expiresAt <= this.now()) {
      session.pending?.abort();
      this.sessions.delete(id);
      this.contexts.delete(id);
      throw new SessionError("EXPIRED_SESSION");
    }
    return session.generation;
  }
  begin(id: string, expectedGeneration?: number): ProcessingLease {
    const session = this.require(id);
    if (
      expectedGeneration !== undefined &&
      expectedGeneration !== session.generation
    )
      throw new SessionError("STALE_REQUEST");
    if (session.paused) throw new SessionError("SESSION_PAUSED");
    if (session.pending) throw new SessionError("BUSY");
    const controller = new AbortController();
    const contextUpdate = this.contexts.beginUpdate(id);
    session.pending = controller;
    return {
      id,
      signal: controller.signal,
      controller,
      contextUpdate,
    };
  }
  release(lease: ProcessingLease): void {
    const session = this.sessions.get(lease.id);
    if (session?.pending === lease.controller) session.pending = undefined;
    lease.controller.abort();
    this.contexts.cancelUpdate(lease.contextUpdate);
  }
  finish(lease: ProcessingLease, result: IntentResult): IntentResult {
    const session = this.sessions.get(lease.id);
    if (
      !session ||
      session.pending !== lease.controller ||
      lease.signal.aborted ||
      session.paused ||
      session.expiresAt <= this.now()
    )
      return uncertainResult();
    session.pending = undefined;
    // Revalidate at the storage boundary and strip unexpected provider fields.
    let safe: IntentResult;
    try {
      safe = validateIntent(result, 0, new Date(result.generatedAt));
    } catch {
      safe = uncertainResult(new Date(this.now()));
    }
    if (safe.uncertain) {
      this.contexts.delete(lease.id);
      return safe;
    }
    const createdAt = new Date(this.now()).toISOString();
    const committed = this.contexts.commitUpdate(lease.contextUpdate, {
      sessionId: lease.id,
      intent: safe,
      createdAt,
      expiresAt: new Date(session.expiresAt).toISOString(),
    });
    if (!committed) return uncertainResult(new Date(this.now()));
    return (
      this.contexts.get(lease.id)?.intent ??
      uncertainResult(new Date(this.now()))
    );
  }
  get(id: string): IntentResult | null {
    return this.getContext(id)?.intent ?? null;
  }
  getContext(id: string): StoredContext | null {
    this.require(id);
    return this.contexts.get(id);
  }
  isPaused(id: string): boolean {
    return this.require(id).paused;
  }
  pause(id: string): void {
    const s = this.require(id);
    this.abortPending(s);
    this.contexts.pause(id);
    s.paused = true;
  }
  resume(id: string): void {
    this.require(id).paused = false;
    this.contexts.resume(id);
  }
  delete(id: string): void {
    const session = this.require(id);
    this.clear(session);
    this.contexts.delete(id);
  }
  stop(id: string): void {
    const s = this.require(id);
    this.clear(s);
    this.contexts.delete(id);
    this.sessions.delete(id);
  }
  cleanup(): void {
    this.contexts.clearExpired();
    for (const [id, s] of this.sessions) {
      if (s.expiresAt <= this.now()) {
        this.clear(s);
        this.contexts.delete(id);
        this.sessions.delete(id);
      }
    }
  }
  dispose(): void {
    for (const [id, s] of this.sessions) {
      this.clear(s);
      this.contexts.delete(id);
    }
    this.sessions.clear();
  }
  private clear(s: Session): void {
    this.abortPending(s);
  }
  private abortPending(s: Session): void {
    s.pending?.abort();
    s.pending = undefined;
    s.generation += 1;
  }
  private require(id: string): Session {
    const s = this.sessions.get(id);
    if (!s) throw new SessionError("UNAUTHORIZED");
    if (s.expiresAt <= this.now()) {
      this.clear(s);
      this.sessions.delete(id);
      this.contexts.delete(id);
      throw new SessionError("EXPIRED_SESSION");
    }
    return s;
  }
}
