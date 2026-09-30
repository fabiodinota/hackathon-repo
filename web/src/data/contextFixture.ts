import type { AssistContext } from './assist'
export type { AssistContext } from './assist'


/* Demo fixture helpers remain here; production adapters live in assistApi.ts. */

export const CONTEXT_DELAY_MS = 1100
export const CONTEXT_TTL_MS = 15 * 60 * 1000

// Replace this adapter with the local service later. No screenshots are used here.
export function createContextFixture(now = new Date()): AssistContext {
  return {
    intent: 'Looking to buy a car',
    confidence: 'high',
    signals: ['Viewed car listings', 'Compared electric cars'],
    receivedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + CONTEXT_TTL_MS).toISOString(),
  }
}

export function canSuggestCarLoan(context: AssistContext | null, now = Date.now()): boolean {
  return !!context && context.confidence === 'high' &&
    context.intent === 'Looking to buy a car' && context.signals.length > 0 &&
    Date.parse(context.expiresAt) > now
}
