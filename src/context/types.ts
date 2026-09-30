export type SanitizedFrame = {
  id: string;
  imageBase64?: string;
  safeText: string[];
  timestamp: string;
  source: "allowlisted_tab";
  ocrConfidence?: number;
};
export type SanitizedInput = {
  frames: SanitizedFrame[];
  timeWindowSeconds: number;
  sessionId: string;
};
export type ModelFrame = {
  imageBase64?: string;
  safeText: string[];
  timestamp: string;
};
export type ModelContext = {
  sessionId: string;
  frames: ModelFrame[];
  timeWindowSeconds: number;
};

import type { IntentResult } from "../intent/types.js";
import type { Recommendation } from "../catalogue/types.js";

/** Data retained briefly after intent analysis. Raw frames and OCR never belong here. */
export type StoredContext = {
  sessionId: string;
  intent: IntentResult;
  recommendation?: Recommendation;
  createdAt: string;
  expiresAt: string;
};
