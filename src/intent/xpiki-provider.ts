import type { ModelContext } from "../context/types.js";
import { ContextBuilder } from "../context/builder.js";
import { intentSystemPrompt } from "./prompt.js";
import type { IntentProvider } from "./provider.js";
import type { IntentResult } from "./types.js";
import { uncertainResult, validateIntent } from "./validator.js";
import { allowedIntents, allowedSignals } from "./vocabulary.js";

export type XpikiConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  threshold: number;
};
export type XpikiDependencies = { fetch?: typeof fetch };
const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: { type: ["string", "null"], enum: [...allowedIntents, null] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    signals: {
      type: "array",
      maxItems: 3,
      items: { type: "string", enum: [...allowedSignals] },
    },
    uncertain: { type: "boolean" },
  },
  required: ["intent", "confidence", "signals", "uncertain"],
} as const;

export class XpikiIntentProvider implements IntentProvider {
  private readonly fetcher: typeof fetch;
  constructor(
    private readonly config: XpikiConfig,
    deps: XpikiDependencies = {},
  ) {
    this.fetcher = deps.fetch ?? fetch;
  }
  async analyze(
    input: ModelContext,
    signal?: AbortSignal,
  ): Promise<IntentResult> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (signal?.aborted) return uncertainResult();
      const stopped = new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => reject(new Error("Stopped")),
          { once: true },
        );
        timer = setTimeout(abort, this.config.timeoutMs);
      });
      return await Promise.race([
        this.request(input, controller.signal),
        stopped,
      ]);
    } catch {
      return uncertainResult();
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
  private async request(
    input: ModelContext,
    signal: AbortSignal,
  ): Promise<IntentResult> {
    if (
      !this.config.apiKey ||
      !/^https:\/\//.test(this.config.baseUrl) ||
      !/^[a-zA-Z0-9.-]+$/.test(this.config.model)
    )
      return uncertainResult();
    const context = new ContextBuilder().build({
      sessionId: input.sessionId,
      timeWindowSeconds: input.timeWindowSeconds,
      frames: input.frames.map((frame, i) => ({
        id: String(i),
        source: "allowlisted_tab",
        safeText: frame.safeText,
        timestamp: frame.timestamp,
        imageBase64: frame.imageBase64,
      })),
    });
    const content: Array<Record<string, string>> = [
      {
        type: "input_text",
        text: JSON.stringify({
          sessionId: context.sessionId,
          timeWindowSeconds: context.timeWindowSeconds,
          frames: context.frames.map((f) => ({
            safeText: f.safeText,
            timestamp: f.timestamp,
          })),
        }),
      },
    ];
    for (const frame of context.frames)
      if (frame.imageBase64)
        content.push({
          type: "input_image",
          image_url: "data:image/png;base64," + frame.imageBase64,
        });
    const response = await this.fetcher(
      this.config.baseUrl.replace(/\/$/, "") + "/responses",
      {
        method: "POST",
        signal,
        headers: {
          authorization: "Bearer " + this.config.apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          input: [
            {
              role: "system",
              content: [{ type: "input_text", text: intentSystemPrompt }],
            },
            { role: "user", content },
          ],
          temperature: 0,
          max_output_tokens: 512,
          text: {
            format: {
              type: "json_schema",
              name: "intent_result",
              strict: true,
              schema,
            },
          },
        }),
      },
    );
    if (!response.ok) return uncertainResult();
    const reader = response.body?.getReader();
    if (!reader) return uncertainResult();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.length;
        if (size > 32768) {
          await reader.cancel();
          return uncertainResult();
        }
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
    const data = JSON.parse(Buffer.concat(chunks).toString()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string }> }>;
    };
    const text =
      data.output_text ??
      data.output
        ?.flatMap((item) => item.content ?? [])
        .map((part) => part.text ?? "")
        .join("");
    return validateIntent(text, this.config.threshold);
  }
}
