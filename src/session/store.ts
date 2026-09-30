import { randomUUID, randomBytes, timingSafeEqual } from "node:crypto";
import type { IntentResult } from "../intent/types.js";
import { uncertainResult } from "../intent/validator.js";

type Session = {
  token: string;
  expiresAt: number;
  paused: boolean;
  result?: IntentResult;
  resultExpiresAt?: number;
  pending?: AbortController;
};
export class SessionError extends Error {
  constructor(
    readonly code:
      "UNAUTHORIZED" | "EXPIRED_SESSION" | "SESSION_PAUSED" | "BUSY",
  ) {
    super(code);
  }
}
export type ProcessingLease = {
  id: string;
  signal: AbortSignal;
  controller: AbortController;
};
export class EphemeralIntentStore {
  private readonly sessions = new Map<string, Session>();
  constructor(
    private readonly ttlMs = 300000,
    private readonly now = Date.now,
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
    });
    return {
      sessionId,
      sessionToken,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }
  authorize(id: string, token: string): void {
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
      throw new SessionError("EXPIRED_SESSION");
    }
  }
  begin(id: string): ProcessingLease {
    const session = this.require(id);
    if (session.paused) throw new SessionError("SESSION_PAUSED");
    if (session.pending) throw new SessionError("BUSY");
    const controller = new AbortController();
    session.pending = controller;
    return { id, signal: controller.signal, controller };
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
    // Uncertain outcomes clear any older successful result.
    session.result = result.uncertain ? undefined : structuredClone(result);
    session.resultExpiresAt = this.now() + this.ttlMs;
    return result;
  }
  get(id: string): IntentResult | null {
    const session = this.require(id);
    if ((session.resultExpiresAt ?? 0) <= this.now())
      session.result = undefined;
    return session.result ? structuredClone(session.result) : null;
  }
  pause(id: string): void {
    const s = this.require(id);
    this.clear(s);
    s.paused = true;
  }
  resume(id: string): void {
    this.require(id).paused = false;
  }
  delete(id: string): void {
    this.clear(this.require(id));
  }
  stop(id: string): void {
    const s = this.require(id);
    this.clear(s);
    this.sessions.delete(id);
  }
  cleanup(): void {
    for (const [id, s] of this.sessions) {
      if (s.expiresAt <= this.now()) {
        this.clear(s);
        this.sessions.delete(id);
      } else if ((s.resultExpiresAt ?? 0) <= this.now()) s.result = undefined;
    }
  }
  dispose(): void {
    for (const s of this.sessions.values()) this.clear(s);
    this.sessions.clear();
  }
  private clear(s: Session): void {
    s.pending?.abort();
    s.pending = undefined;
    s.result = undefined;
    s.resultExpiresAt = undefined;
  }
  private require(id: string): Session {
    const s = this.sessions.get(id);
    if (!s) throw new SessionError("UNAUTHORIZED");
    if (s.expiresAt <= this.now()) {
      this.clear(s);
      this.sessions.delete(id);
      throw new SessionError("EXPIRED_SESSION");
    }
    return s;
  }
}
