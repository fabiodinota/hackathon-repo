import { useEffect, useReducer } from "react";
import { Bell } from "lucide-react";
import { Dashboard } from "./features/assistant/Dashboard";
import { ContextView } from "./features/assistant/ContextView";
import { PhoneFrame, BottomNavigation } from "./components/PhoneFrame";
import { HomeBuyingChecklist } from "./features/assistant/HomeBuyingChecklist";
import { WhyThisSuggestionModal } from "./features/assistant/WhyThisSuggestionModal";
import { CarMarketplace } from "./features/activity/CarMarketplace";
import {
  canSuggestHome,
  CONTEXT_DELAY_MS,
  createContextFixture,
  type AssistContext,
} from "./data/contextFixture";

export type AssistStatus = "paused" | "waiting" | "ready" | "empty";
export type AssistState = {
  enabled: boolean;
  status: AssistStatus;
  context: AssistContext | null;
  suggestionDismissed: boolean;
  currentView: "dashboard" | "home-buying-checklist";
};
export const initialState: AssistState = {
  enabled: false,
  status: "paused",
  context: null,
  suggestionDismissed: false,
  currentView: "dashboard",
};
type Action =
  | {
      type:
        | "enable"
        | "pause"
        | "delete"
        | "dismiss"
        | "expire"
        | "back"
        | "checklist";
    }
  | { type: "receive"; context: AssistContext };

export function assistReducer(state: AssistState, action: Action): AssistState {
  switch (action.type) {
    case "enable":
      return { ...initialState, enabled: true, status: "waiting" };
    case "pause":
      return { ...state, enabled: false, status: "paused" };
    case "delete":
      return {
        ...state,
        context: null,
        suggestionDismissed: false,
        status: state.enabled ? "empty" : "paused",
        currentView: "dashboard",
      };
    case "dismiss":
      return { ...state, suggestionDismissed: true, status: "empty" };
    case "receive":
      if (!state.enabled || state.status !== "waiting") return state;
      return {
        ...state,
        context: action.context,
        status: canSuggestHome(action.context) ? "ready" : "empty",
      };
    case "expire":
      return {
        ...state,
        context: null,
        status: state.enabled ? "empty" : "paused",
        currentView: "dashboard",
      };
    case "checklist":
      return { ...state, currentView: "home-buying-checklist" };
    case "back":
      return { ...state, currentView: "dashboard" };
  }
}

export default function App() {
  const [state, dispatch] = useReducer(assistReducer, initialState);
  const [showWhy, setShowWhy] = useReducer(
    (_: boolean, next: boolean) => next,
    false,
  );
  const [bankTab, setBankTab] = useReducer(
    (_: "home" | "context", next: "home" | "context") => next,
    "home",
  );
  useEffect(() => {
    if (!state.enabled || state.status !== "waiting") return;
    const timer = window.setTimeout(
      () => dispatch({ type: "receive", context: createContextFixture() }),
      CONTEXT_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [state.enabled, state.status]);
  useEffect(() => {
    if (!state.context) return;
    const timer = window.setTimeout(
      () => {
        dispatch({ type: "expire" });
        setShowWhy(false);
      },
      Math.max(0, Date.parse(state.context.expiresAt) - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [state.context]);

  return (
    <main className="app-shell">
      <div className="frames-row">
        <section className="frame-column">
          <p className="frame-label">KBC banking app</p>
          <PhoneFrame>
            <header className="topbar">
              <div className="brand" aria-label="KBC">
                <span className="brand-mark" aria-hidden="true">
                  K
                </span>
                <span>KBC</span>
              </div>
              <div className="top-actions">
                <Bell size={20} aria-hidden="true" />
                <div className="avatar" aria-label="Alex">
                  A
                </div>
              </div>
            </header>
            {state.currentView === "home-buying-checklist" ? (
              <HomeBuyingChecklist onBack={() => dispatch({ type: "back" })} />
            ) : bankTab === "context" ? (
              <ContextView
                state={state}
                onToggle={() =>
                  dispatch({ type: state.enabled ? "pause" : "enable" })
                }
                onPause={() => dispatch({ type: "pause" })}
                onDelete={() => {
                  dispatch({ type: "delete" });
                  setShowWhy(false);
                }}
                onDismiss={() => dispatch({ type: "dismiss" })}
                onWhy={() => setShowWhy(true)}
                onChecklist={() => dispatch({ type: "checklist" })}
              />
            ) : (
              <Dashboard />
            )}
            <BottomNavigation
              activeTab={bankTab}
              onTabChange={(tab) => {
                setBankTab(tab);
                dispatch({ type: "back" });
                setShowWhy(false);
              }}
            />
          </PhoneFrame>
        </section>
        <section className="frame-column">
          <p className="frame-label">Partner marketplace</p>
          <PhoneFrame>
            <CarMarketplace />
          </PhoneFrame>
        </section>
      </div>
      {showWhy && state.context && (
        <WhyThisSuggestionModal
          context={state.context}
          onClose={() => setShowWhy(false)}
        />
      )}
    </main>
  );
}
