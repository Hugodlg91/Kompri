import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n";
import App from "../App";
import { ProgressBar } from "../components/Converter/ProgressBar";
import { VideoConverter } from "../components/Converter/VideoConverter";
import { SettingsPage } from "../components/Settings/SettingsPage";
import { SettingsProvider } from "../context/SettingsContext";
import { useConversion } from "../hooks/useConversion";
import { useSettings } from "../hooks/useSettings";
import fr from "../locales/fr.json";
import en from "../locales/en.json";
import es from "../locales/es.json";
import de from "../locales/de.json";
import pt from "../locales/pt.json";

type EventHandler = (event: { payload: any }) => void;

if (typeof globalThis.localStorage?.setItem !== "function") {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
  });
}

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, Set<EventHandler>>(),
  drops: new Set<EventHandler>(),
  invoke: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
  minimize: vi.fn().mockResolvedValue(undefined),
  toggleMaximize: vi.fn().mockResolvedValue(undefined),
  getVersion: vi.fn().mockResolvedValue("1.1.0"),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (command: string, args?: unknown) =>
    args === undefined ? mocks.invoke(command) : mocks.invoke(command, args),
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
    close: mocks.close,
    minimize: mocks.minimize,
    toggleMaximize: mocks.toggleMaximize,
  }),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: () => mocks.getVersion(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

function emitEvent(name: string, payload: unknown) {
  act(() => {
    mocks.listeners.get(name)?.forEach((h) => h({ payload }));
  });
}

async function dropVideoFile(path: string) {
  await waitFor(() => expect(mocks.drops.size).toBeGreaterThan(0));
  await act(async () => {
    mocks.drops.forEach((h) => h({ payload: { type: "drop", paths: [path] } }));
  });
}

describe("Target-size video compression, 2-pass progress, settings & CLI mini-mode", () => {
  beforeEach(async () => {
    mocks.listeners.clear();
    mocks.drops.clear();
    mocks.invoke.mockReset();
    mocks.close.mockClear();
    mocks.minimize.mockClear();
    mocks.toggleMaximize.mockClear();
    mocks.getVersion.mockResolvedValue("1.1.0");
    await i18n.changeLanguage("en");

    mocks.invoke.mockImplementation((command: string) => {
      if (command === "get_settings") {
        return Promise.resolve({
          language: "en",
          theme: "dark",
          output_dir: null,
          default_video_format: "mp4",
          default_audio_format: "mp3",
          default_image_format: "webp",
        });
      }
      if (command === "get_media_info") {
        return Promise.resolve({
          duration: 60,
          width: 1920,
          height: 1080,
          video_codec: "h264",
          file_size: 40 * 1024 * 1024,
          fps: 60,
        });
      }
      if (command === "get_platform") return Promise.resolve("windows");
      if (command === "get_context_menu_status") return Promise.resolve(false);
      if (command === "get_cli_state") return Promise.resolve(null);
      if (command === "get_history") return Promise.resolve([]);
      return Promise.resolve();
    });
  });

  it("calls estimate_target_size and displays estimated resolution and bitrate when selecting Discord (10 MB)", async () => {
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "get_settings") {
        return Promise.resolve({
          language: "en",
          theme: "dark",
          output_dir: null,
          default_video_format: "mp4",
          default_audio_format: "mp3",
          default_image_format: "webp",
        });
      }
      if (command === "get_media_info") {
        return Promise.resolve({
          duration: 90,
          width: 1920,
          height: 1080,
          video_codec: "h264",
          file_size: 52 * 1024 * 1024,
          fps: 30,
        });
      }
      if (command === "estimate_target_size") {
        return Promise.resolve({
          already_under_target: false,
          source_size_bytes: 52 * 1024 * 1024,
          target_bytes: 10 * 1024 * 1024,
          budget_bytes: 9_800_000,
          video_kbps: 820,
          audio_kbps: 96,
          target_width: 1280,
          target_height: 720,
          target_fps: 30,
          downscaled: true,
          fps_reduced: false,
        });
      }
      return Promise.resolve();
    });

    render(
      <SettingsProvider>
        <VideoConverter />
      </SettingsProvider>
    );

    await dropVideoFile("C:/videos/gameplay.mkv");

    const discordBtn = await screen.findByRole("button", { name: "Discord (10 MB)" });
    fireEvent.click(discordBtn);

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("estimate_target_size", {
        input_path: "C:/videos/gameplay.mkv",
        target_mb: 10,
        codec: "h264",
      });
    });

    expect(await screen.findByText(/Estimated final resolution: 1280×720/)).toBeInTheDocument();
    expect(screen.getByText(/auto-downscaled/)).toBeInTheDocument();
    expect(screen.getByText("30 fps")).toBeInTheDocument();
    expect(screen.getByText("~820 kbps · 2-pass H264")).toBeInTheDocument();

    // Output format preview switches to .mp4 automatically
    expect(screen.getByText(/gameplay_converted\.mp4/)).toBeInTheDocument();
  });

  it("displays alreadyUnder notice and copyAsIs button when already_under_target is true, invoking compress_video_to_size with copy_if_under: true", async () => {
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "get_settings") {
        return Promise.resolve({
          language: "en",
          theme: "dark",
          output_dir: null,
          default_video_format: "mp4",
          default_audio_format: "mp3",
          default_image_format: "webp",
        });
      }
      if (command === "get_media_info") {
        return Promise.resolve({
          duration: 15,
          width: 1280,
          height: 720,
          file_size: 4 * 1024 * 1024,
        });
      }
      if (command === "estimate_target_size") {
        return Promise.resolve({
          already_under_target: true,
          source_size_bytes: 4 * 1024 * 1024,
          target_bytes: 10 * 1024 * 1024,
          budget_bytes: 9_800_000,
          video_kbps: 2000,
          audio_kbps: 128,
          target_width: 1280,
          target_height: 720,
          target_fps: 30,
          downscaled: false,
          fps_reduced: false,
        });
      }
      if (command === "compress_video_to_size") {
        return Promise.resolve("C:/videos/short_converted.mp4");
      }
      return Promise.resolve();
    });

    render(
      <SettingsProvider>
        <VideoConverter />
      </SettingsProvider>
    );

    await dropVideoFile("C:/videos/short.mp4");
    fireEvent.click(await screen.findByRole("button", { name: "Discord (10 MB)" }));

    expect(
      await screen.findByText(/already under the 10 MB target — no re-encoding needed/i)
    ).toBeInTheDocument();

    const copyBtn = screen.getByRole("button", { name: "Copy as-is (no re-encode)" });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("compress_video_to_size", {
        input_path: "C:/videos/short.mp4",
        output_path: "C:/videos/short_converted.mp4",
        target_mb: 10,
        codec: "h264",
        copy_if_under: true,
      });
    });
  });

  it("renders passProgress badge in ProgressBar for Pass 1/2 and Pass 2/2", () => {
    const { rerender } = render(
      <ProgressBar progress={35} speed="1.8x" pass={1} totalPasses={2} />
    );

    expect(screen.getByText("Pass 1/2")).toBeInTheDocument();
    expect(screen.getByText("1.8x")).toBeInTheDocument();
    expect(screen.getByText("35%")).toBeInTheDocument();

    rerender(<ProgressBar progress={78} speed="2.1x" pass={2} totalPasses={2} />);
    expect(screen.getByText("Pass 2/2")).toBeInTheDocument();
    expect(screen.getByText("78%")).toBeInTheDocument();

    // Hidden when totalPasses is 1 or null
    rerender(<ProgressBar progress={50} pass={1} totalPasses={1} />);
    expect(screen.queryByText(/Pass /)).toBeNull();
  });

  it("displays the Windows Explorer context menu toggle on windows and hides it on macos/linux", async () => {
    // Windows -> visible
    const { unmount } = render(
      <SettingsProvider>
        <SettingsPage />
      </SettingsProvider>
    );

    expect(
      await screen.findByText("Integrate into Windows Explorer right-click menu")
    ).toBeInTheDocument();
    const toggle = screen.getByRole("switch", {
      name: "Integrate into Windows Explorer right-click menu",
    });
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(toggle);
    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("set_context_menu_enabled", {
        enabled: true,
        language: "en",
      });
    });

    // Changing language while context menu is enabled updates registry menu labels
    fireEvent.click(screen.getByRole("button", { name: "English" }));
    fireEvent.click(await screen.findByRole("button", { name: "Français" }));
    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("set_context_menu_enabled", {
        enabled: true,
        language: "fr",
      });
    });
    unmount();

    // Reset language back to en before non-Windows checks
    await i18n.changeLanguage("en");
    mocks.invoke.mockClear();

    // macOS -> hidden
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "get_platform") return Promise.resolve("macos");
      if (command === "get_settings") {
        return Promise.resolve({
          language: "en",
          theme: "dark",
          output_dir: null,
          default_video_format: "mp4",
          default_audio_format: "mp3",
          default_image_format: "webp",
        });
      }
      return Promise.resolve();
    });

    const macView = render(
      <SettingsProvider>
        <SettingsPage />
      </SettingsProvider>
    );
    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("get_platform");
    });
    expect(
      screen.queryByText("Integrate into Windows Explorer right-click menu")
    ).toBeNull();
    macView.unmount();

    mocks.invoke.mockClear();

    // Linux -> hidden
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "get_platform") return Promise.resolve("linux");
      if (command === "get_settings") {
        return Promise.resolve({
          language: "en",
          theme: "dark",
          output_dir: null,
          default_video_format: "mp4",
          default_audio_format: "mp3",
          default_image_format: "webp",
        });
      }
      return Promise.resolve();
    });

    render(
      <SettingsProvider>
        <SettingsPage />
      </SettingsProvider>
    );
    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("get_platform");
    });
    expect(
      screen.queryByText("Integrate into Windows Explorer right-click menu")
    ).toBeNull();
  });

  it("merges missing preset and context menu defaults in useSettings", async () => {
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "get_settings") {
        return Promise.resolve({
          language: "fr",
          theme: "light",
          output_dir: null,
          default_video_format: "mp4",
          default_audio_format: "mp3",
          default_image_format: "webp",
        });
      }
      return Promise.resolve();
    });

    const { result } = renderHook(() => useSettings());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.settings.preset_discord_mb).toBe(10);
    expect(result.current.settings.preset_whatsapp_mb).toBe(16);
    expect(result.current.settings.preset_gmail_mb).toBe(25);
    expect(result.current.settings.context_menu_enabled).toBe(false);
  });

  it("tracks pass and totalPasses in useConversion during batch 2-pass target-size compression", async () => {
    let resolveBatch!: (val: unknown) => void;
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "compress_video_batch_to_size") {
        return new Promise((res) => {
          resolveBatch = res;
        });
      }
      return Promise.resolve();
    });

    const { result } = renderHook(() => useConversion());
    await waitFor(() => expect(mocks.listeners.get("conversion_progress")?.size ?? 0).toBeGreaterThan(0));

    act(() => {
      result.current
        .compressVideoBatchToSize({
          files: [
            { input_path: "C:/a.mp4", output_path: "C:/a_out.mp4" },
            { input_path: "C:/b.mp4", output_path: "C:/b_out.mp4" },
          ],
          target_mb: 10,
          codec: "h264",
          copy_if_under: true,
        })
        .catch(() => {});
    });

    emitEvent("batch_progress", { index: 0, total: 2, current_file: "a.mp4", percentage: 25 });
    emitEvent("conversion_progress", {
      percentage: 40,
      current_time: "00:00:10",
      speed: "1.5x",
      pass: 2,
      total_passes: 2,
    });

    expect(result.current.progress).toBe(25);
    expect(result.current.pass).toBe(2);
    expect(result.current.totalPasses).toBe(2);
    expect(result.current.speed).toBe("1.5x");

    await act(async () => {
      resolveBatch([
        { input: "C:/a.mp4", output: "C:/a_out.mp4", success: true },
        { input: "C:/b.mp4", output: "C:/b_out.mp4", success: true },
      ]);
    });

    expect(result.current.status).toBe("done");
  });

  it("renders CLI mini-mode in App when get_cli_state returns is_cli_mode: true", async () => {
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "get_settings") {
        return Promise.resolve({
          language: "en",
          theme: "dark",
          output_dir: null,
          default_video_format: "mp4",
          default_audio_format: "mp3",
          default_image_format: "webp",
        });
      }
      if (command === "get_cli_state") {
        return Promise.resolve({
          is_cli_mode: true,
          action_label: "Compress for Discord (10 MB)",
          open_files: ["C:/videos/clip.mp4"],
          open_section: "video",
        });
      }
      return Promise.resolve();
    });

    render(<App />);

    expect(await screen.findByText("Compress for Discord (10 MB)")).toBeInTheDocument();

    emitEvent("cli-job-status", {
      status: "running",
      current_file: "clip.mp4",
      index: 0,
      total: 1,
      percentage: 55,
      pass: 1,
      total_passes: 2,
    });

    expect(await screen.findByText("Pass 1/2")).toBeInTheDocument();
    expect(screen.getByText("55%")).toBeInTheDocument();

    emitEvent("cli-job-status", {
      status: "done",
      current_file: "clip.mp4",
      index: 0,
      total: 1,
      percentage: 100,
      output_path: "C:/videos/clip_discord.mp4",
    });

    const openFolderBtn = await screen.findByRole("button", { name: "Open folder" });
    fireEvent.click(openFolderBtn);
    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("open_folder", {
        file_path: "C:/videos/clip_discord.mp4",
      });
    });

    const closeBtn = screen
      .getAllByRole("button", { name: "Close" })
      .find((btn) => btn.textContent?.trim() === "Close");
    expect(closeBtn).toBeDefined();
    fireEvent.click(closeBtn!);
    expect(mocks.close).toHaveBeenCalledTimes(1);
  });

  it("disables the Convert button and displays targetSize.tooSmall when estimate_target_size rejects with target_too_small", async () => {
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "get_settings") {
        return Promise.resolve({
          language: "en",
          theme: "dark",
          output_dir: null,
          default_video_format: "mp4",
          default_audio_format: "mp3",
          default_image_format: "webp",
        });
      }
      if (command === "get_media_info") {
        return Promise.resolve({
          duration: 3600,
          width: 1920,
          height: 1080,
          video_codec: "h264",
          file_size: 800 * 1024 * 1024,
          fps: 60,
        });
      }
      if (command === "estimate_target_size") {
        return Promise.reject("target_too_small");
      }
      return Promise.resolve();
    });

    render(
      <SettingsProvider>
        <VideoConverter />
      </SettingsProvider>
    );

    await dropVideoFile("C:/videos/long_movie.mp4");
    fireEvent.click(await screen.findByRole("button", { name: "Discord (10 MB)" }));

    expect(await screen.findByText(en.targetSize.tooSmall)).toBeInTheDocument();

    const convertBtn = screen.getByRole("button", { name: en.converter.convert });
    expect(convertBtn).toBeDisabled();

    fireEvent.click(convertBtn);
    expect(mocks.invoke).not.toHaveBeenCalledWith(
      "compress_video_to_size",
      expect.anything()
    );
  });

  it("propagates open_files from get_cli_state (is_cli_mode: false) and cli-open-files events into VideoConverter", async () => {
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "get_settings") {
        return Promise.resolve({
          language: "en",
          theme: "dark",
          output_dir: null,
          default_video_format: "mp4",
          default_audio_format: "mp3",
          default_image_format: "webp",
        });
      }
      if (command === "get_cli_state") {
        return Promise.resolve({
          is_cli_mode: false,
          open_files: ["C:/videos/context_single.mp4"],
          open_section: "video",
        });
      }
      if (command === "get_media_info") {
        return Promise.resolve({
          duration: 45,
          width: 1920,
          height: 1080,
          video_codec: "h264",
          file_size: 20 * 1024 * 1024,
          fps: 30,
        });
      }
      return Promise.resolve();
    });

    render(<App />);

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("get_media_info", {
        input_path: "C:/videos/context_single.mp4",
      });
    });
    expect(await screen.findByText("context_single.mp4")).toBeInTheDocument();

    emitEvent("cli-open-files", {
      files: ["C:/videos/batch_one.mp4", "C:/videos/batch_two.mkv"],
      section: "video",
    });

    expect(await screen.findByText("batch_one.mp4")).toBeInTheDocument();
    expect(screen.getByText("batch_two.mkv")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `${en.converter.convert} (2)` })
    ).toBeInTheDocument();
  });

  it("hydrates cliJobStatus immediately when get_cli_state returns latest_job_status in CLI mode", async () => {
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "get_settings") {
        return Promise.resolve({
          language: "en",
          theme: "dark",
          output_dir: null,
          default_video_format: "mp4",
          default_audio_format: "mp3",
          default_image_format: "webp",
        });
      }
      if (command === "get_cli_state") {
        return Promise.resolve({
          is_cli_mode: true,
          action_label: "Compress for Discord (10 MB)",
          open_files: ["C:/videos/instant.mp4"],
          open_section: "video",
          latest_job_status: {
            status: "done",
            current_file: "instant.mp4",
            index: 0,
            total: 1,
            percentage: 100,
            output_path: "C:/videos/instant_discord.mp4",
          },
        });
      }
      return Promise.resolve();
    });

    render(<App />);

    expect(await screen.findByText("instant_discord.mp4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open folder" })).toBeInTheDocument();
  });

  it("provides all required new i18n keys in fr, en, es, de, and pt locales", () => {
    const locales = [fr, en, es, de, pt];
    for (const loc of locales) {
      expect(loc.converter.passProgress).toBeTruthy();
      expect(loc.targetSize.label).toBeTruthy();
      expect(loc.targetSize.off).toBeTruthy();
      expect(loc.targetSize.custom).toBeTruthy();
      expect(loc.targetSize.estimatedResolution).toBeTruthy();
      expect(loc.targetSize.downscaled).toBeTruthy();
      expect(loc.targetSize.alreadyUnder).toBeTruthy();
      expect(loc.targetSize.copyAsIs).toBeTruthy();
      expect(loc.targetSize.tooSmall).toBeTruthy();
      expect(loc.settings.targetSizePresets).toBeTruthy();
      expect(loc.settings.contextMenu).toBeTruthy();
      expect(loc.settings.contextMenuHint).toBeTruthy();
      expect(loc.settings.thirdPartyLicenses).toBeTruthy();
      expect(loc.settings.thirdPartyLicensesClose).toBeTruthy();
    }
  });

  it("displays and closes the third-party FFmpeg license notice panel in SettingsPage", async () => {
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "get_settings") {
        return Promise.resolve({
          language: "en",
          theme: "dark",
          output_dir: null,
          default_video_format: "mp4",
          default_audio_format: "mp3",
          default_image_format: "webp",
        });
      }
      if (command === "get_platform") return Promise.resolve("linux");
      if (command === "get_third_party_notices") return Promise.reject(new Error("unavailable"));
      return Promise.resolve();
    });

    const { container, unmount } = render(
      <SettingsProvider>
        <SettingsPage />
      </SettingsProvider>
    );

    const openBtn = await screen.findByTestId("third-party-licenses-btn");
    expect(openBtn).toHaveClass("btn-ghost");
    expect(openBtn).toHaveTextContent(en.settings.thirdPartyLicenses);
    expect(screen.queryByTestId("third-party-licenses-panel")).toBeNull();

    fireEvent.click(openBtn);

    await waitFor(() => {
      expect(mocks.invoke).toHaveBeenCalledWith("get_third_party_notices");
    });

    const panel = await screen.findByTestId("third-party-licenses-panel");
    expect(panel).toHaveClass("glass-panel");
    expect(panel).toHaveTextContent(/FFmpeg & FFprobe/i);
    expect(panel).toHaveTextContent(/GPLv3/);
    expect(panel).toHaveTextContent(/gyan\.dev/);
    expect(panel).toHaveTextContent(/eugeneware\/ffmpeg-static/);
    expect(panel).toHaveTextContent(/johnvansickle\.com/);
    expect(panel).toHaveTextContent(/https:\/\/ffmpeg\.org/);
    expect(panel).toHaveTextContent(/https:\/\/github\.com\/FFmpeg\/FFmpeg/);

    const scrollablePre = container.querySelector("pre");
    expect(scrollablePre).not.toBeNull();
    expect(scrollablePre?.style.maxHeight).toBe("260px");
    expect(scrollablePre?.style.overflowY).toBe("auto");

    const closeBtn = screen.getByRole("button", {
      name: en.settings.thirdPartyLicensesClose,
    });
    fireEvent.click(closeBtn);
    expect(screen.queryByTestId("third-party-licenses-panel")).toBeNull();
    unmount();

    // When backend returns third-party notices, the fetched text is displayed
    mocks.invoke.mockImplementation((command: string) => {
      if (command === "get_settings") {
        return Promise.resolve({
          language: "en",
          theme: "dark",
          output_dir: null,
          default_video_format: "mp4",
          default_audio_format: "mp3",
          default_image_format: "webp",
        });
      }
      if (command === "get_platform") return Promise.resolve("linux");
      if (command === "get_third_party_notices") {
        return Promise.resolve("FFmpeg Custom Backend Notice — GPLv3 https://ffmpeg.org");
      }
      return Promise.resolve();
    });

    render(
      <SettingsProvider>
        <SettingsPage />
      </SettingsProvider>
    );

    fireEvent.click(await screen.findByTestId("third-party-licenses-btn"));
    expect(
      await screen.findByText(/FFmpeg Custom Backend Notice — GPLv3/)
    ).toBeInTheDocument();
  });
});
