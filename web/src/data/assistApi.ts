import {
  emptySnapshot, presentSuggestion, type AssistContext, type AssistSource,
  type AssistSnapshot, type ServiceRecommendation,
} from './assist'

export type AssistSession = { sessionId: string; sessionToken: string; expiresAt: string }
export class AssistApiError extends Error {
  constructor(readonly status: number) { super(`Assist request failed (${status})`) }
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const date = (v: unknown): v is string => text(v) && Number.isFinite(Date.parse(v))

/** Call only after consent. Keep credentials in memory, never in VITE_* variables. */
export async function startAssistSession(pairingToken: string, signal: AbortSignal, baseUrl = '/api', fetcher: typeof fetch = fetch): Promise<AssistSession> {
  const response = await fetcher(`${baseUrl}/session/start`, {
    method: 'POST', signal, cache: 'no-store',
    headers: { Authorization: `Bearer ${pairingToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ consent: true }),
  })
  if (!response.ok) throw new AssistApiError(response.status)
  const data: unknown = await response.json()
  if (!record(data) || !text(data.sessionId) || !text(data.sessionToken) || !date(data.expiresAt)) throw new Error('Invalid session response')
  return { sessionId: data.sessionId, sessionToken: data.sessionToken, expiresAt: data.expiresAt }
}

/** Maps the repository's existing API contract; never infers a service from intent text. */
export function mapAssistResponse(rawContext: unknown, rawRecommendation: unknown, sessionId: string, now = Date.now()): AssistSnapshot {
  if (!record(rawContext) || rawContext.sessionId !== sessionId || typeof rawContext.paused !== 'boolean') throw new Error('Invalid context response')
  if (!record(rawRecommendation) || typeof rawRecommendation.matched !== 'boolean') throw new Error('Invalid recommendation response')
  if (rawContext.paused || rawContext.intent === null) return emptySnapshot
  const intent = rawContext.intent
  if (!record(intent) || !(intent.intent === null || text(intent.intent)) ||
    typeof intent.confidence !== 'number' || !Number.isFinite(intent.confidence) || intent.confidence < 0 || intent.confidence > 1 ||
    typeof intent.uncertain !== 'boolean' || !Array.isArray(intent.signals) || !intent.signals.every(text) ||
    !date(intent.generatedAt) || !date(rawContext.expiresAt)) throw new Error('Invalid intent response')
  if (intent.uncertain || !intent.intent || intent.confidence < .8 || !intent.signals.length ||
    Date.parse(intent.generatedAt) > now || Date.parse(rawContext.expiresAt) <= now || Date.parse(rawContext.expiresAt) <= Date.parse(intent.generatedAt)) return emptySnapshot
  const context: AssistContext = { intent: intent.intent, confidence: 'high', signals: intent.signals, receivedAt: intent.generatedAt, expiresAt: rawContext.expiresAt }
  if (!rawRecommendation.matched || rawRecommendation.recommendation === null) return { context, suggestion: null }
  const service = rawRecommendation.recommendation
  if (!record(service) || !['serviceId', 'name', 'category', 'path', 'type', 'reason'].every(key => text(service[key])) ||
    typeof service.requiresAuthentication !== 'boolean' || !/^[/][A-Za-z0-9][A-Za-z0-9_./-]*$/.test(String(service.path)) ||
    String(service.path).includes('..') || String(service.path).includes('//')) throw new Error('Invalid service response')
  // Guide/checklist and transaction recommendations are outside this service-offer UI.
  if (service.type === 'guide' || service.type === 'transaction') return { context, suggestion: null }
  const recommendation: ServiceRecommendation = {
    serviceId: service.serviceId as string, name: service.name as string, category: service.category as string,
    path: service.path as string, type: service.type as string, requiresAuthentication: service.requiresAuthentication, reason: service.reason as string,
  }
  return { context, suggestion: presentSuggestion(recommendation, context) }
}

export function createApiAssistSource(options: {
  /** Called after UI opt-in. Reuse the capture pipeline's authenticated session. */
  getSession: (signal: AbortSignal) => Promise<AssistSession>
  baseUrl?: string
  pollMs?: number
  fetcher?: typeof fetch
}): AssistSource {
  const baseUrl = (options.baseUrl ?? '/api').replace(/[/]$/, '')
  const fetcher = options.fetcher ?? fetch
  const pollMs = options.pollMs ?? 1500
  if (!Number.isFinite(pollMs) || pollMs < 250) throw new Error('pollMs must be at least 250')
  let session: AssistSession | null = null
  let controlQueue: Promise<unknown> = Promise.resolve()
  // Keep pause/delete/resume ordered even if the user toggles rapidly.
  const enqueue = <T,>(operation: () => Promise<T>): Promise<T> => {
    const pending = controlQueue.then(operation)
    controlQueue = pending.catch(() => {})
    return pending
  }
  const request = async (path: string, method: string, signal?: AbortSignal): Promise<unknown> => {
    if (!session || Date.parse(session.expiresAt) <= Date.now()) throw new AssistApiError(410)
    const response = await fetcher(`${baseUrl}${path}`, { method, signal, cache: 'no-store', headers: { Authorization: `Bearer ${session.sessionToken}`, 'X-Session-Id': session.sessionId } })
    if (!response.ok) throw new AssistApiError(response.status)
    return response.json()
  }
  return {
    watch({ signal, onSnapshot, onError }) {
      if (signal.aborted) return
      let timer: number | undefined
      signal.addEventListener('abort', () => window.clearTimeout(timer), { once: true })
      const fail = () => { if (!signal.aborted) onError() }
      const poll = async () => {
        if (signal.aborted) return
        try {
          const context = await request('/context', 'GET', signal)
          const recommendation = await request('/services/recommendation', 'GET', signal)
          // Reject a context that changed during the two reads; wait for a consistent poll.
          const confirmed = await request('/context', 'GET', signal)
          if (signal.aborted) return
          onSnapshot(JSON.stringify(context) === JSON.stringify(confirmed)
            ? mapAssistResponse(context, recommendation, session!.sessionId) : emptySnapshot)
          if (!signal.aborted) timer = window.setTimeout(() => { void poll() }, pollMs)
        } catch { fail() }
      }
      void enqueue(async () => {
        if (signal.aborted) return
        session = await options.getSession(signal)
        if (signal.aborted) return
        await request('/session/resume', 'POST', signal)
        if (!signal.aborted) void poll()
      }).catch(fail)
    },
    pause: () => enqueue(async () => { if (session) await request('/session/pause', 'POST') }),
    deleteContext: () => enqueue(async () => { if (session) await request('/context', 'DELETE') }),
  }
}
