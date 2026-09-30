import { afterEach, expect, it, vi } from "vitest";
import { readJson } from "../src/api/http.js";
import { EphemeralContextStore } from "../src/context/store.js";
import { EphemeralIntentStore } from "../src/session/store.js";
import { valid } from "./helpers.js";
afterEach(() => vi.useRealTimers());
function upload(cancel: () => void, signal?: AbortSignal) {
  return new Request("http://localhost:3000/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: new ReadableStream({ cancel }),
    duplex: "half",
    signal,
  } as RequestInit);
}
it("cancels a slow upload at its overall deadline", async () => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  const pending = readJson(upload(cancel), 100, undefined, 10);
  const rejected = expect(pending).rejects.toMatchObject({
    code: "UPLOAD_TIMEOUT",
    status: 408,
  });
  await vi.advanceTimersByTimeAsync(10);
  await rejected;
  expect(cancel).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it.each(["session", "disconnect"])(
  "cancels an upload on %s abort",
  async (mode) => {
    const controller = new AbortController();
    const cancel = vi.fn();
    const pending = readJson(
      upload(cancel, mode === "disconnect" ? controller.signal : undefined),
      100,
      mode === "session" ? controller.signal : undefined,
    );
    const rejected = expect(pending).rejects.toMatchObject({
      code: mode === "session" ? "STALE_REQUEST" : "INVALID_INPUT",
    });
    controller.abort();
    await rejected;
    expect(cancel).toHaveBeenCalledOnce();
  },
);
it("does not let released old leases cancel fresh work", () => {
  const store = new EphemeralIntentStore();
  const session = store.start();
  const old = store.begin(session.sessionId);
  store.pause(session.sessionId);
  store.resume(session.sessionId);
  const fresh = store.begin(session.sessionId);
  store.release(old);
  expect(fresh.signal.aborted).toBe(false);
  expect(() => store.begin(session.sessionId)).toThrow("BUSY");
  expect(store.finish(fresh, valid).uncertain).toBe(false);
  store.release(fresh);
  expect(() => store.begin(session.sessionId)).not.toThrow();
  store.dispose();
});
it("blocks direct stale writes after pause/resume but permits fresh same-millisecond leases", () => {
  let time = Date.parse(valid.generatedAt);
  const store = new EphemeralContextStore(300000, () => time);
  const context = {
    sessionId: "session_1",
    intent: valid,
    createdAt: new Date(time).toISOString(),
    expiresAt: new Date(time + 300000).toISOString(),
  };
  store.pause("session_1");
  store.resume("session_1");
  store.set("session_1", context);
  expect(store.get("session_1")).toBeNull();
  const fresh = store.beginUpdate("session_1");
  expect(store.commitUpdate(fresh, context)).toBe(true);
  time++;
  store.set("session_1", {
    ...context,
    createdAt: new Date(time).toISOString(),
  });
  expect(store.get("session_1")?.createdAt).toBe(new Date(time).toISOString());
});
