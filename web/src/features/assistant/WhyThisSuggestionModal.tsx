import { Check, ShieldCheck, Sparkles, X } from "lucide-react";
import type { AssistContext } from "../../data/contextFixture";
import { useEffect, useRef } from "react";

export function WhyThisSuggestionModal({
  context,
  onClose,
}: {
  context: AssistContext;
  onClose: () => void;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const buttons = dialog.querySelectorAll<HTMLButtonElement>("button");
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    first.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previousFocus?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="why-title"
      >
        <div className="modal-header">
          <div className="assist-icon">
            <Sparkles size={21} />
          </div>
          <button
            className="close-button"
            aria-label="Close explanation"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        <p className="eyebrow">Transparent by design</p>
        <h2 id="why-title">Why am I seeing this?</h2>
        <p className="modal-intro">
          KBC received an intent summary from your device. These are the safe
          signals used for this suggestion:
        </p>
        <div className="signal-list">
          {context.signals.map((signal) => (
            <div className="signal" key={signal}>
              <Check size={15} />
              <span>{signal}</span>
            </div>
          ))}
        </div>
        <div className="modal-privacy">
          <ShieldCheck size={20} />
          <p>
            <strong>Your screenshots stay on this device.</strong>
            <br />
            Only this intent and its safe supporting signals are shared with
            KBC.
          </p>
        </div>
        <button className="primary-button full-width" onClick={onClose}>
          Got it
        </button>
      </section>
    </div>
  );
}
