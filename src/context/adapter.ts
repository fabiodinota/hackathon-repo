import type { SanitizedInput } from "./types.js";
/** Implement beside item 5, after successful masking. Never adapt raw capture/OCR. */
export interface SanitizedInputAdapter<T> {
  toSanitizedInput(output: T): SanitizedInput;
}
