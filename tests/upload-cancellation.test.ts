import { expect, it, vi } from "vitest";
import { createApp } from "../src/api/app.js";
import { ContextBuilder } from "../src/context/builder.js";
import { IntentService } from "../src/intent/service.js";
import { EphemeralIntentStore } from "../src/session/store.js";
import { frame, now, valid } from "./helpers.js";

it.each(["delete", "pause-resume", "stop"])(
  "blocks an upload interrupted by %s before calling the provider",
  async (action) => {
    const store = new EphemeralIntentStore(300000, () => now);
    const analyze = vi.fn(async () => valid);
    const app = createApp({
      store,
      builder: new ContextBuilder({ now: () => now }),
      service: new IntentService({ analyze }),
      origins: ["http://localhost:5173"],
      bootstrapToken: "b".repeat(64),
      port: 3000,
    }).compile();
    const session = store.start();
    const headers = {
      origin: "http://localhost:5173",
      authorization: "Bearer " + session.sessionToken,
      "x-session-id": session.sessionId,
      "content-type": "application/json",
    };
    const payload = JSON.stringify({
      sessionId: session.sessionId,
      timeWindowSeconds: 60,
      frames: [frame()],
    });
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    let reading!: () => void;
    const ready = new Promise<void>((resolve) => {
      reading = resolve;
    });
    const stream = new ReadableStream<Uint8Array>(
      {
        start(value) {
          controller = value;
        },
        pull() {
          reading();
        },
      },
      { highWaterMark: 0 },
    );
    // Node requires duplex for streaming request bodies. No bytes are supplied
    // until after the control request, so authorization precedes invalidation.
    const init: RequestInit & { duplex: "half" } = {
      method: "POST",
      headers,
      body: stream,
      duplex: "half",
    };
    const pending = app.handle(
      new Request("http://localhost:3000/api/intent/analyze", init),
    );
    await ready;
    const path =
      action === "delete"
        ? "/api/context"
        : "/api/session/" + (action === "stop" ? "stop" : "pause");
    const control = await app.handle(
      new Request("http://localhost:3000" + path, {
        method: action === "delete" ? "DELETE" : "POST",
        headers,
      }),
    );
    expect(control.status).toBe(200);
    if (action === "pause-resume") {
      const resumed = await app.handle(
        new Request("http://localhost:3000/api/session/resume", {
          method: "POST",
          headers,
        }),
      );
      expect(resumed.status).toBe(200);
    }
    controller.enqueue(new TextEncoder().encode(payload));
    controller.close();
    const rejected = await pending;
    expect(rejected.status).toBe(action === "stop" ? 401 : 409);
    expect(await rejected.json()).toEqual({
      error: action === "stop" ? "UNAUTHORIZED" : "STALE_REQUEST",
    });
    expect(analyze).not.toHaveBeenCalled();
    if (action !== "stop") {
      expect(store.get(session.sessionId)).toBeNull();
      const fresh = await app.handle(
        new Request("http://localhost:3000/api/intent/analyze", {
          method: "POST",
          headers,
          body: payload,
        }),
      );
      expect(fresh.status).toBe(200);
      expect(analyze).toHaveBeenCalledTimes(1);
      expect(store.get(session.sessionId)?.intent).toBe(valid.intent);
    }
    store.dispose();
  },
);
