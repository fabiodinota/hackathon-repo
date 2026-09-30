import { useEffect, useReducer, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { Dashboard } from './components/Dashboard'
import { ContextView } from './components/ContextView'
import { PhoneFrame, BottomNavigation } from './components/PhoneFrame'
import { WhyThisSuggestionModal } from './components/WhyThisSuggestionModal'
import { CarMarketplace } from './components/CarMarketplace'
import { MarketplaceNotification } from './components/MarketplaceNotification'
import { ContextOnboardingDrawer } from './components/ContextOnboardingDrawer'
import { demoAssistSource } from './data/demoAssistSource'
import type { AssistSnapshot, AssistSource } from './data/assist'

export type AssistStatus = 'paused' | 'waiting' | 'ready' | 'empty' | 'error'
export type AssistState = AssistSnapshot & {
  enabled: boolean
  watching: boolean
  generation: number
  status: AssistStatus
  suggestionDismissed: boolean
  dismissedIds: string[]
  currentView: 'dashboard'
}
export const initialState: AssistState = {
  enabled: false, watching: false, generation: 0, status: 'paused', context: null, suggestion: null,
  suggestionDismissed: false, dismissedIds: [], currentView: 'dashboard',
}
type Action =
  | { type: 'enable' | 'pause' | 'delete' | 'dismiss' | 'expire' | 'back' | 'error' }
  | { type: 'receive'; snapshot?: AssistSnapshot; context?: import('./data/assist').AssistContext }

export function assistReducer(state: AssistState, action: Action): AssistState {
  switch (action.type) {
    case 'enable': return { ...initialState, enabled: true, watching: true, generation: state.generation + 1, status: 'waiting' }
    case 'pause': return { ...state, enabled: false, watching: false, suggestion: null, status: 'paused' }
    case 'delete': return { ...state, watching: false, context: null, suggestion: null, dismissedIds: [], suggestionDismissed: false, status: state.enabled ? 'empty' : 'paused' }
    case 'dismiss': return { ...state, suggestionDismissed: true, dismissedIds: state.suggestion ? [...state.dismissedIds, state.suggestion.id] : state.dismissedIds, status: 'empty' }
    case 'receive': {
      if (!state.enabled || (!state.watching && !action.context)) return state
      const snapshot = action.snapshot ?? { context: action.context ?? null, suggestion: null }
      const { context, suggestion } = snapshot
      if (!context || !Number.isFinite(Date.parse(context.expiresAt)) || Date.parse(context.expiresAt) <= Date.now())
        return { ...state, context: null, suggestion: null, status: 'empty' }
      const valid = context.confidence === 'high' && context.signals.length > 0 ? suggestion : null
      const dismissed = !!valid && state.dismissedIds.includes(valid.id)
      return { ...state, context, suggestion: valid, suggestionDismissed: dismissed, status: valid && !dismissed ? 'ready' : 'empty' }
    }
    case 'expire': return { ...state, context: null, suggestion: null, status: state.enabled ? 'empty' : 'paused' }
    case 'error': return { ...state, watching: false, context: null, suggestion: null, status: 'error' }
    case 'back': return state
  }
}

export default function App({ assistSource = demoAssistSource }: { assistSource?: AssistSource } = {}) {
  const [state, dispatch] = useReducer(assistReducer, initialState)
  const [showContextOnboarding, setShowContextOnboarding] = useState(true)
  const [bankScreen, setBankScreen] = useState<HTMLDivElement | null>(null)
  const [contextViewKey, setContextViewKey] = useState(0)
  const [showWhy, setShowWhy] = useState(false)
  const [bankTab, setBankTab] = useState<'home' | 'context'>('home')
  const requestRef = useRef<AbortController | null>(null)
  const controlGeneration = useRef(0)
  const [notificationIds, setNotificationIds] = useState<string[]>([])
  useEffect(() => {
    if (!state.enabled || !state.watching) return
    const controller = new AbortController()
    requestRef.current = controller
    assistSource.watch({
      signal: controller.signal,
      onSnapshot: snapshot => { if (!controller.signal.aborted) dispatch({ type: 'receive', snapshot }) },
      onError: () => { if (!controller.signal.aborted) dispatch({ type: 'error' }) },
    })
    return () => controller.abort()
  }, [assistSource, state.enabled, state.watching, state.generation])
  useEffect(() => {
    if (!state.context) return
    const timer = window.setTimeout(() => { dispatch({ type: 'expire' }); setShowWhy(false) }, Math.max(0, Date.parse(state.context.expiresAt) - Date.now()))
    return () => window.clearTimeout(timer)
  }, [state.context])

  const enableAssist = () => {
    controlGeneration.current++
    setNotificationIds([])
    dispatch({ type: 'enable' })
  }
  const controlAssist = (action: 'pause' | 'delete') => {
    const generation = ++controlGeneration.current
    requestRef.current?.abort()
    dispatch({ type: action })
    setShowWhy(false)
    const pending = action === 'pause' ? assistSource.pause() : assistSource.deleteContext()
    void pending.catch(() => { if (generation === controlGeneration.current) dispatch({ type: 'error' }) })
  }
  const enableFromOnboarding = () => { enableAssist(); setShowContextOnboarding(false) }
  const exploreSuggestions = () => {
    setBankTab('context'); setContextViewKey(key => key + 1); setShowWhy(false)
    bankScreen?.scrollIntoView?.({ behavior: 'auto', block: 'nearest', inline: 'center' })
    bankScreen?.querySelector<HTMLButtonElement>('.bottom-nav button:last-of-type')?.focus({ preventScroll: true })
  }

  return <main className="app-shell"><div className="integration-controls"><label htmlFor="pairing-token">Local pairing token</label><input id="pairing-token" type="password" autoComplete="off" placeholder="Token from local .env" /><p id="pipeline-status">Assist off · only the mock marketplace is captured after consent</p></div><div className="frames-row">
    <section className="frame-column"><p className="frame-label">KBC banking app</p><PhoneFrame screenRef={setBankScreen}>
      <header className="topbar">
        <div className="brand" aria-label="KBC"><span className="brand-mark" aria-hidden="true">K</span><span>KBC</span></div>
        <div className="top-actions"><Bell size={20} aria-hidden="true" /><div className="avatar" aria-label="Alex">A</div></div>
      </header>
      {bankTab === 'context'
        ? <ContextView key={contextViewKey} state={state} onToggle={() => state.enabled ? controlAssist('pause') : enableAssist()}
          onPause={() => controlAssist('pause')} onDelete={() => controlAssist('delete')}
          onDismiss={() => dispatch({ type: 'dismiss' })} onWhy={() => setShowWhy(true)} />
        : <Dashboard />}
      <BottomNavigation activeTab={bankTab} onTabChange={tab => { setBankTab(tab); setShowWhy(false) }} />
    </PhoneFrame></section>
    <section className="frame-column"><p className="frame-label">Partner marketplace</p><PhoneFrame><CarMarketplace />
      {state.enabled && state.status === 'ready' && state.context && state.suggestion && !state.suggestionDismissed && !notificationIds.includes(state.suggestion.id) &&
        <MarketplaceNotification key={state.suggestion.id} suggestion={state.suggestion} onDismiss={() => setNotificationIds(ids => [...ids, state.suggestion!.id])} onExplore={exploreSuggestions} />}
    </PhoneFrame></section>
  </div>
    {showWhy && state.context && <WhyThisSuggestionModal context={state.context} onClose={() => setShowWhy(false)} />}
    {bankScreen && <ContextOnboardingDrawer container={bankScreen} open={showContextOnboarding} onEnable={enableFromOnboarding} onDecline={() => setShowContextOnboarding(false)} />}
  </main>
}
