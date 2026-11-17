use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

use serde::{Deserialize, Serialize};

/// 1 decimal Megabyte = 1,000,000 bytes.
/// Using 1,000,000 bytes per MB ensures that a 10 MB target (10,000,000 bytes)
/// is strictly under both 10 decimal MB (10,000,000 B) and 10 binary MiB (10,485,760 B).
pub const BYTES_PER_MB: f64 = 1_000_000.0;

/// Safety factor (95%) reserving 5% for container headers, moov atom, and VBR fluctuations.
pub const CONTAINER_SAFETY_FACTOR: f64 = 0.95;

/// Minimum allowed video bitrate (kbps) before rejecting the target size as unachievable.
const MIN_VIDEO_KBPS: i64 = 30;

/// Monotonic counter used to disambiguate concurrent 2-pass log directories within a process.
static PASS_LOG_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct TargetSizeEstimate {
    pub already_under_target: bool,
    pub source_size_bytes: u64,
    pub target_bytes: u64,
    pub budget_bytes: u64,
    pub video_kbps: u32,
    pub audio_kbps: u32,
    pub target_width: u32,
    pub target_height: u32,
    pub target_fps: u32,
    pub downscaled: bool,
    pub fps_reduced: bool,
}

/// Prepend `.\` (Windows) or `./` (Unix) when a path starts with `-` so FFmpeg/FFprobe
/// never interprets a relative filename as a CLI option flag.
pub fn safe_media_path(path: &str) -> String {
    if path.starts_with('-') {
        let prefix = if cfg!(windows) { ".\\" } else { "./" };
        format!("{prefix}{path}")
    } else {
        path.to_string()
    }
}

/// Round `v` down to the nearest even integer >= 2, as required by YUV 4:2:0 encoders.
fn make_even(v: u32) -> u32 {
    let e = v & !1;
    e.max(2)
}

/// Compute a 2-pass target-size encoding plan (bitrate budget, audio/video split,
/// and automatic framerate/resolution scaling) from source media metadata.
pub fn compute_target_size_plan(
    target_mb: f64,
    duration_secs: f64,
    source_size_bytes: u64,
    source_width: u32,
    source_height: u32,
    source_fps: f64,
    has_audio: bool,
) -> Result<TargetSizeEstimate, String> {
    if !target_mb.is_finite() || target_mb <= 0.1 {
        return Err("invalid_target_size".to_string());
    }
    if !duration_secs.is_finite() || duration_secs <= 0.05 {
        return Err("invalid_duration".to_string());
    }

    let target_bytes = (target_mb * BYTES_PER_MB).round() as u64;
    let budget_bytes = ((target_bytes as f64) * CONTAINER_SAFETY_FACTOR).floor() as u64;
    let already_under_target = source_size_bytes > 0 && source_size_bytes <= target_bytes;

    let total_kbps = (budget_bytes as f64 * 8.0) / duration_secs / 1000.0;

    // Audio bitrate allocation: scale down AAC bitrate on tight budgets so video
    // retains enough bits to remain watchable.
    let audio_kbps: u32 = if !has_audio {
        0
    } else if total_kbps >= 350.0 {
        96
    } else if total_kbps >= 160.0 {
        64
    } else {
        48
    };

    let raw_video_kbps = (total_kbps - f64::from(audio_kbps)).floor() as i64;
    if raw_video_kbps < MIN_VIDEO_KBPS && !already_under_target {
        return Err("target_too_small".to_string());
    }
    let video_kbps = raw_video_kbps.clamp(MIN_VIDEO_KBPS, i64::from(u32::MAX)) as u32;

    let src_w = source_width.max(2);
    let src_h = source_height.max(2);
    let src_fps = if source_fps.is_finite() && source_fps > 0.0 {
        source_fps
    } else {
        30.0
    };

    // Framerate reduction thresholds:
    // - If source > 30 fps (30.5 tolerance handles 30/1 & slight drift) and video_kbps < 1800,
    //   drop to 30 fps so each frame receives ~2x the bits.
    // - If source > 60 fps (60.5 tolerance), cap at 60 fps.
    let (target_fps, fps_reduced) = if src_fps > 30.5 && video_kbps < 1800 {
        (30, true)
    } else if src_fps > 60.5 {
        (60, true)
    } else {
        (src_fps.round().max(1.0) as u32, false)
    };

    // Resolution short-side ceiling based on video_kbps (never upscale above short_side):
    // Comparing the short side handles both landscape (e.g. 1920x1080) and portrait (e.g. 1080x1920).
    // - video_kbps < 450  -> 480p max
    // - video_kbps < 1100 -> 720p max
    // - video_kbps < 3000 -> 1080p max
    // - video_kbps >= 3000 -> keep short_side, except sources > 1080p are capped at 1080p
    //   whenever video_kbps < 4500.
    let short_side = src_w.min(src_h);
    let max_short_side = if video_kbps < 450 {
        480
    } else if video_kbps < 1100 {
        720
    } else if video_kbps < 3000 || (short_side > 1080 && video_kbps < 4500) {
        1080
    } else {
        short_side
    };

    let (target_width, target_height) = if short_side > max_short_side {
        let scale_ratio = max_short_side as f64 / short_side as f64;
        (
            make_even((f64::from(src_w) * scale_ratio).round() as u32),
            make_even((f64::from(src_h) * scale_ratio).round() as u32),
        )
    } else {
        (make_even(src_w), make_even(src_h))
    };
    let downscaled = target_width != src_w || target_height != src_h;

    Ok(TargetSizeEstimate {
        already_under_target,
        source_size_bytes,
        target_bytes,
        budget_bytes,
        video_kbps,
        audio_kbps,
        target_width,
        target_height,
        target_fps,
        downscaled,
        fps_reduced,
    })
}

/// RAII temporary directory guard for FFmpeg 2-pass log files (`ffmpeg2pass`, `x265_2pass.log`, etc.).
/// Removes the directory and all generated pass files when dropped.
#[derive(Debug)]
pub struct PassLogDir(pub PathBuf);

impl PassLogDir {
    /// Create a unique temporary directory `mediaforge-2pass-{pid}-{nanos}-{counter}`
    /// inside `std::env::temp_dir()`.
    pub fn new() -> Result<Self, String> {
        let temp_root = std::env::temp_dir();
        std::fs::create_dir_all(&temp_root)
            .map_err(|e| format!("Failed to prepare temp directory: {e}"))?;

        let pid = std::process::id();
        for _ in 0..32 {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0);
            let counter = PASS_LOG_COUNTER.fetch_add(1, Ordering::Relaxed);
            let dir_path = temp_root.join(format!("mediaforge-2pass-{pid}-{nanos}-{counter}"));

            match std::fs::create_dir(&dir_path) {
                Ok(()) => return Ok(Self(dir_path)),
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
                Err(e) => return Err(format!("Failed to create 2-pass temp directory: {e}")),
            }
        }

        Err("Failed to allocate unique 2-pass temp directory".to_string())
    }

    /// Borrow the underlying directory path.
    pub fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for PassLogDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// Escape characters interpreted by FFmpeg's `av_dict_parse_string` / `av_get_token`
/// inside `-x265-params` (`:` separates key=value pairs, `\` escapes, `'` quotes, `=` splits).
fn escape_x265_param_value(raw: &str) -> String {
    let mut escaped = String::with_capacity(raw.len());
    for (idx, ch) in raw.chars().enumerate() {
        match ch {
            '\\' | ':' | '\'' | '=' | '\r' => {
                escaped.push('\\');
                escaped.push(ch);
            }
            ' ' | '\t' | '\n' if idx == 0 => {
                escaped.push('\\');
                escaped.push(ch);
            }
            _ => escaped.push(ch),
        }
    }
    escaped
}

/// Build FFmpeg CLI arguments for Pass 1 (`pass == 1`) or Pass 2 (`pass == 2`)
/// of a bitrate-budgeted 2-pass encode.
pub fn build_two_pass_ffmpeg_args(
    input_path: &str,
    output_path: &str,
    plan: &TargetSizeEstimate,
    codec: Option<&str>,
    pass: u8,
    pass_dir: &Path,
    video_kbps: u32,
) -> Vec<String> {
    let is_pass_one = pass == 1;
    let pass_num = if is_pass_one { "1" } else { "2" };
    let safe_input = safe_media_path(input_path);
    let safe_output = safe_media_path(output_path);
    let overwrite_flag = if is_pass_one { "-y" } else { "-n" };

    let mut args: Vec<String> = vec![
        overwrite_flag.into(),
        "-nostdin".into(),
        "-i".into(),
        safe_input,
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        "-map".into(),
        "0:v:0".into(),
        "-sn".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
    ];

    let vf = match (plan.downscaled, plan.fps_reduced) {
        (true, true) => Some(format!(
            "scale={}:{},fps={}",
            plan.target_width, plan.target_height, plan.target_fps
        )),
        (true, false) => Some(format!(
            "scale={}:{}",
            plan.target_width, plan.target_height
        )),
        (false, true) => Some(format!("fps={}", plan.target_fps)),
        (false, false) => None,
    };
    if let Some(filter) = vf {
        args.extend(["-vf".into(), filter]);
    }

    let maxrate_kbps = (u64::from(video_kbps) * 105 / 100).max(u64::from(video_kbps));
    let bufsize_kbps = u64::from(video_kbps) * 2;
    let use_h265 = matches!(
        codec.map(|c| c.trim().to_ascii_lowercase()).as_deref(),
        Some("h265" | "hevc" | "libx265")
    );

    if use_h265 {
        let stats_path = pass_dir.join("x265_2pass.log");
        let escaped_stats = escape_x265_param_value(&stats_path.to_string_lossy());
        args.extend([
            "-c:v".into(),
            "libx265".into(),
            "-b:v".into(),
            format!("{video_kbps}k"),
            "-maxrate".into(),
            format!("{maxrate_kbps}k"),
            "-bufsize".into(),
            format!("{bufsize_kbps}k"),
            "-preset".into(),
            "medium".into(),
            "-x265-params".into(),
            format!("pass={pass_num}:stats={escaped_stats}"),
        ]);
    } else {
        let pass_logfile = pass_dir.join("ffmpeg2pass").to_string_lossy().into_owned();
        args.extend([
            "-c:v".into(),
            "libx264".into(),
            "-b:v".into(),
            format!("{video_kbps}k"),
            "-maxrate".into(),
            format!("{maxrate_kbps}k"),
            "-bufsize".into(),
            format!("{bufsize_kbps}k"),
            "-preset".into(),
            "medium".into(),
            "-pass".into(),
            pass_num.into(),
            "-passlogfile".into(),
            pass_logfile,
        ]);
    }

    if is_pass_one {
        let null_sink = if cfg!(windows) { "NUL" } else { "/dev/null" };
        args.extend(["-an".into(), "-f".into(), "mp4".into(), null_sink.into()]);
    } else {
        if plan.audio_kbps > 0 {
            args.extend([
                "-map".into(),
                "0:a:0?".into(),
                "-c:a".into(),
                "aac".into(),
                "-b:a".into(),
                format!("{}k", plan.audio_kbps),
            ]);
        } else {
            args.push("-an".into());
        }
        args.extend([
            "-movflags".into(),
            "+faststart".into(),
            safe_output,
        ]);
    }

    args
}

/// Parse an ffprobe `r_frame_rate` string (e.g. `"60/1"`, `"30000/1001"`, `"29.97"`)
/// into frames per second. Returns `None` for empty, zero, non-positive, or invalid values.
pub fn parse_fps_str(r_frame_rate: &str) -> Option<f64> {
    let trimmed = r_frame_rate.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Some((num_str, den_str)) = trimmed.split_once('/') {
        let num: f64 = num_str.trim().parse().ok()?;
        let den: f64 = den_str.trim().parse().ok()?;
        if !num.is_finite() || !den.is_finite() || num <= 0.0 || den <= 0.0 {
            return None;
        }
        let fps = num / den;
        if fps.is_finite() && fps > 0.0 {
            Some(fps)
        } else {
            None
        }
    } else {
        let fps: f64 = trimmed.parse().ok()?;
        if fps.is_finite() && fps > 0.0 {
            Some(fps)
        } else {
            None
        }
    }
}

/// Reduce video bitrate by 10% for an overshoot retry pass, floored at 25 kbps.
pub fn scale_kbps_for_retry(video_kbps: u32) -> u32 {
    (f64::from(video_kbps) * 0.90).floor().max(25.0) as u32
}

#[cfg(test)]
mod tests {
    use super::*;

    fn has_arg_pair(args: &[String], flag: &str, value: &str) -> bool {
        args.windows(2).any(|w| w[0] == flag && w[1] == value)
    }

    #[test]
    fn test_budget_is_95_percent_of_target_bytes() {
        let plan = compute_target_size_plan(10.0, 60.0, 50_000_000, 1920, 1080, 30.0, true)
            .expect("valid plan");

        assert_eq!(plan.target_bytes, 10_000_000);
        assert_eq!(plan.budget_bytes, 9_500_000);
        assert!(!plan.already_under_target);
        // 9,500,000 * 8 / 60 / 1000 = 1266.666... kbps total; audio = 96 -> video = 1170
        assert_eq!(plan.audio_kbps, 96);
        assert_eq!(plan.video_kbps, 1170);
    }

    #[test]
    fn test_invalid_inputs_rejected() {
        assert_eq!(
            compute_target_size_plan(0.0, 60.0, 1_000_000, 1920, 1080, 30.0, true),
            Err("invalid_target_size".to_string())
        );
        assert_eq!(
            compute_target_size_plan(0.1, 60.0, 1_000_000, 1920, 1080, 30.0, true),
            Err("invalid_target_size".to_string())
        );
        assert_eq!(
            compute_target_size_plan(f64::NAN, 60.0, 1_000_000, 1920, 1080, 30.0, true),
            Err("invalid_target_size".to_string())
        );
        assert_eq!(
            compute_target_size_plan(f64::INFINITY, 60.0, 1_000_000, 1920, 1080, 30.0, true),
            Err("invalid_target_size".to_string())
        );

        assert_eq!(
            compute_target_size_plan(10.0, 0.0, 1_000_000, 1920, 1080, 30.0, true),
            Err("invalid_duration".to_string())
        );
        assert_eq!(
            compute_target_size_plan(10.0, 0.05, 1_000_000, 1920, 1080, 30.0, true),
            Err("invalid_duration".to_string())
        );
        assert_eq!(
            compute_target_size_plan(10.0, f64::NAN, 1_000_000, 1920, 1080, 30.0, true),
            Err("invalid_duration".to_string())
        );
    }

    #[test]
    fn test_audio_bitrate_tiers_and_no_audio() {
        // Generous budget: 10 MB / 100s => 760 kbps >= 350 => 96 kbps audio
        let generous = compute_target_size_plan(10.0, 100.0, 20_000_000, 1280, 720, 30.0, true)
            .expect("generous");
        assert_eq!(generous.audio_kbps, 96);

        // Tight budget: 10 MB / 300s => 253.3 kbps in [160, 350) => 64 kbps audio
        let tight = compute_target_size_plan(10.0, 300.0, 20_000_000, 1280, 720, 30.0, true)
            .expect("tight");
        assert_eq!(tight.audio_kbps, 64);

        // Ultra-tight budget: 10 MB / 600s => 126.67 kbps < 160 => 48 kbps audio
        let ultra_tight = compute_target_size_plan(10.0, 600.0, 20_000_000, 1280, 720, 30.0, true)
            .expect("ultra tight");
        assert_eq!(ultra_tight.audio_kbps, 48);
        assert_eq!(ultra_tight.video_kbps, 78);

        // Silent video: audio_kbps == 0
        let silent = compute_target_size_plan(10.0, 600.0, 20_000_000, 1280, 720, 30.0, false)
            .expect("silent");
        assert_eq!(silent.audio_kbps, 0);
        assert_eq!(silent.video_kbps, 126);
    }

    #[test]
    fn test_4k_downscaling_tiers_and_even_dimensions() {
        // Very high bitrate (>= 4500 kbps): 10 MB over 10s => 7600 kbps total, 7504 video => keep 4K
        let keep_4k = compute_target_size_plan(10.0, 10.0, 50_000_000, 3840, 2160, 30.0, true)
            .expect("keep 4k");
        assert_eq!(keep_4k.target_width, 3840);
        assert_eq!(keep_4k.target_height, 2160);
        assert!(!keep_4k.downscaled);

        // Mid bitrate (1100 <= video_kbps < 4500): 10 MB over 40s => 1804 video => 1080p
        let to_1080p = compute_target_size_plan(10.0, 40.0, 50_000_000, 3840, 2160, 30.0, true)
            .expect("1080p");
        assert_eq!(to_1080p.target_width, 1920);
        assert_eq!(to_1080p.target_height, 1080);
        assert!(to_1080p.downscaled);

        // Also check 3000..4499 kbps caps 4K at 1080p: 10 MB over 20s => 3704 video => 1080p
        let cap_4k_at_1080 =
            compute_target_size_plan(10.0, 20.0, 50_000_000, 3840, 2160, 30.0, true)
                .expect("cap 4k at 1080p");
        assert_eq!(cap_4k_at_1080.target_width, 1920);
        assert_eq!(cap_4k_at_1080.target_height, 1080);
        assert!(cap_4k_at_1080.downscaled);

        // Low-mid bitrate (450 <= video_kbps < 1100): 10 MB over 100s => 664 video => 720p
        let to_720p = compute_target_size_plan(10.0, 100.0, 50_000_000, 3840, 2160, 30.0, true)
            .expect("720p");
        assert_eq!(to_720p.target_width, 1280);
        assert_eq!(to_720p.target_height, 720);
        assert!(to_720p.downscaled);

        // Very low bitrate (video_kbps < 450): 10 MB over 240s => 252 video => 480p (even width 852)
        let to_480p = compute_target_size_plan(10.0, 240.0, 50_000_000, 3840, 2160, 30.0, true)
            .expect("480p");
        assert_eq!(to_480p.target_width, 852);
        assert_eq!(to_480p.target_height, 480);
        assert_eq!(to_480p.target_width % 2, 0);
        assert_eq!(to_480p.target_height % 2, 0);
        assert!(to_480p.downscaled);
    }

    #[test]
    fn test_no_upscaling_when_source_is_smaller_than_ceiling() {
        // High bitrate with 640x360 source must never upscale.
        let high_br = compute_target_size_plan(100.0, 10.0, 200_000_000, 640, 360, 30.0, true)
            .expect("high bitrate small source");
        assert_eq!(high_br.target_width, 640);
        assert_eq!(high_br.target_height, 360);
        assert!(!high_br.downscaled);

        // Low bitrate with 640x360 (below 480p ceiling) also stays 640x360.
        let low_br = compute_target_size_plan(10.0, 300.0, 50_000_000, 640, 360, 30.0, true)
            .expect("low bitrate small source");
        assert_eq!(low_br.target_width, 640);
        assert_eq!(low_br.target_height, 360);
        assert!(!low_br.downscaled);
    }

    #[test]
    fn test_framerate_reduction_thresholds() {
        // 60 fps with video_kbps < 1800 -> reduced to 30 fps
        let reduced = compute_target_size_plan(10.0, 60.0, 50_000_000, 1920, 1080, 60.0, true)
            .expect("fps reduced");
        assert!(reduced.video_kbps < 1800);
        assert_eq!(reduced.target_fps, 30);
        assert!(reduced.fps_reduced);

        // 60 fps with video_kbps >= 1800 -> stays 60 fps
        let kept = compute_target_size_plan(10.0, 20.0, 50_000_000, 1920, 1080, 60.0, true)
            .expect("fps kept");
        assert!(kept.video_kbps >= 1800);
        assert_eq!(kept.target_fps, 60);
        assert!(!kept.fps_reduced);

        // 120 fps with high bitrate -> capped at 60 fps
        let capped_120 = compute_target_size_plan(20.0, 20.0, 50_000_000, 1920, 1080, 120.0, true)
            .expect("120fps capped");
        assert_eq!(capped_120.target_fps, 60);
        assert!(capped_120.fps_reduced);

        // 29.97 fps with low bitrate -> stays ~30 fps, not marked reduced
        let ntsc = compute_target_size_plan(10.0, 100.0, 50_000_000, 1920, 1080, 29.97, true)
            .expect("29.97fps");
        assert_eq!(ntsc.target_fps, 30);
        assert!(!ntsc.fps_reduced);
    }

    #[test]
    fn test_already_under_target_flag() {
        let equal = compute_target_size_plan(10.0, 60.0, 10_000_000, 1280, 720, 30.0, true)
            .expect("equal size");
        assert!(equal.already_under_target);

        let smaller = compute_target_size_plan(10.0, 60.0, 4_500_000, 1280, 720, 30.0, true)
            .expect("smaller size");
        assert!(smaller.already_under_target);

        let unknown_source = compute_target_size_plan(10.0, 60.0, 0, 1280, 720, 30.0, true)
            .expect("unknown source size");
        assert!(!unknown_source.already_under_target);

        // Even if duration is very long, already_under_target does not fail with target_too_small.
        let tiny_budget_already_under =
            compute_target_size_plan(1.0, 7200.0, 900_000, 1280, 720, 30.0, true)
                .expect("already under avoids target_too_small");
        assert!(tiny_budget_already_under.already_under_target);
        assert_eq!(tiny_budget_already_under.video_kbps, 30);
    }

    #[test]
    fn test_target_too_small_error() {
        // 1 MB over 7200s (2 hours) yields ~1.05 kbps total, far below audio + 30 kbps floor.
        let err = compute_target_size_plan(1.0, 7200.0, 100_000_000, 1920, 1080, 30.0, true)
            .expect_err("expected target_too_small");
        assert_eq!(err, "target_too_small");
    }

    #[test]
    fn test_build_two_pass_ffmpeg_args_h264_and_h265() {
        let plan_scaled = TargetSizeEstimate {
            already_under_target: false,
            source_size_bytes: 50_000_000,
            target_bytes: 10_000_000,
            budget_bytes: 9_500_000,
            video_kbps: 1000,
            audio_kbps: 96,
            target_width: 1280,
            target_height: 720,
            target_fps: 30,
            downscaled: true,
            fps_reduced: true,
        };
        let pass_dir = Path::new(r"C:\Temp\mediaforge café");
        let expected_null = if cfg!(windows) { "NUL" } else { "/dev/null" };

        // H.264 Pass 1 (default codec None)
        let h264_p1 = build_two_pass_ffmpeg_args(
            r"C:\Videos\clip é.mp4",
            r"C:\Videos\clip_out.mp4",
            &plan_scaled,
            None,
            1,
            pass_dir,
            1000,
        );
        assert_eq!(h264_p1[0], "-y");
        assert!(has_arg_pair(&h264_p1, "-i", r"C:\Videos\clip é.mp4"));
        assert!(has_arg_pair(&h264_p1, "-vf", "scale=1280:720,fps=30"));
        assert!(has_arg_pair(&h264_p1, "-c:v", "libx264"));
        assert!(has_arg_pair(&h264_p1, "-b:v", "1000k"));
        assert!(has_arg_pair(&h264_p1, "-maxrate", "1050k"));
        assert!(has_arg_pair(&h264_p1, "-bufsize", "2000k"));
        assert!(has_arg_pair(&h264_p1, "-pass", "1"));
        assert!(has_arg_pair(
            &h264_p1,
            "-passlogfile",
            &pass_dir.join("ffmpeg2pass").to_string_lossy()
        ));
        assert!(h264_p1.contains(&"-an".to_string()));
        assert!(has_arg_pair(&h264_p1, "-f", "mp4"));
        assert_eq!(h264_p1.last().map(String::as_str), Some(expected_null));

        // H.264 Pass 2 with audio
        let h264_p2 = build_two_pass_ffmpeg_args(
            r"C:\Videos\clip é.mp4",
            r"C:\Videos\clip_out.mp4",
            &plan_scaled,
            Some("h264"),
            2,
            pass_dir,
            900,
        );
        assert!(has_arg_pair(&h264_p2, "-b:v", "900k"));
        assert!(has_arg_pair(&h264_p2, "-maxrate", "945k"));
        assert!(has_arg_pair(&h264_p2, "-bufsize", "1800k"));
        assert!(has_arg_pair(&h264_p2, "-pass", "2"));
        assert!(has_arg_pair(&h264_p2, "-c:a", "aac"));
        assert!(has_arg_pair(&h264_p2, "-b:a", "96k"));
        assert!(has_arg_pair(&h264_p2, "-movflags", "+faststart"));
        assert!(h264_p2.contains(&"-nostdin".to_string()));
        assert_eq!(
            h264_p2.last().map(String::as_str),
            Some(r"C:\Videos\clip_out.mp4")
        );

        // H.265 Pass 1 & Pass 2 without audio or filters
        let plan_plain = TargetSizeEstimate {
            audio_kbps: 0,
            downscaled: false,
            fps_reduced: false,
            ..plan_scaled
        };
        let h265_p1 = build_two_pass_ffmpeg_args(
            "in.mp4",
            "out.mp4",
            &plan_plain,
            Some("h265"),
            1,
            Path::new("C:/tmp/dir's"),
            1000,
        );
        assert!(!h265_p1.contains(&"-vf".to_string()));
        assert!(has_arg_pair(&h265_p1, "-c:v", "libx265"));
        let x265_idx = h265_p1
            .iter()
            .position(|a| a == "-x265-params")
            .expect("-x265-params present");
        let params_val = &h265_p1[x265_idx + 1];
        assert!(params_val.starts_with("pass=1:stats="));
        assert!(params_val.contains(r"C\:/tmp/dir\'s") || params_val.contains(r"C\:\\tmp\\dir\'s"));

        let h265_p2 = build_two_pass_ffmpeg_args(
            "in.mp4",
            "out.mp4",
            &plan_plain,
            Some("h265"),
            2,
            pass_dir,
            1000,
        );
        assert!(has_arg_pair(&h265_p2, "-c:v", "libx265"));
        assert!(h265_p2.contains(&"-an".to_string()));
        assert!(!h265_p2.contains(&"-c:a".to_string()));
        let x265_p2_idx = h265_p2
            .iter()
            .position(|a| a == "-x265-params")
            .expect("-x265-params present in pass 2");
        assert!(h265_p2[x265_p2_idx + 1].starts_with("pass=2:stats="));
    }

    #[test]
    fn test_pass_log_dir_creation_and_cleanup_on_drop() {
        let created_path: PathBuf;
        {
            let guard = PassLogDir::new().expect("create PassLogDir");
            created_path = guard.path().to_path_buf();
            assert!(created_path.is_dir());

            let dir_name = created_path
                .file_name()
                .and_then(|n| n.to_str())
                .expect("utf-8 dir name");
            assert!(dir_name.starts_with("mediaforge-2pass-"));

            let dummy_log = created_path.join("ffmpeg2pass-0.log");
            std::fs::write(&dummy_log, b"stats").expect("write dummy log");
            assert!(dummy_log.is_file());
        }

        assert!(
            !created_path.exists(),
            "PassLogDir should be deleted on drop: {created_path:?}"
        );
    }

    #[test]
    fn test_parse_fps_str() {
        assert_eq!(parse_fps_str("60/1"), Some(60.0));
        assert_eq!(parse_fps_str("29.97"), Some(29.97));
        let ntsc = parse_fps_str("30000/1001").expect("30000/1001");
        assert!((ntsc - 29.97002997).abs() < 1e-6);
        let film = parse_fps_str(" 24000 / 1001 ").expect("24000/1001");
        assert!((film - 23.97602397).abs() < 1e-6);

        assert_eq!(parse_fps_str("0/0"), None);
        assert_eq!(parse_fps_str("60/0"), None);
        assert_eq!(parse_fps_str("-30/1"), None);
        assert_eq!(parse_fps_str("0"), None);
        assert_eq!(parse_fps_str(""), None);
        assert_eq!(parse_fps_str("N/A"), None);
        assert_eq!(parse_fps_str("1/2/3"), None);
    }

    #[test]
    fn test_scale_kbps_for_retry() {
        assert_eq!(scale_kbps_for_retry(1000), 900);
        assert_eq!(scale_kbps_for_retry(555), 499);
        assert_eq!(scale_kbps_for_retry(30), 27);
        assert_eq!(scale_kbps_for_retry(26), 25);
        assert_eq!(scale_kbps_for_retry(10), 25);
    }
}
