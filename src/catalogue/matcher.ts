import { catalogueTypes } from "./vocabulary.js";
import { allowedSignals } from "../intent/vocabulary.js";
import type { IntentResult } from "../intent/types.js";
import type {
  KbcService,
  Recommendation,
  RecommendationResult,
  ServiceMatcher,
} from "./types.js";

const DEFAULT_THRESHOLD = 0.8;
const DEFAULT_INTENT_TTL_MS = 5 * 60 * 1000;
export type MatcherOptions = {
  threshold?: number;
  now?: () => number;
  intentTtlMs?: number;
};

export class CatalogueMatcher implements ServiceMatcher {
  private readonly threshold: number;
  private readonly now: () => number;
  private readonly intentTtlMs: number;
  constructor(options: MatcherOptions = {}) {
    this.threshold = options.threshold ?? DEFAULT_THRESHOLD;
    this.now = options.now ?? Date.now;
    this.intentTtlMs = options.intentTtlMs ?? DEFAULT_INTENT_TTL_MS;
    if (
      !Number.isFinite(this.threshold) ||
      this.threshold < 0 ||
      this.threshold > 1 ||
      !Number.isInteger(this.intentTtlMs) ||
      this.intentTtlMs < 1
    )
      throw new Error("Invalid matcher configuration");
  }
  match(
    intent: IntentResult,
    services: readonly KbcService[],
  ): RecommendationResult {
    if (
      !intent ||
      intent.uncertain ||
      typeof intent.intent !== "string" ||
      !intent.intent.trim() ||
      intent.confidence > 1 ||
      intent.confidence < 0 ||
      !Number.isFinite(intent.confidence) ||
      intent.confidence < this.threshold ||
      !this.isCurrent(intent.generatedAt)
    )
      return empty();
    const signals = intent.signals
      .filter((signal) =>
        (allowedSignals as readonly string[]).includes(signal),
      )
      .map(normalize);
    const ranked = services
      .filter(
        (service) =>
          catalogueTypes.has(service.type) && service.type !== "transaction",
      )
      .map((service, index) => {
        const exact = service.intents.includes(intent.intent as string);
        const keywordHits = service.keywords.reduce(
          (count, keyword) =>
            count +
            (signals.some(
              (signal) =>
                normalize(keyword) !== "" &&
                (" " + signal + " ").includes(" " + normalize(keyword) + " "),
            )
              ? 1
              : 0),
          0,
        );
        return { service, exact, keywordHits, index };
      })
      .filter(({ exact, keywordHits }) => exact || keywordHits > 0)
      .sort(
        (a, b) =>
          Number(b.exact) - Number(a.exact) ||
          b.keywordHits - a.keywordHits ||
          a.index - b.index,
      );
    const unique = ranked.filter(
      ({ service }, index) =>
        ranked.findIndex((candidate) => candidate.service.id === service.id) ===
        index,
    );
    if (!unique.length) return empty();
    const recommendations = unique
      .slice(0, 3)
      .map(({ service }) => this.recommendation(service));
    return {
      recommendation: recommendations[0] ?? null,
      alternatives: recommendations.slice(1),
      matched: true,
    };
  }
  private isCurrent(generatedAt: string): boolean {
    const timestamp = Date.parse(generatedAt);
    const current = this.now();
    return (
      Number.isFinite(timestamp) &&
      timestamp <= current &&
      timestamp + this.intentTtlMs > current
    );
  }
  private recommendation(service: KbcService): Recommendation {
    return {
      serviceId: service.id,
      name: service.name,
      category: service.category,
      path: service.path,
      type: service.type,
      requiresAuthentication: service.requiresAuthentication,
      reason: reasonFor(service.category),
    };
  }
}
export const matchServices = (
  intent: IntentResult,
  services: readonly KbcService[],
  options?: MatcherOptions,
) => new CatalogueMatcher(options).match(intent, services);
function normalize(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function reasonFor(category: string): string {
  switch (category.toLocaleLowerCase()) {
    case "home":
      return "This may help with your home-buying planning.";
    case "insurance":
      return "This may help with your protection planning.";
    case "savings":
      return "This may help with your savings planning.";
    case "investing":
      return "This may help with your long-term financial planning.";
    case "loans":
      return "This may help with your borrowing planning.";
    default:
      return "This may help with your current banking needs.";
  }
}
function empty(): RecommendationResult {
  return { recommendation: null, alternatives: [], matched: false };
}
