# Target-size quality bench (standard vs Max quality)

Checks, with objective metrics, that the **Max quality** option of the target-size
mode (`-preset slow` + light `hqdn3d` denoise before scaling; **no sharpening**, see
"Why there is no unsharp" below) does not score below the standard mode on the same size
budget. That is the goal, with one documented exception: on the 10 s clip SSIM is 0.00012
lower (about 2x the run-to-run noise), while VMAF is equal and PSNR is higher. The measured
gain comes mainly from `-preset slow`; the light `hqdn3d` denoise is neutral on these
synthetic clips (no measurable gain or loss within noise).

Everything uses the app's own code: `src-tauri/examples/target_size_bench.rs` links
`kompri_lib::target_size` and calls

- `compute_target_size_plan` with the probe values `compress_single_video_impl` uses
  (ffprobe `-show_streams -show_format`, same `parse_ffprobe_json` rules: format duration
  else longest stream, first non-cover video stream, `avg_frame_rate` then
  `r_frame_rate`, same fallbacks 1920/1080/30 fps),
- `PassLogDir::new` + `build_two_pass_ffmpeg_args_with_options(..., max_quality)` for pass 1
  and pass 2. The argument vectors are passed to FFmpeg **unchanged** (including
  `-progress pipe:1`; the bench just discards stdout),
- the same size check: if the output is `> target_bytes`, delete it and rerun both
  passes once at `scale_kbps_for_retry(video_kbps)` (-10 %).

It always encodes (the app's `copy_if_under` shortcut is not modelled) and prints one
JSON line: probe, plan, attempts, `final_bytes`, `seconds`, and the exact pass args.

## Requirements

- Windows, Rust toolchain, the bundled FFmpeg 8.0.1 (gyan essentials) in
  `src-tauri/binaries/` (has `libvmaf`, `hqdn3d`, `unsharp`, `perlin`, ...).
- A scratch directory **outside the repo** for the clips/outputs (several hundred MB).

## Reproduce

```powershell
# 1. Build the bench (from src-tauri)
cd src-tauri
cargo build --release --example target_size_bench
cd ..

# 2. Generate the synthetic clips (60 s, 10 s, 180 s; 1080p60, H.264 CRF 17 + AAC)
$B = "$env:TEMP\kompri-bench"
powershell -ExecutionPolicy Bypass -File scripts\quality-bench\make-clips.ps1 -BenchDir $B

# 3. Plans only (no encode), e.g. for the demo constants
powershell -ExecutionPolicy Bypass -File scripts\quality-bench\run-bench.ps1 -BenchDir $B `
    -Clips "$B\synth-60s-1080p60.mp4" -PlanOnlyTargets "10,16,20,25"

# 4. Discord 20 MB, standard vs Max quality, with VMAF/SSIM/PSNR
powershell -ExecutionPolicy Bypass -File scripts\quality-bench\run-bench.ps1 -BenchDir $B `
    -Clips "$B\synth-60s-1080p60.mp4" -Codecs "h264,h265"
powershell -ExecutionPolicy Bypass -File scripts\quality-bench\run-bench.ps1 -BenchDir $B `
    -Clips "$B\synth-10s-1080p60.mp4,$B\synth-180s-1080p60.mp4"
```

List parameters are comma-separated strings (`powershell -File` does not parse arrays).
Each run appends a JSON object to `$B\results\results.jsonl` (plus the per-frame libvmaf
log) and prints a Markdown table. `-Tag` labels a run (e.g. a filter variant),
`-VmafThreads` / `-VmafSubsample` trade accuracy for time.

Single run without the driver:

```powershell
src-tauri\target\release\examples\target_size_bench.exe --input IN.mp4 --output OUT.mp4 `
    --target-mb 20 --codec h264 [--max-quality] `
    --ffmpeg src-tauri\binaries\ffmpeg-x86_64-pc-windows-msvc.exe `
    --ffprobe src-tauri\binaries\ffprobe-x86_64-pc-windows-msvc.exe [--plan-only]
```

## Test clips

`make-clips.ps1` builds every clip from the same seeded lavfi graph, only `-t` changes:

```text
ffmpeg -f lavfi -i "gradients=s=1920x1080:r=60:n=5:speed=0.015:seed=11"
       -f lavfi -i "perlin=s=640x360:r=60:octaves=3:persistence=0.6:xscale=3:yscale=3:tscale=0.5:random_mode=seed:seed=5"
       -f lavfi -i "testsrc2=s=640x360:r=60"
       -f lavfi -i "life=s=480x270:r=60:mold=10:ratio=0.08:life_color=#ffcc33:death_color=#102040:seed=7"
       -f lavfi -i "sierpinski=s=640x360:r=60:type=carpet:seed=9"
       -f lavfi -i "aevalsrc='0.25*sin(2*PI*330*t)+0.04*(random(0)-0.5)|0.25*sin(2*PI*440*t+3*sin(2*PI*0.5*t))+0.04*(random(1)-0.5)':s=48000"
       -filter_complex "
         [0:v]format=yuv420p[g];
         [1:v]scale=1920:1080:flags=bicubic,format=yuv420p[p];
         [g][p]blend=c0_expr='clip(A+(B-128)*2,16,235)':c1_expr='A':c2_expr='A'[bg];
         [2:v]format=yuv420p[ts];
         [3:v]scale=960:540:flags=neighbor,format=yuv420p[l];
         [4:v]format=yuv420p[s];
         [bg][ts]overlay=x='(W-w)/2+(W-w)/2*sin(t*0.7)':y='(H-h)/2+(H-h)/2*cos(t*0.45)'[a];
         [a][l]overlay=x='mod(t*300,W+w)-w':y='H-h-30'[b];
         [b][s]overlay=x='W-w-40-200*sin(t*1.3)':y='40+120*abs(sin(t*0.9))',
           scroll=h=0.0015:v=0.0007,noise=alls=6:allf=t+u:all_seed=42,format=yuv420p[v]"
       -map "[v]" -map 5:a -t <60|10|180>
       -c:v libx264 -preset medium -crf 17 -g 120 -pix_fmt yuv420p
       -c:a aac -b:a 192k -ac 2 -movflags +faststart synth-<N>s-1080p60.mp4
```

Content: animated Perlin texture over moving gradients (large-scale detail), a moving
`testsrc2` card (sharp edges + text), a Game-of-Life strip crossing at 300 px/s, a
bouncing Sierpinski carpet (fine detail), a slow global pan (`scroll`) and temporal
film grain (`noise alls=6 allf=t+u`). Source bitrate is ~21 Mbps (the 60 s clip is
160,997,966 B). `mandelbrot` was rejected: ~40x slower than real time at useful sizes.

At Discord 20 MB the plans are: 10 s and 60 s keep 1920x1080@60 (no scale, no fps
change, so only `hqdn3d` + `-preset slow` differ; they are unaffected by the filter-order
change below); the 180 s clip drops to 1280x720@30, which exercises the downscale and fps
paths.

## Quality measurement

One FFmpeg pass per output with `libvmaf` (model vmaf_v0.6.1, plus the `psnr` and
`float_ssim` features, luma), first input distorted, second reference:

```text
[0:v]setpts=PTS-STARTPTS[,scale=<srcW>:<srcH>:flags=bicubic],format=yuv420p[d];
[1:v][fps=<target_fps>,]setpts=PTS-STARTPTS,format=yuv420p[r];
[d][r]libvmaf=log_fmt=json:log_path=...:n_threads=16:n_subsample=1:feature=name=psnr|name=float_ssim
```

- Downscaled outputs are scaled back up to the source resolution (bicubic).
- When the plan reduced the framerate, the **reference** goes through the same `fps=N`
  filter the encoder used (identical frame selection), so frames stay aligned; the
  distorted is never frame-duplicated up to 60 fps.
- Reported: VMAF mean, VMAF 1 % low (1st percentile of per-frame scores), SSIM mean,
  PSNR-Y mean. Each output is also ffprobed (codec, size, fps, audio present) and must
  be strictly `< target_mb * 1e6` bytes.

## Results (2026-11-18, Discord 20 MB, 24-thread Windows box, runs sequential and unloaded)

Final run (`-Tag v2`), which corresponds to the shipped configuration: `-preset slow` +
`hqdn3d` only, no `unsharp`. The run was made with an `unsharp` amount of 0.0, which is an
exact pass-through (frames are bit-identical to having no `unsharp` filter), so the table
stays valid after the filter was removed from the code. All outputs are
`< 20,000,000 B`, no retry was needed, and ffprobe confirms H.264/HEVC + AAC at the
planned size/fps.

| clip | codec | mode | bytes | VMAF | VMAF 1% low | SSIM | PSNR-Y | encode s | plan / -vf |
|---|---|---|---:|---:|---:|---:|---:|---:|---|
| 10 s 1080p60 | h264 | standard | 18,810,674 | 99.89 | 97.10 | 0.99767 | 42.80 | 5.3 | 15104 kbps, 1080p60, no filter |
| 10 s 1080p60 | h264 | max | 18,812,252 | 99.89 | 97.15 | 0.99755 | 43.08 | 7.6 | `hqdn3d` |
| 60 s 1080p60 | h264 | standard | 19,202,630 | 74.99 | 60.12 | 0.97952 | 28.43 | 22.0 | 2437 kbps, 1080p60, no filter |
| 60 s 1080p60 | h264 | max | 19,133,430 | 76.64 | 62.99 | 0.98031 | 28.92 | 31.4 | `hqdn3d` |
| 60 s 1080p60 | h265 | standard | 18,378,895 | 92.50 | 80.30 | 0.98646 | 34.82 | 67.5 | 2437 kbps, 1080p60, no filter |
| 60 s 1080p60 | h265 | max | 18,023,169 | 96.78 | 88.55 | 0.99050 | 38.50 | 185.2 | `hqdn3d` |
| 180 s 1080p60 | h264 | standard | 19,214,680 | 53.71 | 39.87 | 0.97836 | 23.27 | 24.9 | 748 kbps, 720p30: `scale,fps` (old order) |
| 180 s 1080p60 | h264 | max | 19,120,557 | 55.31 | 41.30 | 0.97874 | 23.35 | 96.7 | `hqdn3d,scale,fps` (old order) |
| 180 s 1080p60 | h264 | standard | 19,201,073 | 53.71 | 40.15 | 0.97835 | 23.27 | 23.9 | `fps,scale` (shipped order, `-Tag fpsfirst`) |
| 180 s 1080p60 | h264 | max | 19,163,096 | 55.30 | 41.37 | 0.97876 | 23.34 | 48.6 | `fps,hqdn3d,scale` (shipped order, `-Tag fpsfirst`) |

**Filter order.** The chain is now `fps` (if the plan reduces fps) -> `hqdn3d` -> `scale` (if
downscaled): dropping frames first means `hqdn3d` only runs on the 30 kept fps instead of 60,
and denoise still runs before scaling. On the 180 s clip (the only one with an fps reduction)
Max quality encode time fell from 96.7 s to 48.6 s (about 2.0x standard instead of 3.9x), and it
is still >= standard on VMAF, SSIM and PSNR. The 10 s and 60 s clips have no fps reduction, so
their results are unaffected.

Max quality is >= standard on every clip and metric, **except SSIM on the 10 s clip
(-0.00012)**. That gap comes from `-preset slow` itself (no filter: medium 0.99767 vs slow
0.99755; `hqdn3d` + medium = 0.99767), at a transparent level (VMAF 99.89), and filter
constants can't remove it. Run-to-run noise is about +-0.15 VMAF / +-6e-5 SSIM (x264 output
is not bit-identical between runs).

### Why there is no unsharp

**The final shipped configuration has no `unsharp` filter at all** (it was removed from the
code, not left at amount 0.0). Max quality = `-preset slow` + `hqdn3d=0.6:0.4:0.9:0.6`
before scaling. Reason: every positive `unsharp` amount lowered SSIM on the downscaled clip,
while the VMAF gain (about +2) is considered a known VMAF bias toward sharpening, not a real
quality improvement.

The first run (`unsharp=3:3:0.25:3:3:0.0`) on the 180 s clip scored VMAF 57.21 (standard
53.83) but SSIM 0.97676 (standard 0.97841). Isolation on the same plan (`-preset slow`, 748 kbps):

| variant (slow) | VMAF | SSIM | PSNR-Y |
|---|---:|---:|---:|
| scale only | 55.56 | 0.97893 | 23.354 |
| hqdn3d, scale | 55.34 | 0.97879 | 23.345 |
| scale, unsharp 0.25 | 57.49 | 0.97692 | 23.452 |
| hqdn3d, scale, unsharp 3x3 0.01 / 0.05 / 0.10 / 0.15 | 55.17 / 55.57 / 56.25 / 56.54 | 0.97801 / 0.97787 / 0.97766 / 0.97731 | 23.35-23.41 |
| hqdn3d, scale, unsharp 5x5 0.10 / 0.15 | 56.88 / 57.63 | 0.97746 / 0.97717 | 23.39 / 23.42 |
| hqdn3d, unsharp 3x3 0.25 / 5x5 0.25 / 5x5 0.5, scale (pre-scale) | 57.57 / 58.51 / 61.42 | 0.97795 / 0.97764 / 0.97709 | 23.41-23.42 |
| stronger hqdn3d 1.2:0.9:1.8:1.35 or 2:1.5:3:2.25 + unsharp 0.10 | 55.95 / 55.98 | 0.97782 / 0.97795 | 23.38 |

Every positive unsharp amount (even 0.01, where `unsharp`'s fixed-point rounding shifts mean
luma by about -0.1) put SSIM below standard. VMAF NEG (`vmaf_v0.6.1neg`) also likes the
sharpening (standard 50.49, hqdn3d-only 51.83, unsharp 0.25 52.93), so the cost is
SSIM only. To meet ">= standard on every metric" the amount was set to 0.0 (exact copy,
MD5-identical frames), then the filter was dropped entirely. Sharpening trades about +2 VMAF
for about -0.0017 SSIM on downscaled outputs, so it was rejected.

### hqdn3d kept at 0.6:0.4:0.9:0.6

Stronger values lose on 60 s (VMAF 76.66 -> 76.54 -> 76.51) and 10 s (SSIM 0.99755 -> 0.99743
-> 0.99719) and don't recover the unsharp SSIM loss on 180 s. Weaker values (0.2-0.4 luma
spatial) score the same as 0.6 on 10 s.

### Plans for the demo constants (60 s 1080p60 synthetic clip, standard mode)

The original demo clip (`ranked-clutch.mp4`, 122,773,228 B) was not found on the bench
machine (Videos, Downloads, Desktop, Temp, repo parent folder), so these numbers come from
`synth-60s-1080p60.mp4` (160,997,966 B, 60.0 s).

Only `source_size_bytes` depends on the file. A 60.0 s 1080p60 + audio source gets the same
plan whatever its size, as long as it is larger than the target:

| target | video kbps | audio kbps | budget B | output |
|---:|---:|---:|---:|---|
| 10 MB | 1170 | 96 | 9,500,000 | 1920x1080, fps 60 -> 30 |
| 16 MB | 1930 | 96 | 15,200,000 | 1920x1080@60 |
| 20 MB | 2437 | 96 | 19,000,000 | 1920x1080@60 |
| 25 MB | 3070 | 96 | 23,750,000 | 1920x1080@60 |

Real 2-pass Discord 20 MB (H.264, standard): 19,202,630 B (first run: 19,205,745 B).
