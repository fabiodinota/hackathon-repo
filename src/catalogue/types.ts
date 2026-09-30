import type { IntentResult } from "../intent/types.js";

export type KbcService = {
  id: string;
  name: string;
  category: string;
  intents: readonly string[];
  keywords: readonly string[];
  type: string;
  path: string;
  requiresAuthentication: boolean;
};

export type Recommendation = {
  serviceId: string;
  name: string;
  category: string;
  path: string;
  type: string;
  requiresAuthentication: boolean;
  reason: string;
};

export type RecommendationResult = {
  recommendation: Recommendation | null;
  alternatives: Recommendation[];
  matched: boolean;
};

export interface ServiceMatcher {
  match(
    intent: IntentResult,
    services: readonly KbcService[],
  ): RecommendationResult;
}
