# record-demo

Regenerates the README demo (`docs/assets/kompri-demo.gif` and `.mp4`) from the real Kompri UI.

```bash
npx playwright install chromium   # once (or set CHROME_PATH to an installed Chrome/Edge)
npm run record-demo               # needs ffmpeg on PATH
npm run social-preview            # docs/assets/social-preview.png (1280x640)
```

## How it works

- `index.html` + `demo-main.ts` boot the real React app (`src/main.tsx`) in a browser, with the Tauri backend replaced by `mockIPC` from `@tauri-apps/api/mocks`.
- `record.mjs` starts Vite, drives the scenario with Playwright (Video tab, drag & drop, Discord 10 MB preset, Convert, History) and converts the recording to GIF and MP4 with ffmpeg.
- `social-preview.mjs` screenshots the same harness (Video tab, source clip loaded, Discord preset selected) and composes the 1280×640 GitHub social preview card around it, so the numbers on the card are the documented ones.
- `cursor.js` draws a visible cursor, click ripples and the dragged-file ghost (headless recordings have no cursor) and pauses the ambient background animation to keep the GIF small.

## Honesty rules for the demo

The numbers shown must come from a real run, not be invented:

- Source: 60 s 1080p60 H.264 + AAC clip of 122,773,228 bytes.
- Plan: output of `target_size::compute_target_size_plan` for 10 / 16 / 25 MB on that source.
- Result: real 2-pass encode with the arguments from `target_size::build_two_pass_ffmpeg_args` → 9,557,754 bytes (under 10 MB).

If the target-size algorithm changes, rerun it on a real clip and update the constants at the top of `demo-main.ts` before re-recording. The encode is shown accelerated, and the three older history rows are sample data.
