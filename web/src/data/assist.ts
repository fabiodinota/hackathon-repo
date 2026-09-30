export type AssistContext = {
  intent: string; confidence: 'high' | 'medium' | 'low'; signals: string[]; receivedAt: string; expiresAt: string
}
export type ServiceRecommendation = {
  serviceId: string; name: string; category: string; path: string; type: string; requiresAuthentication: boolean; reason: string
}
export type AssistSuggestion = {
  id: string
  service: ServiceRecommendation
  title: string
  description: string
  actionLabel: string
  notification: { title: string; body: string; actionLabel: string }
}
export type AssistSnapshot = { context: AssistContext | null; suggestion: AssistSuggestion | null }
export type AssistObserver = {
  signal: AbortSignal
  onSnapshot: (snapshot: AssistSnapshot) => void
  onError: () => void
}
/** A single source feeds both surfaces. Stop delivery immediately when signal aborts. */
export interface AssistSource {
  watch(observer: AssistObserver): void
  pause(): Promise<void>
  deleteContext(): Promise<void>
}
export const emptySnapshot: AssistSnapshot = { context: null, suggestion: null }

export function presentSuggestion(service: ServiceRecommendation, context: AssistContext): AssistSuggestion {
  const car = service.serviceId === 'car-loan'
  return {
    id: `${context.receivedAt}:${service.serviceId}`, service,
    title: car ? 'Looking for a car?' : `Explore ${service.name}`,
    description: car ? 'A KBC car loan could help spread the cost of your next vehicle.' : service.reason,
    actionLabel: car ? 'Explore KBC car loan' : `Explore ${service.name}`,
    notification: {
      title: car ? 'Looking for a car? KBC can help.' : 'KBC has a suggestion for you.',
      body: car ? 'Discover a car loan for your next drive.' : service.name,
      actionLabel: 'Take a look at our suggestions',
    },
  }
}
