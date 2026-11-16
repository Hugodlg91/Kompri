import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";

type EventHandler = (event: { payload: any }) => void;
const mocks = vi.hoisted(() => ({
  listeners: new Map<string, Set<EventHandler>>(),
  drops: new Set<EventHandler>(),
  pending: [] as { resolve: (path: string) => void; reject: (error: string) => void }[],
  invoke: vi.fn(),
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
  }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../components/Layout/TitleBar", () => ({ TitleBar: () => null }));
vi.mock("../hooks/useSettings", () => ({
  useSettings: () => ({
    isLoading: false,
    settings: { theme: "dark", language: "en", output_dir: null,
      default_image_format: "webp", default_video_format: "mp4", default_audio_format: "mp3" },
    updateSettings: vi.fn(),
  }),
}));

beforeEach(() => {
  mocks.listeners.clear();
  mocks.drops.clear();
  mocks.pending.length = 0;
  mocks.invoke.mockReset();
  mocks.invoke.mockImplementation((command: string) => {
    if (command.startsWith("convert_")) {
      return new Promise<string>((resolve, reject) => mocks.pending.push({ resolve, reject }));
    }
    if (command === "get_media_info") return Promise.resolve({ duration: 10, file_size: 100 });
    if (command === "get_image_info") return Promise.resolve({ width: 10, height: 10, file_size: 100, format: "png", has_alpha: false });
    if (command === "get_history") return Promise.resolve([]);
    return Promise.resolve();
  });
});

async function drop(path: string) {
  await act(async () => {
    mocks.drops.forEach(handler => handler({ payload: { type: "drop", paths: [path] } }));
  });
}

async function start(type: "image" | "video" | "audio", input: string) {
  render(<App />);
  fireEvent.click(screen.getByTitle(`nav.${type}`));
  await waitFor(() => expect(mocks.drops.size).toBe(3));
  await drop(input);
  fireEvent.click(screen.getByRole("button", { name: "converter.convert" }));
  await waitFor(() => expect(mocks.pending).toHaveLength(1));
}

describe("navigation during conversion", () => {
  it("preserves the input, progress and completed result across sections", async () => {
    await start("video", "C:/clip.mp4");
    fireEvent.click(screen.getByTitle("nav.audio"));
    act(() => mocks.listeners.get("conversion_progress")?.forEach(handler =>
      handler({ payload: { percentage: 42, current_time: "00:00:04", speed: "2x" } })));
    expect(screen.getByText("42%")).not.toBeVisible();
    fireEvent.click(screen.getByTitle("nav.video"));
    expect(screen.getByText("clip.mp4")).toBeVisible();
    expect(screen.getByText("42%")).toBeVisible();
    fireEvent.click(screen.getByTitle("nav.history"));
    await act(async () => { mocks.pending[0].resolve("C:/clip_converted.mp4"); });
    fireEvent.click(screen.getByTitle("nav.video"));
    expect(screen.getByText("clip_converted.mp4")).toBeVisible();
    expect(screen.getByRole("button", { name: "result.newConversion" })).toBeVisible();
  });

  it.each([
    ["video", "C:/clip.mp4"], ["audio", "C:/song.mp3"], ["image", "C:/photo.png"],
  ] as const)("protects the active %s conversion from mode switches and file drops", async (type, input) => {
    await start(type, input);
    expect(screen.getByRole("button", { name: "batch.single" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "batch.toggle" })).toBeDisabled();
    await drop(input.replace(/[^/]+$/, "replacement." + input.split(".").pop()));
    expect(mocks.invoke.mock.calls.filter(([command]) => command === (type === "image" ? "get_image_info" : "get_media_info"))).toHaveLength(1);
    expect(screen.getByText(input.split("/").pop()!)).toBeVisible();
    expect(screen.queryByRole("button", { name: "converter.convert" })).toBeNull();
  });

  it("ignores native drops in hidden converters", async () => {
    render(<App />);
    await waitFor(() => expect(mocks.drops.size).toBe(3));
    // A video dropped while Image is visible must not select it in hidden Video.
    await drop("C:/hidden.mp4");
    expect(mocks.invoke).not.toHaveBeenCalledWith("get_media_info", expect.anything());
    fireEvent.click(screen.getByTitle("nav.video"));
    expect(screen.queryByText("hidden.mp4")).toBeNull();
    await drop("C:/visible.mp4");
    expect(screen.getByText("visible.mp4")).toBeVisible();
  });

  it("supports Ctrl+1..5 keyboard shortcuts and passes snake_case file_path to open_folder", async () => {
    await start("video", "C:/clip.mp4");
    await act(async () => { mocks.pending[0].resolve("C:/clip_converted.mp4"); });
    fireEvent.click(screen.getByRole("button", { name: "result.openFolder" }));
    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith("open_folder", { file_path: "C:/clip_converted.mp4" })
    );
    fireEvent.keyDown(window, { key: "4", ctrlKey: true });
    expect(await screen.findByText("history.title")).toBeVisible();
  });
});
