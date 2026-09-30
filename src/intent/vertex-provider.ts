import { GoogleAuth } from "google-auth-library";
import type { ModelContext } from "../context/types.js";
import { ContextBuilder } from "../context/builder.js";
import { intentSystemPrompt } from "./prompt.js";
import type { IntentProvider } from "./provider.js";
import type { IntentResult } from "./types.js";
import { uncertainResult, validateIntent } from "./validator.js";
import { allowedIntents, allowedSignals } from "./vocabulary.js";

export type VertexConfig = {
  projectId: string;
  region: string;
  model: string;
  timeoutMs: number;
  threshold: number;
};
export type VertexDependencies = {
  fetch?: typeof fetch;
  getAccessToken?: () => Promise<string | null>;
};
export class VertexIntentProvider implements IntentProvider {
  private readonly fetcher: typeof fetch;
  private readonly getAccessToken: () => Promise<string | null>;
  constructor(
    private readonly config: VertexConfig,
    deps: VertexDependencies = {},
  ) {
    this.fetcher = deps.fetch ?? fetch;
    const auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
    this.getAccessToken =
      deps.getAccessToken ??
      (async () => (await auth.getAccessToken()) ?? null);
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
    // Reconstruct all fields: even direct provider callers cannot send hidden metadata.
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
    const token = await this.getAccessToken();
    if (!token || signal.aborted) return uncertainResult();
    const { projectId, region, model } = this.config;
    if (
      !/^[a-z0-9-]+$/.test(region) ||
      !/^[a-z0-9-]+$/.test(projectId) ||
      !/^[a-z0-9.-]+$/.test(model)
    )
      return uncertainResult();
    const host =
      region === "global"
        ? "aiplatform.googleapis.com"
        : region + "-aiplatform.googleapis.com";
    const endpoint =
      "https://" +
      host +
      "/v1/projects/" +
      projectId +
      "/locations/" +
      region +
      "/publishers/google/models/" +
      model +
      ":generateContent";
    const parts: Array<
      { text: string } | { inlineData: { mimeType: string; data: string } }
    > = [
      {
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
        parts.push({
          inlineData: { mimeType: "image/png", data: frame.imageBase64 },
        });
    const response = await this.fetcher(endpoint, {
      method: "POST",
      signal,
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: intentSystemPrompt }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 512,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              intent: { type: "STRING", nullable: true, enum: allowedIntents },
              confidence: { type: "NUMBER", minimum: 0, maximum: 1 },
              signals: {
                type: "ARRAY",
                maxItems: 3,
                items: { type: "STRING", enum: allowedSignals },
              },
              uncertain: { type: "BOOLEAN" },
            },
            required: ["intent", "confidence", "signals", "uncertain"],
          },
        },
      }),
    });
    if (!response.ok) return uncertainResult();
    // Bounded response read; never log or persist provider bodies.
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
      candidates?: Array<{
        finishReason?: string;
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const candidate = data.candidates?.[0];
    if (candidate?.finishReason !== "STOP") return uncertainResult();
    const text = candidate.content?.parts?.map((p) => p.text ?? "").join("");
    return validateIntent(text, this.config.threshold);
  }
}
