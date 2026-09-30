import { ArrowRight, CircleHelp, ShieldCheck, Sparkles, X } from "lucide-react";
import type { AssistState } from "../../App";

export function AssistCard({
  state,
  onDismiss,
  onWhy,
  onChecklist,
}: {
  state: AssistState;
  onDismiss: () => void;
  onWhy: () => void;
  onChecklist: () => void;
}) {
  return (
    <>
      <p id="consent-copy" className="consent-copy">
        When you turn on Assist, KBC receives only an intent summary and safe
        supporting signals. Your screenshots stay on this device. You can pause
        or delete context at any time.
      </p>
      {!state.enabled && (
        <section className="assist-optin">
          <div className="assist-icon">
            <Sparkles size={22} />
          </div>
          <div className="assist-copy">
            <h3>Get help at the right moment</h3>
            <p>
              Turn on the switch above to get useful next steps from context you
              choose to share.
            </p>
          </div>
        </section>
      )}
      {state.status === "waiting" && (
        <section className="empty-card">
          <div className="loading-ring" aria-hidden="true" />
          <div>
            <h3>Listening for an intent summary</h3>
            <p>Waiting for safe context from the local demo service.</p>
          </div>
        </section>
      )}
      {state.enabled &&
        state.status === "ready" &&
        state.context &&
        !state.suggestionDismissed && (
          <section className="suggestion-card">
            <div className="card-topline">
              <span className="context-tag">
                <Sparkles size={14} /> Based on your recent activity
              </span>
              <button
                className="close-button"
                aria-label="Dismiss suggestion"
                onClick={onDismiss}
              >
                <X size={17} />
              </button>
            </div>
            <h3>Planning to buy a home?</h3>
            <p>
              You may be exploring your next home. Here is a simple checklist to
              help you prepare your budget and mortgage.
            </p>
            <div className="suggestion-actions">
              <button className="primary-button" onClick={onChecklist}>
                View home-buying checklist <ArrowRight size={16} />
              </button>
              <button className="text-button" onClick={onWhy}>
                <CircleHelp size={16} /> Why am I seeing this?
              </button>
            </div>
          </section>
        )}
      {state.status === "empty" && (
        <section className="empty-card">
          <div className="empty-icon">
            <ShieldCheck size={21} />
          </div>
          <div>
            <h3>No suggestion available yet</h3>
            <p>
              {state.suggestionDismissed
                ? "Suggestion dismissed. Your shared context is still available below."
                : "We will only suggest something when there is enough context to understand your intent."}
            </p>
          </div>
        </section>
      )}
    </>
  );
}
