import { ArrowLeft, ArrowRight, Pause, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { AssistState } from '../App'
import { AssistCard } from './AssistCard'
import { ContextPreview } from './ContextPreview'

type Props = { state: AssistState; onToggle: () => void; onPause: () => void; onDelete: () => void; onDismiss: () => void; onWhy: () => void }
const statusLabels = { paused: 'Assist paused', waiting: 'Waiting for context', ready: 'Suggestion ready', empty: 'No suggestion available yet' }

export function ContextView({ state, onToggle, onPause, onDelete, onDismiss, onWhy }: Props) {
  const [showPreview, setShowPreview] = useState(false)
  if (showPreview) return <div className="content context-view context-preview-page"><button className="back-button" onClick={() => setShowPreview(false)}><ArrowLeft size={16} /> Back to Context</button><section className="context-heading preview-page-heading"><h1>Context preview</h1><p>The summary behind your personalised suggestions.</p></section>{state.context ? <ContextPreview context={state.context} /> : <p className="context-empty-preview">{state.status === 'waiting' ? 'Your context is loading.' : 'No context to show yet.'} You can manage context in the Context tab.</p>}</div>
  return <div className="content context-view"><section className="context-heading"><h1>Context</h1><p>A little context. More relevant help.</p></section><section className="context-setting"><div><h2>KBC Assist</h2><p>Personalise your next steps</p></div><button className={'assist-toggle ' + (state.enabled ? 'on' : '')} role="switch" aria-checked={state.enabled} aria-label="KBC Assist" onClick={onToggle}><span /></button></section><div className={'status-pill ' + state.status} role="status"><span className="status-dot" />{statusLabels[state.status]}</div><AssistCard state={state} onDismiss={onDismiss} onWhy={onWhy} /><button className="explore-context-button" onClick={() => setShowPreview(true)}>Explore context <ArrowRight size={16} /></button><div className="context-actions" aria-label="Assist privacy controls"><button className="outline-button" disabled={!state.enabled} onClick={onPause}><Pause size={14} /> Pause</button><button className="delete-button" disabled={!state.context && state.status !== 'waiting'} onClick={onDelete}><Trash2 size={14} /> Delete context</button></div></div>
}
