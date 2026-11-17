# Changelog

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
