import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App, { assistReducer, initialState } from "./App";
import {
  CONTEXT_DELAY_MS,
  CONTEXT_TTL_MS,
  createContextFixture,
} from "./data/contextFixture";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const enable = () =>
  fireEvent.click(screen.getByRole("switch", { name: "KBC Assist" }));
const receive = () => act(() => vi.advanceTimersByTime(CONTEXT_DELAY_MS));
const openContext = () =>
  fireEvent.click(screen.getByRole("button", { name: "Context" }));

describe("Assist demo", () => {
  it("keeps Assist in Context and preserves state across tabs", () => {
    render(<App />);
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByText("Products")).not.toBeInTheDocument();
    openContext();
    enable();
    receive();
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.getByText("€ 4,280.50")).toBeInTheDocument();
    openContext();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Planning to buy a home?")).toBeInTheDocument();
  });
  it("starts paused, opts in explicitly, and loads a safe fixture", () => {
    render(<App />);
    openContext();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("status")).toHaveTextContent("Assist paused");
    expect(
      screen.queryByText("Planning to buy a home?"),
    ).not.toBeInTheDocument();
    enable();
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for context");
    receive();
    expect(screen.getByRole("status")).toHaveTextContent("Suggestion ready");
    expect(screen.getByText("Planning to buy a home?")).toBeInTheDocument();
    expect(screen.getByText("Viewed housing listings")).toBeInTheDocument();
    expect(screen.getByText("Used a budget calculator")).toBeInTheDocument();
    expect(screen.getByText("Expires (Belgian time)")).toBeInTheDocument();
  });
  it("opens checklist and explanation and restores keyboard focus", () => {
    render(<App />);
    openContext();
    enable();
    receive();
    fireEvent.click(
      screen.getByRole("button", { name: "View home-buying checklist" }),
    );
    expect(
      screen.getByRole("heading", { name: "Home-buying checklist" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Prepare the deposit")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "KBC Assist" }));
    const whyButton = screen.getByRole("button", {
      name: "Why am I seeing this?",
    });
    whyButton.focus();
    fireEvent.click(whyButton);
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("Viewed housing listings"),
    ).toBeInTheDocument();
    const close = within(dialog).getByRole("button", {
      name: "Close explanation",
    });
    expect(close).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(
      within(dialog).getByRole("button", { name: "Got it" }),
    ).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(whyButton).toHaveFocus();
  });
  it("dismisses a suggestion but keeps context and the balance", () => {
    render(<App />);
    openContext();
    enable();
    receive();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss suggestion" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "No suggestion available yet",
    );
    expect(
      screen.queryByText("Planning to buy a home?"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Context preview")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(screen.getByText("€ 4,280.50")).toBeInTheDocument();
  });
  it("pause cancels a pending request and a new opt-in restarts the demo", () => {
    render(<App />);
    openContext();
    enable();
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    receive();
    expect(screen.getByRole("status")).toHaveTextContent("Assist paused");
    expect(screen.queryByText("Context preview")).not.toBeInTheDocument();
    enable();
    receive();
    expect(screen.getByText("Planning to buy a home?")).toBeInTheDocument();
  });
  it("delete cancels a pending request while retaining consent", () => {
    render(<App />);
    openContext();
    enable();
    fireEvent.click(screen.getByRole("button", { name: "Delete context" }));
    receive();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("status")).toHaveTextContent(
      "No suggestion available yet",
    );
    expect(screen.queryByText("Context preview")).not.toBeInTheDocument();
  });
  it("deletes ready context, expires automatically, and resets on a new session", () => {
    const { unmount } = render(<App />);
    openContext();
    enable();
    receive();
    fireEvent.click(screen.getByRole("button", { name: "Delete context" }));
    expect(screen.queryByText("Context preview")).not.toBeInTheDocument();
    enable();
    enable();
    receive();
    act(() => vi.advanceTimersByTime(CONTEXT_TTL_MS));
    expect(screen.getByRole("status")).toHaveTextContent(
      "No suggestion available yet",
    );
    expect(screen.queryByText("Context preview")).not.toBeInTheDocument();
    unmount();
    render(<App />);
    openContext();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });
  it("does not infer a suggestion for uncertain or expired context", () => {
    const state = assistReducer(initialState, { type: "enable" });
    expect(
      assistReducer(state, {
        type: "receive",
        context: { ...createContextFixture(), confidence: "low" },
      }).status,
    ).toBe("empty");
    expect(
      assistReducer(state, {
        type: "receive",
        context: { ...createContextFixture(), intent: "Unknown" },
      }).status,
    ).toBe("empty");
    expect(
      assistReducer(state, {
        type: "receive",
        context: createContextFixture(new Date(0)),
      }).status,
    ).toBe("empty");
    expect(
      assistReducer(initialState, {
        type: "receive",
        context: createContextFixture(),
      }),
    ).toEqual(initialState);
  });
});
