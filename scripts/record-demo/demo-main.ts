// Demo harness: runs the real Kompri UI with a simulated Tauri backend.
// Numbers come from a real run of Kompri's own target-size planner and
// 2-pass FFmpeg arguments (src-tauri/examples/target_size_bench.rs) on the
// reproducible 60 s 1080p60 bench clip (scripts/quality-bench/make-clips.ps1):
// 160,997,966 B -> 19,202,630 B with the Discord 20 MB preset.
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";

const DIR = "C:\\Users\\you\\Videos\\";
const SRC = DIR + "ranked-clutch.mp4";
const OUT = DIR + "ranked-clutch_discord.mp4";
const SRC_SIZE = 160_997_966;
const OUT_SIZE = 19_202_630;

function fmt(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const plans: Record<number, object> = {
  16: { already_under_target: false, source_size_bytes: SRC_SIZE, target_bytes: 16000000, budget_bytes: 15200000, video_kbps: 1930, audio_kbps: 96, target_width: 1920, target_height: 1080, target_fps: 60, downscaled: false, fps_reduced: false },
  20: { already_under_target: false, source_size_bytes: SRC_SIZE, target_bytes: 20000000, budget_bytes: 19000000, video_kbps: 2437, audio_kbps: 96, target_width: 1920, target_height: 1080, target_fps: 60, downscaled: false, fps_reduced: false },
  25: { already_under_target: false, source_size_bytes: SRC_SIZE, target_bytes: 25000000, budget_bytes: 23750000, video_kbps: 3070, audio_kbps: 96, target_width: 1920, target_height: 1080, target_fps: 60, downscaled: false, fps_reduced: false },
};

const now = Date.now();
const history: any[] = [
  { id: "h3", file_name: "holiday-photo.png", media_type: "image", source_format: "png", target_format: "webp", output_path: DIR + "holiday-photo.webp", timestamp: now - 3600_000 * 5, status: "success", file_size: "412.6 KB" },
  { id: "h2", file_name: "podcast-ep12.wav", media_type: "audio", source_format: "wav", target_format: "mp3", output_path: DIR + "podcast-ep12.mp3", timestamp: now - 3600_000 * 26, status: "success", file_size: "38.4 MB" },
  { id: "h1", file_name: "screen-recording.mov", media_type: "video", source_format: "mov", target_format: "mp4", output_path: DIR + "screen-recording.mp4", timestamp: now - 3600_000 * 50, status: "success", file_size: "64.2 MB" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let cancelled = false;
let lastOut = OUT;

async function simulatePasses() {
  // Real run: the whole 2-pass encode took ~22 s on the dev machine; the demo shows it accelerated.
  const durations = [2600, 3400];
  for (let pass = 1; pass <= 2; pass++) {
    const steps = 26;
    for (let i = 0; i <= steps; i++) {
      if (cancelled) throw "cancelled";
      const pct = Math.round((i / steps) * 100);
      const secs = Math.round((i / steps) * 60);
      await emit("conversion_progress", {
        percentage: pct,
        current_time: `00:00:${String(Math.min(secs, 59)).padStart(2, "0")}`,
        speed: pass === 1 ? "2.0x" : "1.4x",
        pass,
        total_passes: 2,
      });
      await sleep(durations[pass - 1] / steps);
    }
  }
}

mockWindows("main");
mockIPC(
  async (cmd, args: any) => {
    switch (cmd) {
      case "get_settings":
        return { language: "en", theme: "dark", output_dir: null, default_video_format: "mp4", default_audio_format: "mp3", default_image_format: "webp", preset_discord_mb: 20, preset_whatsapp_mb: 16, preset_gmail_mb: 25, context_menu_enabled: true, target_size_max_quality: false };
      case "save_settings":
      case "add_history_item":
        if (cmd === "add_history_item" && args?.item) {
          history.unshift({ ...args.item, file_size: args.item.output_path === lastOut ? fmt(OUT_SIZE) : args.item.file_size });
        }
        return null;
      case "get_history":
        return history.slice();
      case "clear_history":
        history.length = 0;
        return null;
      case "remove_history_item":
        return null;
      case "get_cli_state":
        return null;
      case "get_platform":
        return "windows";
      case "get_context_menu_status":
      case "set_context_menu_enabled":
        return true;
      case "plugin:app|version":
        return "1.2.0";
      case "plugin:dialog|open":
        return SRC;
      case "get_media_info":
        return { duration: 60.0, width: 1920, height: 1080, video_codec: "h264", audio_codec: "aac", file_size: SRC_SIZE, bitrate: "21466 kbps", fps: 60, audio_bitrate_kbps: 192, has_audio: true };
      case "estimate_target_size":
        return plans[Math.round(args.target_mb)] ?? plans[20];
      case "compress_video_to_size":
        cancelled = false;
        lastOut = args?.output_path ?? OUT;
        await simulatePasses();
        return lastOut;
      case "cancel_conversion":
        cancelled = true;
        return null;
      case "get_file_size":
        return OUT_SIZE;
      case "plugin:window|is_maximized":
        return false;
      default:
        if (cmd.startsWith("plugin:window|")) return null;
        console.log("[demo] unhandled", cmd, args);
        return null;
    }
  },
  { shouldMockEvents: true },
);

// Hooks for the recorder: simulate a native file drag & drop.
(window as any).__demo = {
  async dragOver(x: number, y: number) {
    await emit("tauri://drag-enter", { paths: [SRC], position: { x, y } });
    await emit("tauri://drag-over", { position: { x, y } });
  },
  async drop(x: number, y: number) {
    await emit("tauri://drag-drop", { paths: [SRC], position: { x, y } });
  },
};

await import("../../src/main.tsx");
