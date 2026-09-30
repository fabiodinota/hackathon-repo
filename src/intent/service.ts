import type { ModelContext } from "../context/types.js";
import type { IntentProvider } from "./provider.js";
import { uncertainResult, validateIntent } from "./validator.js";
import type { IntentResult } from "./types.js";

export class IntentService {
  constructor(
    private readonly provider: IntentProvider,
    private readonly threshold = 0.8,
    private readonly timeoutMs = 5000,
  ) {}
  async analyze(
    context: ModelContext,
    signal?: AbortSignal,
  ): Promise<IntentResult> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    try {
      if (controller.signal.aborted) return uncertainResult();
      const stopped = new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => reject(new Error("Processing stopped")),
          { once: true },
        );
        timer = setTimeout(abort, this.timeoutMs);
      });
      const value = await Promise.race([
        this.provider.analyze(context, controller.signal),
        stopped,
      ]);
      if (controller.signal.aborted) return uncertainResult();
      return validateIntent(value, this.threshold);
    } catch {
      return uncertainResult();
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
}
