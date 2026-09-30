import { describe, expect, it } from "vitest";
import { createApp } from "../src/api/app.js";
import { ContextBuilder } from "../src/context/builder.js";
import { IntentService } from "../src/intent/service.js";
import { EphemeralIntentStore } from "../src/session/store.js";
import type { IntentProvider } from "../src/intent/provider.js";
import type { ModelContext } from "../src/context/types.js";
import { frame, now, valid, sensitive } from "./helpers.js";
const bootstrapToken = "b".repeat(64),
  origin = "http://localhost:5173";
function setup(provider: IntentProvider = { analyze: async () => valid }) {
  const store = new EphemeralIntentStore(300000, () => now);
  const app = createApp({
    builder: new ContextBuilder({ now: () => now }),
    service: new IntentService(provider, 0.8, 100),
    store,
    origins: [origin],
    bootstrapToken,
    port: 3000,
  }).compile();
  const send = (
    path: string,
    method: string,
    body?: unknown,
    token = bootstrapToken,
    id?: string,
    extra: Record<string, string> = {},
  ) =>
    app.handle(
      new Request("http://localhost:3000" + path, {
        method,
        headers: {
          origin,
          authorization: "Bearer " + token,
          "content-type": "application/json",
          ...(id ? { "x-session-id": id } : {}),
          ...extra,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  const start = async () => {
    const r = await send("/api/session/start", "POST", { consent: true });
    expect(r.status).toBe(201);
    return (await r.json()) as { sessionId: string; sessionToken: string };
  };
  return { store, send, start, app };
}
describe("authenticated intent API", () => {
  it("requires consent, origin and bootstrap token, with no leaking errors", async () => {
    const { send } = setup();
    expect(
      (await send("/api/session/start", "POST", { consent: false })).status,
    ).toBe(400);
    expect(
      (await send("/api/session/start", "POST", { consent: true }, "wrong"))
        .status,
    ).toBe(401);
    expect(
      (
        await send(
          "/api/session/start",
          "POST",
          { consent: true },
          bootstrapToken,
          undefined,
          { origin: "https://evil.invalid" },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await send(
          "/api/session/start",
          "POST",
          { consent: true },
          bootstrapToken,
          undefined,
          { origin: "" },
        )
      ).status,
    ).toBe(403);
    const response = await send("/api/session/start", "OPTIONS");
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
  });
  it("connects sanitized context to the injected provider and returns only validated intent", async () => {
    let received: ModelContext | undefined;
    const { send, start } = setup({
      analyze: async (context) => {
        received = context;
        return { ...valid, raw: sensitive() } as typeof valid;
      },
    });
    const s = await start();
    const response = await send(
      "/api/intent/analyze",
      "POST",
      {
        sessionId: s.sessionId,
        timeWindowSeconds: 60,
        frames: [
          {
            ...frame(),
            rawOcr: sensitive(),
            detector: { private: sensitive() },
          },
        ],
        extra: sensitive(),
      },
      s.sessionToken,
      s.sessionId,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
    const result = await response.json();
    expect(result).toMatchObject({ intent: valid.intent, uncertain: false });
    expect(Object.keys(result).sort()).toEqual(
      ["intent", "confidence", "signals", "uncertain", "generatedAt"].sort(),
    );
    for (const value of sensitive()) {
      expect(JSON.stringify(received)).not.toContain(value);
      expect(JSON.stringify(result)).not.toContain(value);
    }
    expect(
      (
        await (
          await send(
            "/api/context",
            "GET",
            undefined,
            s.sessionToken,
            s.sessionId,
          )
        ).json()
      ).intent.intent,
    ).toBe(valid.intent);
    expect(
      (await send("/api/context", "GET", undefined, "wrong", s.sessionId))
        .status,
    ).toBe(401);
  });
  it("fails closed when claimed safeText contains a synthetic sensitive value", async () => {
    let calls = 0;
    const { send, start } = setup({
      analyze: async () => {
        calls++;
        return valid;
      },
    });
    const s = await start();
    for (const value of sensitive()) {
      const response = await send(
        "/api/intent/analyze",
        "POST",
        {
          sessionId: s.sessionId,
          timeWindowSeconds: 60,
          frames: [frame(1, { safeText: [value] })],
        },
        s.sessionToken,
        s.sessionId,
      );
      expect(response.status).toBe(400);
      expect(await response.text()).not.toContain(value);
    }
    expect(calls).toBe(0);
  });
  it.each(["delete", "pause", "stop"])(
    "invalidates pending results on %s",
    async (action) => {
      let entered!: () => void;
      const ready = new Promise<void>((resolve) => {
        entered = resolve;
      });
      let finish!: (value: typeof valid) => void;
      const { send, start } = setup({
        analyze: async () => {
          entered();
          return await new Promise((resolve) => {
            finish = resolve;
          });
        },
      });
      const s = await start();
      const pending = send(
        "/api/intent/analyze",
        "POST",
        { sessionId: s.sessionId, timeWindowSeconds: 60, frames: [frame()] },
        s.sessionToken,
        s.sessionId,
      );
      await ready;
      const control = await send(
        action === "delete" ? "/api/context" : "/api/session/" + action,
        action === "delete" ? "DELETE" : "POST",
        undefined,
        s.sessionToken,
        s.sessionId,
      );
      expect(control.status).toBe(200);
      finish(valid);
      expect(await (await pending).json()).toMatchObject({
        uncertain: true,
        intent: null,
      });
      if (action !== "stop")
        expect(
          (
            await (
              await send(
                "/api/context",
                "GET",
                undefined,
                s.sessionToken,
                s.sessionId,
              )
            ).json()
          ).intent,
        ).toBeNull();
      if (action === "pause") {
        expect(
          (
            await send(
              "/api/intent/analyze",
              "POST",
              {
                sessionId: s.sessionId,
                timeWindowSeconds: 60,
                frames: [frame()],
              },
              s.sessionToken,
              s.sessionId,
            )
          ).status,
        ).toBe(409);
      }
    },
  );
  it("clears previous suggestions on AI failure", async () => {
    let fail = false;
    const { send, start } = setup({
      analyze: async () => {
        if (fail) throw new Error(sensitive().join(" "));
        return valid;
      },
    });
    const s = await start();
    const body = {
      sessionId: s.sessionId,
      timeWindowSeconds: 60,
      frames: [frame()],
    };
    await send(
      "/api/intent/analyze",
      "POST",
      body,
      s.sessionToken,
      s.sessionId,
    );
    fail = true;
    expect(
      await (
        await send(
          "/api/intent/analyze",
          "POST",
          body,
          s.sessionToken,
          s.sessionId,
        )
      ).json(),
    ).toMatchObject({ intent: null, uncertain: true, signals: [] });
    expect(
      (
        await (
          await send(
            "/api/context",
            "GET",
            undefined,
            s.sessionToken,
            s.sessionId,
          )
        ).json()
      ).intent,
    ).toBeNull();
  });
  it("rejects malformed bodies, oversized input, mismatched session, and DNS rebinding", async () => {
    const { send, start, app } = setup();
    const s = await start();
    expect(
      (
        await send(
          "/api/intent/analyze",
          "POST",
          null,
          s.sessionToken,
          s.sessionId,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await send(
          "/api/intent/analyze",
          "POST",
          { sessionId: "wrong" },
          s.sessionToken,
          s.sessionId,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await send(
          "/api/intent/analyze",
          "POST",
          { padding: "x".repeat(4500001) },
          s.sessionToken,
          s.sessionId,
        )
      ).status,
    ).toBe(413);
    expect(
      (
        await app.handle(
          new Request("http://evil.invalid:3000/api/context", {
            headers: { origin },
          }),
        )
      ).status,
    ).toBe(403);
  });
});
