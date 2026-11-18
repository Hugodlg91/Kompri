# Kompri — Screenshots & Demo Capture Checklist

Use this checklist to capture consistent, high-DPI visual assets for the repository `README.md`, GitHub Releases, and store listings.

Store all captured assets under `docs/assets/` (relative paths below assume the repository root).

---

## Capture Guidelines

- **Window size**: Default `1000×680` (consistent aspect ratio across screenshots).
- **Theme & Locale**: Use English (`en`) UI with clean, neutral sample filenames (e.g., `vacation_clip.mp4`, `product_photo.png`) — avoid personal folder paths or private filenames.
- **Image format**: PNG (`@2x` / HiDPI if available, compressed losslessly).
- **GIF format**: `15–20 fps`, max width `960 px`, target size `< 5 MB` so GitHub renders it inline smoothly.

---

## Checklist

- [x] **1. Short Workflow Demo GIF** — `docs/assets/kompri-demo.gif` & `docs/assets/kompri-demo.mp4`
  - **Duration**: `~12` seconds (automated via `npm run record-demo` in `scripts/record-demo/`).
  - **Flow**: Switch to Video tab → drag & drop `ranked-clutch.mp4` (153.5 MB, 160,997,966 B bench clip) → select **Discord 20 MB** preset → click Convert (`Pass 1/2` & `Pass 2/2`) → view `18.3 MB` result in History.

- [ ] **2. Simple Conversion** — `docs/assets/simple-conversion.png`
  - **What to show**: Drag & drop zone populated with a file, format selector pills (`MP4` / `PNG` / `MP3`), and the completed **ConversionResult** card (`Open File` + `Open Folder` + `New Conversion`).

- [ ] **3. 1-Click Target Size Mode** — `docs/assets/target-size-mode.png`
  - **What to show**: Video Converter switched to **Target Size** mode with the **Discord (20 MB)** preset active, the live estimated output resolution/FPS badge visible, and active 2-pass progress (`Pass 1/2 — Analysis` or `Pass 2/2 — Encoding`).

- [ ] **4. Windows Explorer Right-Click Context Menu** — `docs/assets/context-menu-windows.png`
  - **What to show**: Windows Explorer classic context menu (`Shift + F10` / *Show more options* on Windows 11) on a `.mp4` file displaying the expanded cascading **Kompri** submenu (*Compress for Discord (20 MB)*, *Compress for WhatsApp (16 MB)*, *Compress for Gmail (25 MB)*, *Convert to MP4 / MP3*, *Open in Kompri…*).

- [ ] **5. Dark vs Light Themes** — `docs/assets/themes-dark-light.png`
  - **What to show**: Side-by-side comparison (or paired screenshots) of **Dark (*Liquid Obsidian*)** and **Light (*Iridescent Pearl*)** themes showcasing the Liquid Glass translucent cards, specular highlights, and ambient aurora backdrop.

---

## Post-Capture Verification

- [ ] Confirm all assets exist in `docs/assets/` with exact filenames matching the checklist.
- [ ] Replace the placeholder block in [`README.md`](../README.md#demo--screenshots) with the rendered `docs/assets/demo.gif` and screenshot gallery.
- [ ] Verify image/GIF rendering on GitHub in light and dark mode.
