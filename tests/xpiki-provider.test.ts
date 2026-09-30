import { afterEach, expect, it, vi } from "vitest";
import { XpikiIntentProvider } from "../src/intent/xpiki-provider.js";
import { frame, input, now, valid, png, sensitive } from "./helpers.js";
const config = {
  apiKey: "test-key",
  baseUrl: "https://api.xpiki.com/v1",
  model: "gpt-6-luna",
  timeoutMs: 100,
  threshold: 0.8,
};
afterEach(() => vi.useRealTimers());
function context() {
  vi.setSystemTime(now);
  return input([frame(1, { imageBase64: png })]);
}
function completed(text: string) {
  return {
    status: "completed",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text }],
      },
    ],
  };
}
it("sends only sanitized context and PNGs using strict Responses JSON with no reasoning", async () => {
  let outgoing = "";
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
    outgoing = String(init?.body);
    return Response.json(
      completed(JSON.stringify({ ...valid, extra: sensitive() })),
    );
  });
  const result = await new XpikiIntentProvider(config, {
    fetch: fetcher as unknown as typeof fetch,
  }).analyze({ ...context(), raw: sensitive() } as ReturnType<typeof context>);
  expect(result).toMatchObject({ intent: valid.intent, uncertain: false });
  expect(fetcher.mock.calls[0][0]).toBe("https://api.xpiki.com/v1/responses");
  const body = JSON.parse(outgoing);
  expect(body.reasoning).toEqual({ effort: "none" });
  expect(body.store).toBe(false);
  expect(body.text.format).toMatchObject({ type: "json_schema", strict: true });
  expect(body.input[1].content[1]).toEqual({
    type: "input_image",
    image_url: "data:image/png;base64," + png,
  });
  const meta = JSON.parse(body.input[1].content[0].text);
  expect(meta.frames[0]).not.toHaveProperty("id");
  expect(meta.frames[0]).not.toHaveProperty("imageBase64");
  for (const value of sensitive()) {
    expect(outgoing).not.toContain(value);
    expect(JSON.stringify(result)).not.toContain(value);
  }
});
it.each([
  "http",
  "malformed",
  "incomplete",
  "refusal",
  "sensitive",
  "oversized",
  "invalid-schema",
])("returns uncertainty on %s", async (mode) => {
  let body = completed(JSON.stringify(valid));
  if (mode === "incomplete") body.status = "incomplete";
  if (mode === "refusal")
    body.output[0].content.push({ type: "refusal", text: "refused" });
  if (mode === "sensitive")
    body = completed(JSON.stringify({ ...valid, signals: sensitive() }));
  if (mode === "invalid-schema") body = completed('{"confidence":4}');
  const response =
    mode === "http"
      ? new Response("", { status: 503 })
      : mode === "malformed"
        ? new Response("{bad")
        : mode === "oversized"
          ? new Response("x".repeat(32769))
          : Response.json(body);
  const p = new XpikiIntentProvider(config, {
    fetch: vi.fn(async () => response) as unknown as typeof fetch,
  });
  expect(await p.analyze(context())).toMatchObject({
    intent: null,
    signals: [],
    uncertain: true,
  });
});
it("aborts a stalled network request and skips pre-aborted requests", async () => {
  let signal: AbortSignal | null | undefined;
  const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
    signal = init?.signal;
    return await new Promise<Response>(() => {});
  });
  const p = new XpikiIntentProvider(
    { ...config, timeoutMs: 10 },
    { fetch: fetcher as unknown as typeof fetch },
  );
  expect((await p.analyze(context())).uncertain).toBe(true);
  expect(signal?.aborted).toBe(true);
  fetcher.mockClear();
  const controller = new AbortController();
  controller.abort();
  await p.analyze(context(), controller.signal);
  expect(fetcher).not.toHaveBeenCalled();
});
it("does not send any context without a key", async () => {
  const fetcher = vi.fn() as unknown as unknown as typeof fetch;
  expect(
    (
      await new XpikiIntentProvider(
        { ...config, apiKey: "" },
        { fetch: fetcher },
      ).analyze(context())
    ).uncertain,
  ).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
});
