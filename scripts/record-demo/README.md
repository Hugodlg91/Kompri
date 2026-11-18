# record-demo

Regenerates the README demo (`docs/assets/kompri-demo.gif` and `.mp4`) from the real Kompri UI.

```bash
npx playwright install chromium   # once (or set CHROME_PATH to an installed Chrome/Edge)
npm run record-demo               # needs ffmpeg on PATH
npm run social-preview            # docs/assets/social-preview.png (1280x640)
```

## How it works

- `index.html` + `demo-main.ts` boot the real React app (`src/main.tsx`) in a browser, with the Tauri backend replaced by `mockIPC` from `@tauri-apps/api/mocks`.
- `record.mjs` starts Vite, drives the scenario with Playwright (Video tab, drag & drop, Discord 20 MB preset, Convert, History) and converts the recording to GIF and MP4 with ffmpeg.
- `social-preview.mjs` screenshots the same harness (Video tab, source clip loaded, Discord preset selected) and composes the 1280×640 GitHub social preview card around it, so the numbers on the card are the documented ones.
- `cursor.js` draws a visible cursor, click ripples and the dragged-file ghost (headless recordings have no cursor) and pauses the ambient background animation to keep the GIF small.

## Honesty rules for the demo

The numbers shown must come from a real run, not be invented:

- Source: the bench's reproducible 60 s 1920x1080 60 fps H.264 + AAC clip, 160,997,966 bytes (generate it with `scripts/quality-bench/make-clips.ps1`). The UI shows it as `ranked-clutch.mp4`, which is only a cosmetic file name.
- Plan: output of `target_size::compute_target_size_plan` for 10 / 16 / 20 / 25 MB on that source (20 MB: 2437 kbps video, 1920x1080, 60 fps).
- Result: real 2-pass encode with the arguments from `target_size::build_two_pass_ffmpeg_args` → 19,202,630 bytes (18.3 MB in the UI, under 20 MB; ~22 s total encode on the dev machine, via `src-tauri/examples/target_size_bench.rs`).

If the target-size algorithm changes, rerun it on a real clip and update the constants at the top of `demo-main.ts` before re-recording. The encode is shown accelerated, and the three older history rows are sample data.
