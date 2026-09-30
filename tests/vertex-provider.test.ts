import { afterEach, expect, it, vi } from "vitest";
import { VertexIntentProvider } from "../src/intent/vertex-provider.js";
import { frame, input, now, valid, png, sensitive } from "./helpers.js";
const config = {
  projectId: "demo-project",
  region: "europe-west1",
  model: "gemini-2.5-flash-lite",
  timeoutMs: 50,
  threshold: 0.8,
};
afterEach(() => vi.useRealTimers());
function context() {
  vi.setSystemTime(now);
  return input([frame(1, { imageBase64: png })]);
}
it("sends native vision parts, constrained JSON and only allowlisted model context", async () => {
  let outgoing = "";
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
    outgoing = String(init?.body);
    return Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [{ text: JSON.stringify({ ...valid, extra: sensitive() }) }],
          },
        },
      ],
    });
  });
  const provider = new VertexIntentProvider(config, {
    fetch: fetcher as unknown as typeof fetch,
    getAccessToken: async () => "mock-token",
  });
  const result = await provider.analyze({
    ...context(),
    raw: sensitive(),
  } as ReturnType<typeof context>);
  expect(result).toMatchObject({ intent: valid.intent, uncertain: false });
  const body = JSON.parse(outgoing);
  expect(body.contents[0].parts[1].inlineData).toEqual({
    mimeType: "image/png",
    data: png,
  });
  expect(body.generationConfig.responseMimeType).toBe("application/json");
  for (const value of sensitive()) {
    expect(outgoing).not.toContain(value);
    expect(JSON.stringify(result)).not.toContain(value);
  }
  const meta = JSON.parse(body.contents[0].parts[0].text);
  expect(meta.frames[0]).not.toHaveProperty("id");
  expect(meta.frames[0]).not.toHaveProperty("imageBase64");
});
it.each([
  "invalid-json",
  "blocked",
  "http-error",
  "wrong-schema",
  "sensitive-output",
])("returns uncertain for %s", async (mode) => {
  const fetcher = async () =>
    mode === "http-error"
      ? new Response("", { status: 503 })
      : Response.json({
          candidates: [
            {
              finishReason: mode === "blocked" ? "SAFETY" : "STOP",
              content: {
                parts: [
                  {
                    text:
                      mode === "invalid-json"
                        ? "{bad"
                        : JSON.stringify(
                            mode === "wrong-schema"
                              ? { confidence: 4 }
                              : mode === "sensitive-output"
                                ? { ...valid, signals: sensitive() }
                                : valid,
                          ),
                  },
                ],
              },
            },
          ],
        });
  expect(
    await new VertexIntentProvider(config, {
      fetch: fetcher as unknown as typeof fetch,
      getAccessToken: async () => "mock",
    }).analyze(context()),
  ).toMatchObject({ intent: null, uncertain: true, signals: [] });
});
it("times out even if token acquisition hangs; never calls the network", async () => {
  const fetcher = vi.fn() as unknown as typeof fetch;
  expect(
    (
      await new VertexIntentProvider(
        { ...config, timeoutMs: 10 },
        { fetch: fetcher, getAccessToken: () => new Promise(() => {}) },
      ).analyze(context())
    ).uncertain,
  ).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
});
it("aborts fetch on timeout and honors pre-aborted signals", async () => {
  let signal: AbortSignal | null | undefined;
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
    signal = init?.signal;
    return await new Promise<Response>(() => {});
  });
  const provider = new VertexIntentProvider(
    { ...config, timeoutMs: 10 },
    {
      fetch: fetcher as unknown as typeof fetch,
      getAccessToken: async () => "mock",
    },
  );
  expect((await provider.analyze(context())).uncertain).toBe(true);
  expect(signal?.aborted).toBe(true);
  const controller = new AbortController();
  controller.abort();
  fetcher.mockClear();
  await provider.analyze(context(), controller.signal);
  expect(fetcher).not.toHaveBeenCalled();
});
