import { afterEach, expect, it, vi } from "vitest";
import { XpikiIntentProvider } from "../src/intent/xpiki-provider.js";
import { VertexIntentProvider } from "../src/intent/vertex-provider.js";
import { input, frame, now } from "./helpers.js";
afterEach(() => vi.useRealTimers());
function provider(name: string, fetcher: typeof fetch) {
  const options = { model: "demo-model", timeoutMs: 20, threshold: 0.8 };
  return name === "xpiki"
    ? new XpikiIntentProvider(
        {
          ...options,
          apiKey: "synthetic",
          baseUrl: "https://api.xpiki.com/v1",
        },
        { fetch: fetcher as unknown as typeof fetch },
      )
    : new VertexIntentProvider(
        { ...options, projectId: "demo-project", region: "global" },
        { fetch: fetcher, getAccessToken: async () => "synthetic" },
      );
}
it.each(["xpiki", "vertex"])(
  "%s forbids redirects and releases an open HTTP error body",
  async (name) => {
    vi.setSystemTime(now);
    const cancel = vi.fn();
    let signal: AbortSignal | null | undefined;
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(init?.redirect).toBe("error");
      signal = init?.signal;
      return new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array([1]));
          },
          cancel,
        }),
        { status: 503 },
      );
    });
    expect(
      (
        await provider(name, fetcher as unknown as typeof fetch).analyze(
          input([frame()]),
        )
      ).uncertain,
    ).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(signal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
  },
);
it.each(["xpiki", "vertex"])(
  "%s fails closed when redirect rejection throws",
  async (name) => {
    vi.setSystemTime(now);
    const fetcher = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(init?.redirect).toBe("error");
      throw new TypeError("redirect blocked");
    });
    expect(
      (
        await provider(name, fetcher as unknown as typeof fetch).analyze(
          input([frame()]),
        )
      ).uncertain,
    ).toBe(true);
  },
);
it.each(["xpiki", "vertex"])(
  "%s aborts a stalled successful response body",
  async (name) => {
    vi.setSystemTime(now);
    let signal: AbortSignal | null | undefined;
    const cancel = vi.fn();
    const fetcher = async (_url: unknown, init?: RequestInit) => {
      signal = init?.signal;
      const stream = new ReadableStream({ cancel });
      return new Response(stream);
    };
    expect(
      (
        await provider(name, fetcher as unknown as typeof fetch).analyze(
          input([frame()]),
        )
      ).uncertain,
    ).toBe(true);
    expect(signal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
  },
);
it.each([
  "http://api.xpiki.com/v1",
  "https://api.xpiki.com.evil.invalid/v1",
  "https://user:password@api.xpiki.com/v1",
  "https://api.xpiki.com:444/v1",
  "https://api.xpiki.com/v2",
  "https://api.xpiki.com/v1?next=elsewhere",
  "https://api.xpiki.com/v1#fragment",
])("does not send context to %s", async (baseUrl) => {
  vi.setSystemTime(now);
  const fetcher = vi.fn();
  const result = await new XpikiIntentProvider(
    {
      apiKey: "synthetic",
      baseUrl,
      model: "gpt-6-luna",
      timeoutMs: 20,
      threshold: 0.8,
    },
    { fetch: fetcher as unknown as typeof fetch },
  ).analyze(input());
  expect(result.uncertain).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
});
