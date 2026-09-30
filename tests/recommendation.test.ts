import { expect, it } from "vitest";
import { createApp } from "../src/api/app.js";
import { ContextBuilder } from "../src/context/builder.js";
import { IntentService } from "../src/intent/service.js";
import { EphemeralIntentStore } from "../src/session/store.js";
import { CatalogueMatcher } from "../src/catalogue/matcher.js";
import { loadCatalogue } from "../src/catalogue/loader.js";
import { now, valid, sensitive } from "./helpers.js";

it("recommends through protected routes, preserves paused context and clears deleted context", async () => {
  let clock = now;
  const store = new EphemeralIntentStore(300000, () => clock);
  const session = store.start();
  const app = createApp({
    store,
    builder: new ContextBuilder(),
    service: new IntentService({ analyze: async () => valid }),
    origins: ["http://localhost:5173"],
    bootstrapToken: "b".repeat(64),
    port: 3000,
    catalogue: loadCatalogue(),
    matcher: new CatalogueMatcher({ now: () => clock }),
  }).compile();
  const send = (path: string, method = "GET", token = session.sessionToken) =>
    app.handle(
      new Request("http://localhost:3000" + path, {
        method,
        headers: {
          origin: "http://localhost:5173",
          authorization: "Bearer " + token,
          "x-session-id": session.sessionId,
        },
      }),
    );
  expect(
    await (await send("/api/services/recommendation")).json(),
  ).toMatchObject({ matched: false });
  store.finish(store.begin(session.sessionId), {
    ...valid,
    rawOcr: sensitive(),
    screenshot: "synthetic-image",
  } as typeof valid);
  const response = await send("/api/services/recommendation");
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.matched).toBe(true);
  expect(result.recommendation.path.startsWith("/")).toBe(true);
  expect(result.alternatives.length).toBeLessThanOrEqual(2);
  const stored = await (await send("/api/context")).json();
  expect(stored).toMatchObject({
    intent: valid,
    expiresAt: session.expiresAt,
    paused: false,
  });
  expect(JSON.stringify(stored)).not.toContain("rawOcr");
  expect(JSON.stringify(stored)).not.toContain("screenshot");
  expect(
    (await send("/api/services/recommendation", "GET", "wrong")).status,
  ).toBe(401);
  expect(await (await send("/api/context/pause", "POST")).json()).toEqual({
    paused: true,
  });
  expect((await (await send("/api/context")).json()).intent).toEqual(valid);
  expect(
    (await (await send("/api/services/recommendation")).json()).matched,
  ).toBe(false);
  await send("/api/session/resume", "POST");
  expect(
    (await (await send("/api/services/recommendation")).json()).matched,
  ).toBe(true);
  await send("/api/context", "DELETE");
  expect(
    (await (await send("/api/services/recommendation")).json()).matched,
  ).toBe(false);
  store.finish(store.begin(session.sessionId), { ...valid, confidence: 0.4 });
  expect(
    (await (await send("/api/services/recommendation")).json()).matched,
  ).toBe(false);
  clock += 300000;
  expect([401, 410]).toContain(
    (await send("/api/services/recommendation")).status,
  );
  store.dispose();
});

it("rejects absent, uncertain, low-confidence, expired and future intents", () => {
  const matcher = new CatalogueMatcher({ now: () => now });
  const services = loadCatalogue();
  for (const change of [
    { uncertain: true },
    { intent: null },
    { confidence: 0.79 },
    { confidence: NaN },
    { generatedAt: new Date(now - 300000).toISOString() },
    { generatedAt: new Date(now + 1).toISOString() },
    { generatedAt: "invalid" },
  ])
    expect(matcher.match({ ...valid, ...change }, services)).toEqual({
      recommendation: null,
      alternatives: [],
      matched: false,
    });
  expect(
    new CatalogueMatcher({ threshold: 0.95, now: () => now }).match(
      valid,
      services,
    ).matched,
  ).toBe(false);
});

it("deduplicates services, supports keyword fallback and never copies private reasoning", () => {
  const services = loadCatalogue();
  const matcher = new CatalogueMatcher({ now: () => now });
  const duplicated = matcher.match(valid, [...services, ...services]);
  const choices = [duplicated.recommendation!, ...duplicated.alternatives];
  expect(new Set(choices.map((c) => c.serviceId)).size).toBe(choices.length);
  expect(matcher.match({ ...valid, intent: "other" }, services).matched).toBe(
    true,
  );
  const output = matcher.match({ ...valid, signals: sensitive() }, services);
  for (const value of sensitive())
    expect(JSON.stringify(output)).not.toContain(value);
  expect(output.recommendation?.reason).toBe(
    "This may help with your home-buying planning.",
  );
  expect(
    matcher.match(valid, [{ ...services[0], type: "transaction" }]).matched,
  ).toBe(false);
  expect(
    matcher.match({ ...valid, intent: "other", signals: sensitive() }, services)
      .matched,
  ).toBe(false);
});
