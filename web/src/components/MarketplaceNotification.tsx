import { useEffect, useState } from 'react'
import { ArrowUpRight, X } from 'lucide-react'
import type { AssistSuggestion } from '../data/assist'

export const NOTIFICATION_DELAY_MS = 1800

export function MarketplaceNotification({ suggestion, onDismiss, onExplore }: { suggestion: AssistSuggestion; onDismiss: () => void; onExplore: () => void }) {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), NOTIFICATION_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [])

  return <aside className="marketplace-notification-slot" aria-live="polite" aria-atomic="true">
    {visible && !dismissed && <div className="marketplace-notification">
      <div className="notification-app"><span className="notification-icon" aria-hidden="true">K</span><span>KBC Mobile</span><span className="notification-time">now</span></div>
      <button className="notification-dismiss" aria-label="Dismiss KBC notification" onClick={() => { setDismissed(true); onDismiss() }}><X size={14} /></button>
      <button className="notification-content" onClick={() => { setDismissed(true); onDismiss(); onExplore() }}>
        <strong>{suggestion.notification.title}</strong>
        <span>{suggestion.notification.body}</span>
        <span className="notification-action">{suggestion.notification.actionLabel} <ArrowUpRight size={14} /></span>
      </button>
    </div>}
  </aside>
}
