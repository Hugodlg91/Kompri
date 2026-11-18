# Changelog

## [1.2.1] - 2026-11-18

### Fixed & Improved
- **Static macOS FFmpeg Sidecar & Release Verification**: Replaced Homebrew `ffmpeg` in `.github/workflows/release.yml` with pinned static `aarch64-apple-darwin` binaries (`eugeneware/ffmpeg-static` `b6.1.1`) verified by SHA-256 checksums and `otool -L` linkage checks (blocking `/opt/homebrew` and `/usr/local`), added a tag-vs-`tauri.conf.json` version consistency guard, added a multi-OS smoke test verifying all 10 required video/audio encoders (`libx264`, `libx265`, `libvpx-vp9`, `mpeg4`, `aac`, `libmp3lame`, `flac`, `libvorbis`, `libopus`, `pcm_s16le`) plus a real `testsrc2` + `ffprobe` encode, and updated `src-tauri/binaries/README.md`.
- **FFmpeg Third-Party Licensing & Notices**: Added [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and [`licenses/FFmpeg-GPLv3.txt`](licenses/FFmpeg-GPLv3.txt) documenting GPLv3 compliance, build providers, versions, and upstream source URLs for Windows, macOS, and Linux FFmpeg/FFprobe binaries, bundled notices into Tauri resources, and added an in-app Third-Party Licenses view in Settings across all 5 languages.
- **Metadata Rename & Context Menu Migration**: Renamed package/crate identifiers from `tauri-app` to `mediaforge` / `mediaforge_lib` with `mainBinaryName: "MediaForge"` (preserving `com.mediaforge.app`), and added automatic startup migration for existing `HKCU` Windows Explorer context menu commands so `1.2.0` installations update seamlessly to the `1.2.1` executable path.
- **Frontend Capability & Security Hardening**: Removed unused frontend shell execution permissions (`@tauri-apps/plugin-shell` and `shell:allow-*` capabilities), enforced a strict Content Security Policy (CSP) in `tauri.conf.json`, and added regression tests for leading-dash filenames (`-y.mp4`) across CLI, context menu, and FFmpeg argument construction.
- **Line Ending Normalization**: Added `.gitattributes` enforcing LF line endings for all source, config, and documentation files alongside binary exceptions, and normalized tracked files.
- **Dedicated CI Workflow**: Added `.github/workflows/ci.yml` running `tsc --noEmit`, `vitest run`, `cargo test`, and `cargo clippy -- -D warnings` on `windows-latest` and `ubuntu-22.04` for pushes (`main`, `feat/**`, `fix/**`) and pull requests using lightweight FFmpeg sidecar placeholders.
- **README Demo & Documentation Polish**: Integrated the automated Playwright + Vite demo recorder (`scripts/record-demo/`, `npm run record-demo`) and generated [`docs/assets/mediaforge-demo.gif`](docs/assets/mediaforge-demo.gif) and `.mp4`, organized planning docs under `docs/`, added [`docs/SCREENSHOTS_CHECKLIST.md`](docs/SCREENSHOTS_CHECKLIST.md), bumped version references to `1.2.1`, and updated `README.md` and `CHANGELOG.md`.

---

## [1.2.0] - 2026-11-17

### Added
- **1-Click "Target Size" Video Compression**:
  - Dedicated **Target Size** mode in the Video Converter with built-in platform presets (**Discord 10 MB**, **WhatsApp 16 MB**, **Gmail 25 MB**) and a **Custom MB** input (configurable defaults in Settings).
  - Exact two-pass FFmpeg encoding (**H.264** `libx264` and **H.265** `libx265`) with a **95% container safety budget** (`1 MB = 1,000,000 bytes`) to guarantee output files never exceed strict upload limits.
  - Smart **automatic resolution & FPS downscaling** (orientation-aware short-side scaling for both landscape and portrait 9:16 videos, even-dimension rounding, and 60fps → 30fps cap on constrained bitrates) with live pre-conversion quality/resolution estimate badge.
  - Automatic **-10% video bitrate retry** if the 2-pass output ever exceeds the target byte limit, plus atomic copy/remux (`-c copy -movflags +faststart`) when the source video is already under the target size.
  - Two-pass real-time progress reporting (`Pass 1/2 — Analysis` → `Pass 2/2 — Encoding`) in single, batch, and CLI modes.
- **Windows Explorer Right-Click Context Menu & CLI Mode**:
  - Native cascading **"MediaForge"** context menu registered per-user under `HKCU\Software\Classes\SystemFileAssociations` (no Administrator privileges or UAC prompt required) for video (`.mp4`, `.mov`, `.mkv`, `.avi`, `.webm`), image (`.png`, `.jpg`, `.jpeg`, `.webp`, `.bmp`, `.tiff`), and audio (`.mp3`, `.wav`, `.flac`, `.ogg`, `.aac`, `.m4a`) files.
  - Sub-actions: *Compress for Discord (10 MB)*, *Compress for WhatsApp (16 MB)*, *Compress for Gmail (25 MB)*, *Convert to MP4 / MP3 / JPG / PNG / WEBP*, and *Open in MediaForge…*.
  - **Single-instance multi-file forwarding** (`tauri-plugin-single-instance`) with serialized async queue (`tokio::sync::Mutex`) so multi-file selections in Windows Explorer process all selected files sequentially without race conditions.
  - **Compact CLI mini-window (`420×220`) & headless `--wait` mode** (`--action compress|convert|open`) that auto-closes after conversion completion.
  - One-click **Context Menu toggle** in Settings (synchronized with the active UI language) and automatic registry cleanup on uninstall via `src-tauri/nsis/hooks.nsh`.

### Fixed
- Hardened FFmpeg/FFprobe path handling (`safe_media_path` prefixing `./` for leading-dash filenames, `-nostdin`, explicit `-map 0:v:0 -sn -pix_fmt yuv420p`) and ignored `attached_pic` cover art streams during video probing.
- Added `--` end-of-options separator before file paths in Windows Explorer registry commands and rejected `%`, `\r`, `\n` characters in executable path validation.

---

## [1.1.0] - 2026-11-17

### Added
- **Liquid Glass UI Design System**: Refractive translucent surfaces (`backdrop-filter: blur(24px) saturate(180%)`), specular edge highlights, and animated ambient aurora background in both Dark (*Liquid Obsidian*) and Light (*Iridescent Pearl*) themes
- **Frameless Window & Interactive Controls**: Native OS titlebar replaced (`decorations: false`) with custom Liquid Glass `TitleBar` featuring functional Close, Minimize, and Maximize/Restore buttons + double-click to maximize
- **Full Responsive Architecture**: Adaptive layout down to `400×480` with automatic transformation of the `Sidebar` into a **Liquid Glass Bottom Navigation Dock** on compact windows (`≤ 640px`) and fluid centered containers on wide screens
- **Enhanced Conversion History**: Instant search bar (by file name or format), media type filter tabs (*All / Image / Video / Audio*) with item counts, single-item deletion (`remove_history_item`), and automatic output file size calculation
- **Converter UX Improvements**: Direct "Open File" button on conversion results, output filename preview badge before converting, batch toolbar with file count and one-click "Clear" button, and global keyboard shortcuts (`Ctrl+1` to `Ctrl+5`)

### Fixed
- Fixed `open_folder` IPC parameter casing (`file_path` in snake_case) across single and batch converters
- Rendered `PillSelect` dropdowns via React Portal (`document.body`) with high-contrast `--popover-bg` to prevent clipping or stacking under sibling `backdrop-filter` cards

---

## [1.0.0] - 2026-03-26

### Added
- Image conversion (PNG, JPG, WEBP, BMP, TIFF) with resize and quality options
- Video conversion (MP4, MKV, AVI, MOV, WEBM) with resolution, codec, bitrate
- Audio conversion (MP3, FLAC, WAV, OGG, AAC, M4A) with bitrate, sample rate, normalize
- Batch mode for all media types (image, video, audio)
- Native drag & drop support
- Conversion history (last 50 conversions, persistent)
- Light / dark theme with instant switching
- 5 languages (FR, EN, ES, DE, PT) with system auto-detection
- Persistent settings (theme, language, output folder, default formats)
- 100% offline — no telemetry, no account required, no network calls
- FFmpeg bundled — no external runtime required
