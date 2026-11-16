import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useConversion } from "../hooks/useConversion";

// ─── Tauri mocks ──────────────────────────────────────────────────────────────

type Handler = (event: { payload: unknown }) => void;
const listeners = new Map<string, Set<Handler>>();
const pending: { resolve: (v: unknown) => void; reject: (e: unknown) => void }[] = [];

const invoke = vi.fn((command: string, _args?: unknown) => {
  if (command === "cancel_conversion" || command === "add_history_item") {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => pending.push({ resolve, reject }));
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: unknown) => invoke(command, args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: (name: string, handler: Handler) => {
    if (!listeners.has(name)) listeners.set(name, new Set());
    listeners.get(name)!.add(handler);
    return Promise.resolve(() => listeners.get(name)!.delete(handler));
  },
}));

function emit(name: string, payload: unknown) {
  act(() => listeners.get(name)?.forEach((h) => h({ payload })));
}


async function mounted() {
  const hook = renderHook(() => useConversion());
  // Wait until both progress listeners are registered.
  await waitFor(() => expect(listeners.get("batch_progress")?.size ?? 0).toBeGreaterThan(0));
  return hook;
}

const single = { input_path: "C:/in.mp4", output_path: "C:/out.mkv" };
const batch = { files: [single, { input_path: "C:/b.mp4", output_path: "C:/b.mkv" }] };

beforeEach(() => {
  listeners.clear();
  pending.length = 0;
  invoke.mockClear();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useConversion with converters kept mounted", () => {
  it("applies progress only to the instance that launched the job", async () => {
    const video = await mounted();
    const audio = await mounted();

    act(() => { video.result.current.convertVideo(single).catch(() => {}); });
    emit("conversion_progress", { percentage: 40, current_time: "00:00:04", speed: "2x" });

    expect(video.result.current.progress).toBe(40);
    expect(audio.result.current.progress).toBe(0);
    expect(audio.result.current.status).toBe("idle");
  });

  it("refuses a second launch from the same instance without disturbing the first", async () => {
    const video = await mounted();
    act(() => { video.result.current.convertVideo(single).catch(() => {}); });

    let second: unknown;
    await act(async () => {
      second = await video.result.current.convertVideo(single).catch((e) => e);
    });

    expect(second).toBe("busy");
    expect(video.result.current.status).toBe("converting");
    expect(invoke.mock.calls.filter(([c]) => c === "convert_video")).toHaveLength(1);
  });

  it("shows the backend busy refusal on the instance that tried to launch", async () => {
    const audio = await mounted();
    act(() => { audio.result.current.convertAudio({ ...single, normalize: false }).catch(() => {}); });
    await act(async () => { pending[0].reject("busy"); });

    expect(audio.result.current.status).toBe("error");
    expect(audio.result.current.error).toBe("busy");
  });

  it("stays converting after cancel until the backend confirms", async () => {
    const video = await mounted();
    act(() => { video.result.current.convertVideo(single).catch(() => {}); });
    emit("conversion_progress", { percentage: 30, current_time: "", speed: "" });

    await act(async () => { await video.result.current.cancel(); });
    expect(invoke).toHaveBeenCalledWith("cancel_conversion", undefined);
    expect(video.result.current.status).toBe("converting");

    await act(async () => { pending[0].reject("cancelled"); });
    expect(video.result.current.status).toBe("idle");
    expect(video.result.current.progress).toBe(0);
    expect(video.result.current.error).toBeNull();
  });

  it("routes batch progress to the batch owner only and ignores late events", async () => {
    const video = await mounted();
    const audio = await mounted();

    act(() => { video.result.current.convertVideoBatch(batch).catch(() => {}); });
    emit("batch_progress", { index: 1, total: 2, current_file: "b.mp4", percentage: 50 });
    emit("conversion_progress", { percentage: 90, current_time: "", speed: "" });

    expect(video.result.current.progress).toBe(50);
    expect(video.result.current.currentFile).toBe("b.mp4");
    expect(audio.result.current.batchTotal).toBe(0);

    await act(async () => { pending[0].resolve([]); });
    emit("batch_progress", { index: 0, total: 9, current_file: "late", percentage: 5 });
    expect(video.result.current.status).toBe("done");
    expect(video.result.current.currentFile).toBe("b.mp4");
  });
});

it("does not reset a running batch or stop routing its progress", async () => {
  const video = await mounted();
  act(() => { video.result.current.convertVideoBatch(batch).catch(() => {}); });
  act(() => { video.result.current.reset(); });
  emit("batch_progress", { index: 1, total: 2, current_file: "b.mp4", percentage: 50 });
  expect(video.result.current.status).toBe("converting");
  expect(video.result.current.progress).toBe(50);
  expect(video.result.current.currentFile).toBe("b.mp4");
});
