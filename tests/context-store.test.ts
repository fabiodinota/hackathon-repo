import { describe, expect, it } from "vitest";
import { EphemeralContextStore } from "../src/context/store.js";
import type { StoredContext } from "../src/context/types.js";
import { valid } from "./helpers.js";

const context = (
  id: string,
  createdAt: string,
  expiresAt: string,
): StoredContext => ({
  sessionId: id,
  intent: valid,
  createdAt,
  expiresAt,
});
describe("ephemeral context store", () => {
  it("isolates, clones and expires structured context", () => {
    let now = Date.parse("2026-09-30T12:00:00.000Z");
    const store = new EphemeralContextStore(300000, () => now);
    const value = context(
      "session_1",
      new Date(now).toISOString(),
      new Date(now + 300000).toISOString(),
    );
    store.set("session_1", value);
    const read = store.get("session_1");
    expect(read).toEqual(value);
    expect(read).not.toBe(value);
    expect(store.get("session_2")).toBeNull();
    now += 300001;
    expect(store.get("session_1")).toBeNull();
  });
  it("pauses updates and tombstones deleted stale values", () => {
    let now = Date.parse("2026-09-30T12:00:00.000Z");
    const store = new EphemeralContextStore(300000, () => now);
    const old = context(
      "session_1",
      new Date(now).toISOString(),
      new Date(now + 300000).toISOString(),
    );
    store.set("session_1", old);
    store.pause("session_1");
    store.set("session_1", { ...old, intent: { ...valid, confidence: 0.8 } });
    expect(store.get("session_1")?.intent.confidence).toBe(0.91);
    store.resume("session_1");
    store.delete("session_1");
    expect(store.get("session_1")).toBeNull();
    store.set("session_1", old);
    expect(store.get("session_1")).toBeNull();
    now += 1;
    store.set("session_1", {
      ...old,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 300000).toISOString(),
    });
    expect(store.get("session_1")).not.toBeNull();
  });
  it("rejects malformed session identifiers", () => {
    const store = new EphemeralContextStore();
    expect(() => store.get(" ")).toThrow("INVALID_SESSION");
    expect(() => store.set(" ", {} as StoredContext)).toThrow(
      "INVALID_SESSION",
    );
  });
});

it("bounds TTL, removes expired entries during cleanup and drops unknown private fields", () => {
  let time = Date.parse(valid.generatedAt);
  const store = new EphemeralContextStore(1000, () => time);
  const value = {
    ...context(
      "session_1",
      valid.generatedAt,
      new Date(time + 999999).toISOString(),
    ),
    rawOcr: "synthetic-private",
    screenshot: "synthetic-image",
    intent: { ...valid, prompt: "synthetic-prompt" },
  };
  store.set("session_1", value);
  const read = store.get("session_1")!;
  expect(Date.parse(read.expiresAt)).toBe(time + 1000);
  expect(Object.keys(read).sort()).toEqual(
    ["sessionId", "intent", "createdAt", "expiresAt"].sort(),
  );
  expect(JSON.stringify(read)).not.toContain("synthetic");
  read.intent.signals.push("changed copy");
  expect(store.get("session_1")?.intent.signals).toEqual(valid.signals);
  time += 1000;
  expect(store.clearExpired()).toBe(1);
  expect(store.clearExpired()).toBe(0);
  expect(store.get("session_1")).toBeNull();
});

it("invalidates asynchronous writes even when deletion and fresh work share a millisecond", () => {
  const time = Date.parse(valid.generatedAt);
  const store = new EphemeralContextStore(300000, () => time);
  const value = context(
    "session_1",
    valid.generatedAt,
    new Date(time + 300000).toISOString(),
  );
  const old = store.beginUpdate("session_1");
  store.delete("session_1");
  const fresh = store.beginUpdate("session_1");
  expect(store.commitUpdate(old, value)).toBe(false);
  expect(store.commitUpdate(fresh, value)).toBe(true);
  const pending = store.beginUpdate("session_1");
  store.pause("session_1");
  expect(store.isPaused("session_1")).toBe(true);
  expect(() => store.beginUpdate("session_1")).toThrow();
  store.resume("session_1");
  expect(store.commitUpdate(pending, value)).toBe(false);
  expect(store.get("session_1")).toEqual(value);
});

it("rejects invalid structured values and expired writes", () => {
  const time = Date.parse(valid.generatedAt);
  const store = new EphemeralContextStore(300000, () => time);
  const value = context(
    "session_1",
    valid.generatedAt,
    new Date(time + 300000).toISOString(),
  );
  for (const change of [
    { sessionId: "session_2" },
    { expiresAt: valid.generatedAt },
    { intent: { ...valid, signals: ["Synthetic Person"] } },
    { createdAt: "bad date" },
  ])
    expect(() => store.set("session_1", { ...value, ...change })).toThrow(
      "INVALID_CONTEXT",
    );
});
