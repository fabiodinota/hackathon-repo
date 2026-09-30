import { expect, it } from "vitest";
import { EphemeralIntentStore } from "../src/session/store.js";
import { valid } from "./helpers.js";
it("expires and cleans sessions/results after five minutes", () => {
  let now = 0;
  const store = new EphemeralIntentStore(300000, () => now);
  const s = store.start();
  store.authorize(s.sessionId, s.sessionToken);
  store.finish(store.begin(s.sessionId), valid);
  expect(store.get(s.sessionId)).toEqual(valid);
  now = 300000;
  expect(() => store.authorize(s.sessionId, s.sessionToken)).toThrow(
    "EXPIRED_SESSION",
  );
  store.cleanup();
  expect(() => store.get(s.sessionId)).toThrow();
});
it("does not restore deleted results after resume or newer work", () => {
  const store = new EphemeralIntentStore();
  const s = store.start();
  const old = store.begin(s.sessionId);
  store.pause(s.sessionId);
  store.resume(s.sessionId);
  const current = store.begin(s.sessionId);
  expect(store.finish(old, valid).uncertain).toBe(true);
  expect(store.get(s.sessionId)).toBeNull();
  expect(store.finish(current, valid).uncertain).toBe(false);
  store.delete(s.sessionId);
  expect(store.get(s.sessionId)).toBeNull();
});
it("rejects overlapping analysis and cross-session tokens", () => {
  const store = new EphemeralIntentStore();
  const a = store.start(),
    b = store.start();
  expect(() => store.authorize(a.sessionId, b.sessionToken)).toThrow(
    "UNAUTHORIZED",
  );
  store.begin(a.sessionId);
  expect(() => store.begin(a.sessionId)).toThrow("BUSY");
  store.dispose();
});
