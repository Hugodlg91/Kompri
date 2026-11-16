import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TitleBar } from "../components/Layout/TitleBar";

const mockClose = vi.fn().mockResolvedValue(undefined);
const mockMinimize = vi.fn().mockResolvedValue(undefined);
const mockToggleMaximize = vi.fn().mockResolvedValue(undefined);

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    close: mockClose,
    minimize: mockMinimize,
    toggleMaximize: mockToggleMaximize,
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
  }),
}));

const mockUpdateSettings = vi.fn();

vi.mock("../../context/SettingsContext", () => ({
  useSettingsContext: () => ({
    settings: { theme: "dark", language: "fr" },
    updateSettings: mockUpdateSettings,
  }),
}));

vi.mock("../context/SettingsContext", () => ({
  useSettingsContext: () => ({
    settings: { theme: "dark", language: "fr" },
    updateSettings: mockUpdateSettings,
  }),
}));

describe("TitleBar Window Controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls close() once when clicking the window.close button", () => {
    render(<TitleBar />);
    const closeBtn = screen.getByTestId("window-close");
    expect(closeBtn).toBeInTheDocument();
    expect(closeBtn).toHaveAttribute("title", "window.close");
    expect(closeBtn).toHaveAttribute("aria-label", "window.close");

    fireEvent.click(closeBtn);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("calls minimize() once when clicking the window.minimize button", () => {
    render(<TitleBar />);
    const minimizeBtn = screen.getByTestId("window-minimize");
    expect(minimizeBtn).toBeInTheDocument();
    expect(minimizeBtn).toHaveAttribute("title", "window.minimize");
    expect(minimizeBtn).toHaveAttribute("aria-label", "window.minimize");

    fireEvent.click(minimizeBtn);
    expect(mockMinimize).toHaveBeenCalledTimes(1);
  });

  it("calls toggleMaximize() once when clicking the window.maximize button", () => {
    render(<TitleBar />);
    const maximizeBtn = screen.getByTestId("window-maximize");
    expect(maximizeBtn).toBeInTheDocument();
    expect(maximizeBtn).toHaveAttribute("title", "window.maximize");
    expect(maximizeBtn).toHaveAttribute("aria-label", "window.maximize");

    fireEvent.click(maximizeBtn);
    expect(mockToggleMaximize).toHaveBeenCalledTimes(1);
  });

  it("calls toggleMaximize() once when double-clicking the header drag region", () => {
    const { container } = render(<TitleBar />);
    const header = container.querySelector("header")!;
    expect(header).toBeInTheDocument();
    expect(header).toHaveAttribute("data-tauri-drag-region");

    fireEvent.doubleClick(header);
    expect(mockToggleMaximize).toHaveBeenCalledTimes(1);
  });

  it("shows micro SVG icons inside control buttons when hovering over the controls container", () => {
    render(<TitleBar />);
    const closeBtn = screen.getByTestId("window-close");
    const minimizeBtn = screen.getByTestId("window-minimize");
    const maximizeBtn = screen.getByTestId("window-maximize");

    // Initially icons are not rendered
    expect(closeBtn.querySelector("svg")).toBeNull();
    expect(minimizeBtn.querySelector("svg")).toBeNull();
    expect(maximizeBtn.querySelector("svg")).toBeNull();

    // Hover container
    const controlsContainer = closeBtn.parentElement!;
    fireEvent.mouseEnter(controlsContainer);

    expect(closeBtn.querySelector("svg")).not.toBeNull();
    expect(minimizeBtn.querySelector("svg")).not.toBeNull();
    expect(maximizeBtn.querySelector("svg")).not.toBeNull();

    // Mouse leave hides them
    fireEvent.mouseLeave(controlsContainer);

    expect(closeBtn.querySelector("svg")).toBeNull();
    expect(minimizeBtn.querySelector("svg")).toBeNull();
    expect(maximizeBtn.querySelector("svg")).toBeNull();
  });
});
