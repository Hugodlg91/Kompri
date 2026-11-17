import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { History } from "../components/History/History";
import { SettingsPage } from "../components/Settings/SettingsPage";
import { SettingsProvider } from "../context/SettingsContext";
import type { HistoryItem } from "../hooks/useHistory";

type EventHandler = (event: { payload: unknown }) => void;

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, Set<EventHandler>>(),
  drops: new Set<EventHandler>(),
  invoke: vi.fn(),
  updateSettings: vi.fn(),
  getVersion: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args: unknown) => mocks.invoke(command, args),
  convertFileSrc: (path: string) => path,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (name: string, handler: EventHandler) => {
    if (!mocks.listeners.has(name)) mocks.listeners.set(name, new Set());
    mocks.listeners.get(name)!.add(handler);
    return Promise.resolve(() => mocks.listeners.get(name)?.delete(handler));
  },
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onDragDropEvent: (handler: EventHandler) => {
      mocks.drops.add(handler);
      return Promise.resolve(() => mocks.drops.delete(handler));
    },
    minimize: vi.fn(),
    toggleMaximize: vi.fn(),
    close: vi.fn(),
  }),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: () => mocks.getVersion(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../components/Layout/TitleBar", () => ({
  TitleBar: () => null,
}));

vi.mock("../hooks/useSettings", () => ({
  useSettings: () => ({
    isLoading: false,
    settings: {
      theme: "dark" as const,
      language: "en",
      output_dir: null,
      default_image_format: "webp",
      default_video_format: "mp4",
      default_audio_format: "mp3",
    },
    updateSettings: mocks.updateSettings,
  }),
}));

const SAMPLE_HISTORY: HistoryItem[] = [
  {
    id: "hist-1",
    file_name: "clip_sample.mp4",
    media_type: "video",
    source_format: "mov",
    target_format: "mp4",
    output_path: "C:/output/clip_sample.mp4",
    timestamp: Date.now(),
    status: "success",
    file_size: "14.2 MB",
  },
];

beforeEach(() => {
  mocks.listeners.clear();
  mocks.drops.clear();
  mocks.invoke.mockReset();
  mocks.updateSettings.mockReset();
  mocks.getVersion.mockReset();
  mocks.getVersion.mockResolvedValue("0.1.0");
  mocks.invoke.mockImplementation((command: string) => {
    if (command === "get_history") return Promise.resolve([]);
    return Promise.resolve();
  });
});

describe("responsive layout architecture", () => {
  it("renders .app-body, .app-sidebar, .sidebar-nav, and .page-container in App", async () => {
    const { container } = render(<App />);

    await waitFor(() => {
      expect(container.querySelector(".app-body")).not.toBeNull();
    });
    expect(container.querySelector(".app-sidebar")).not.toBeNull();
    expect(container.querySelector(".sidebar-nav")).not.toBeNull();
    expect(container.querySelector(".page-container")).not.toBeNull();
  });

  it("uses .responsive-grid-3 in SettingsPage and opens PillSelect dropdown via document.body portal", async () => {
    const { container } = render(
      <SettingsProvider>
        <SettingsPage />
      </SettingsProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/0\.1\.0/)).toBeInTheDocument();
    });

    expect(container.querySelector(".page-container")).not.toBeNull();

    const formatsGrid = container.querySelector(".responsive-grid-3") as HTMLElement | null;
    expect(formatsGrid).not.toBeNull();
    expect(formatsGrid?.style.gridTemplateColumns).toBe("");

    // Default video format PillSelect starts closed
    expect(screen.queryByRole("button", { name: "MKV" })).toBeNull();

    // Clicking the MP4 PillSelect trigger renders the dropdown menu into document.body via portal
    fireEvent.click(screen.getByRole("button", { name: "MP4" }));

    const mkvOption = await screen.findByRole("button", { name: "MKV" });
    expect(mkvOption).toBeInTheDocument();
    const portalMenu = document.body.querySelector(".glass-panel");
    expect(portalMenu).not.toBeNull();
    expect(portalMenu?.parentElement).toBe(document.body);
    expect(container.contains(portalMenu)).toBe(false);
  });

  it("renders .history-row-grid and .history-row-meta in History when items are present", async () => {
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "get_history") return Promise.resolve(SAMPLE_HISTORY);
      return Promise.resolve();
    });

    const { container } = render(<History />);

    expect(await screen.findByText("clip_sample.mp4")).toBeInTheDocument();
    expect(container.querySelector(".page-container")).not.toBeNull();
    expect(container.querySelector(".page-header")).not.toBeNull();

    const row = container.querySelector(".history-row-grid") as HTMLElement | null;
    expect(row).not.toBeNull();
    expect(row?.style.display).toBe("");
    expect(row?.style.gridTemplateColumns).toBe("");

    const meta = row?.querySelector(".history-row-meta");
    expect(meta).not.toBeNull();
    expect(meta?.querySelector("button[title='history.openFile']")).not.toBeNull();
    expect(meta?.querySelector("button[title='history.openFolder']")).not.toBeNull();
    expect(meta?.querySelector("button[title='history.deleteItem']")).not.toBeNull();
  });
});
