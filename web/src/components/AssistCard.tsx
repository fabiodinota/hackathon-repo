import { ArrowRight, CircleHelp, ShieldCheck, Sparkles, X } from 'lucide-react'
import type { AssistState } from '../App'
import { useState } from 'react'

export function AssistCard({ state, onDismiss, onWhy }: { state: AssistState; onDismiss: () => void; onWhy: () => void }) {
  const [showService, setShowService] = useState(false)
  return <>
    {!state.enabled && <section className="assist-optin"><div className="assist-icon"><Sparkles size={22} /></div><div className="assist-copy"><h3>Assist is off</h3><p>Turn it on whenever you want more relevant next steps.</p></div></section>}
    {state.status === 'waiting' && <section className="empty-card"><div className="loading-ring" aria-hidden="true" /><div><h3>Finding your next step</h3><p>Your suggestions will appear here.</p></div></section>}
    {state.enabled && state.status === 'ready' && state.context && state.suggestion && !state.suggestionDismissed && <section className="suggestion-card">
      <div className="card-topline"><span className="context-tag"><Sparkles size={14} /> Based on your recent activity</span><button className="close-button" aria-label="Dismiss suggestion" onClick={onDismiss}><X size={17} /></button></div>
      <h3>{state.suggestion.title}</h3><p>{state.suggestion.description}</p>
      <div className="suggestion-actions"><button className="primary-button" onClick={() => setShowService(true)}>{state.suggestion.actionLabel} <ArrowRight size={16} /></button><button className="text-button" onClick={onWhy}><CircleHelp size={16} /> Why am I seeing this?</button></div>
      {showService && <section className="service-preview"><div><p className="eyebrow">KBC service</p><h4>{state.suggestion.service.name}</h4><p>{state.suggestion.service.reason}</p></div><button className="service-close" aria-label="Close car loan preview" onClick={() => setShowService(false)}><X size={15} /></button></section>}
    </section>}
    {state.status === 'empty' && <section className="empty-card"><div className="empty-icon"><ShieldCheck size={21} /></div><div><h3>You're all caught up</h3><p>{state.suggestionDismissed ? 'You can still review your summary in Explore context.' : 'New suggestions will appear when relevant context is available.'}</p></div></section>}
  </>
}
