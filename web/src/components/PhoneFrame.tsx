import type { ReactNode } from "react";
import { Home, ArrowRight, User, Eye } from "lucide-react";

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="phone-frame">
      <div className="phone-screen">{children}</div>
    </div>
  );
}
export function BottomNavigation({
  activeTab,
  onTabChange,
}: {
  activeTab: "home" | "context";
  onTabChange: (tab: "home" | "context") => void;
}) {
  return (
    <nav className="bottom-nav" aria-label="Banking navigation preview">
      <button
        className={"nav-item " + (activeTab === "home" ? "active" : "")}
        aria-current={activeTab === "home" ? "page" : undefined}
        onClick={() => onTabChange("home")}
      >
        <Home size={19} />
        <span>Home</span>
      </button>
      <span className="nav-item">
        <ArrowRight size={19} />
        <span>Payments</span>
      </span>
      <button
        className={"nav-item " + (activeTab === "context" ? "active" : "")}
        aria-current={activeTab === "context" ? "page" : undefined}
        onClick={() => onTabChange("context")}
      >
        <Eye size={19} />
        <span>Context</span>
      </button>
      <span className="nav-item">
        <User size={19} />
        <span>Profile</span>
      </span>
    </nav>
  );
}
