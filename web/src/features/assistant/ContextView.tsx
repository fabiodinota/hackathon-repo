import { Pause, ShieldCheck, Trash2 } from "lucide-react";
import type { AssistState } from "../../App";
import { AssistCard } from "./AssistCard";
import { ContextPreview } from "./ContextPreview";

type Props = {
  state: AssistState;
  onToggle: () => void;
  onPause: () => void;
  onDelete: () => void;
  onDismiss: () => void;
  onWhy: () => void;
  onChecklist: () => void;
};
const statusLabels: Record<AssistState["status"], string> = {
  paused: "Assist paused",
  waiting: "Waiting for context",
  ready: "Suggestion ready",
  empty: "No suggestion available yet",
  error: "Unable to load suggestions",
};

export function ContextView({
  state,
  onToggle,
  onPause,
  onDelete,
  onDismiss,
  onWhy,
  onChecklist,
}: Props) {
  return (
    <div className="content context-view">
      <section className="context-heading">
        <p className="eyebrow">Privacy centre</p>
        <h1>Context</h1>
        <p>See what KBC Assist understands and exactly what is shared.</p>
      </section>
      <section className="section-heading">
        <div>
          <p className="eyebrow">Personalised for you</p>
          <h2>KBC Assist</h2>
        </div>
        <button
          className={"assist-toggle " + (state.enabled ? "on" : "")}
          role="switch"
          aria-checked={state.enabled}
          aria-label="KBC Assist"
          aria-describedby="consent-copy"
          onClick={onToggle}
        >
          <span />
        </button>
      </section>
      <div className={"status-pill " + state.status} role="status">
        <span className="status-dot" />
        {statusLabels[state.status]}
      </div>
      <AssistCard
        state={state}
        onDismiss={onDismiss}
        onWhy={onWhy}
        onChecklist={onChecklist}
      />
      {state.context && <ContextPreview context={state.context} />}
      <div className="context-actions" aria-label="Assist privacy controls">
        <button
          className="outline-button"
          disabled={!state.enabled}
          onClick={onPause}
        >
          <Pause size={15} /> Pause
        </button>
        <button className="delete-button" onClick={onDelete}>
          <Trash2 size={15} /> Delete context
        </button>
      </div>
      <p className="privacy-note">
        <ShieldCheck size={15} /> KBC receives an intent summary. Your
        screenshots stay on this device.
      </p>
      <p className="prototype-note">
        Hackathon prototype · Simulated local context
      </p>
    </div>
  );
}
