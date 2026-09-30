import type { ModelContext } from "../context/types.js";
import type { IntentResult } from "./types.js";
export interface IntentProvider {
  analyze(context: ModelContext, signal?: AbortSignal): Promise<IntentResult>;
}
