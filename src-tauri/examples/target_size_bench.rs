//! Target-size quality bench: runs the app's real 2-pass pipeline outside Tauri.
//!
//! It probes the source exactly like `get_media_info` / `parse_ffprobe_json` in
//! `lib.rs`, computes the plan with `target_size::compute_target_size_plan`,
//! builds every FFmpeg argument with
//! `target_size::build_two_pass_ffmpeg_args_with_options`, and replicates the
//! size check + single -10% retry of `compress_single_video_impl`.
//! The argument vectors are passed to FFmpeg unchanged (including
//! `-progress pipe:1`; stdout is simply discarded).
//!
//! Usage:
//!   target_size_bench --input IN --output OUT --target-mb 20 [--codec h264|h265]
//!                     [--max-quality] [--ffmpeg PATH] [--ffprobe PATH] [--plan-only]
//!
//! Prints a single JSON line on stdout.

use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Instant;

use kompri_lib::target_size;
use serde_json::{json, Value};

struct Opts {
    input: String,
    output: String,
    target_mb: f64,
    codec: Option<String>,
    max_quality: bool,
    ffmpeg: String,
    ffprobe: String,
    plan_only: bool,
}

fn parse_args() -> Result<Opts, String> {
    let mut opts = Opts {
        input: String::new(),
        output: String::new(),
        target_mb: 20.0,
        codec: None,
        max_quality: false,
        ffmpeg: "ffmpeg".into(),
        ffprobe: "ffprobe".into(),
        plan_only: false,
    };
    let mut it = std::env::args().skip(1);
    while let Some(a) = it.next() {
        let mut val = |name: &str| it.next().ok_or(format!("missing value for {name}"));
        match a.as_str() {
            "--input" => opts.input = val("--input")?,
            "--output" => opts.output = val("--output")?,
            "--target-mb" => {
                opts.target_mb = val("--target-mb")?
                    .parse()
                    .map_err(|e| format!("bad --target-mb: {e}"))?
            }
            "--codec" => opts.codec = Some(val("--codec")?),
            "--max-quality" => opts.max_quality = true,
            "--ffmpeg" => opts.ffmpeg = val("--ffmpeg")?,
            "--ffprobe" => opts.ffprobe = val("--ffprobe")?,
            "--plan-only" => opts.plan_only = true,
            other => return Err(format!("unknown argument: {other}")),
        }
    }
    if opts.input.is_empty() {
        return Err("--input is required".into());
    }
    if opts.output.is_empty() && !opts.plan_only {
        return Err("--output is required unless --plan-only".into());
    }
    Ok(opts)
}

/// Same fields `compress_single_video_impl` feeds into the plan.
struct Probe {
    duration: f64,
    width: Option<u32>,
    height: Option<u32>,
    fps: Option<f64>,
    has_audio: bool,
    file_size: u64,
}

/// Mirror of `lib.rs::get_media_info` + `parse_ffprobe_json` (private there).
fn probe(ffprobe: &str, input: &str) -> Result<Probe, String> {
    let file_size = std::fs::metadata(input).map(|m| m.len()).unwrap_or(0);
    let out = Command::new(ffprobe)
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
            "-i",
            &target_size::safe_media_path(input),
        ])
        .output()
        .map_err(|e| format!("ffprobe spawn failed: {e}"))?;
    let v: Value =
        serde_json::from_slice(&out.stdout).map_err(|e| format!("ffprobe parse error: {e}"))?;

    let format = &v["format"];
    let streams = v["streams"].as_array().cloned().unwrap_or_default();
    let mut duration: f64 = format["duration"]
        .as_str()
        .and_then(|s| s.parse().ok())
        .filter(|d: &f64| d.is_finite() && *d > 0.0)
        .unwrap_or(0.0);
    let (mut width, mut height, mut fps) = (None, None, None);
    let (mut have_video, mut has_audio) = (false, false);

    for stream in &streams {
        if duration <= 0.0 {
            if let Some(sd) = stream["duration"]
                .as_str()
                .and_then(|s| s.parse::<f64>().ok())
                .filter(|d| d.is_finite() && *d > 0.0)
            {
                duration = duration.max(sd);
            }
        }
        match stream["codec_type"].as_str().unwrap_or("") {
            "video" => {
                if stream["disposition"]["attached_pic"].as_i64() == Some(1) {
                    continue;
                }
                if !have_video {
                    have_video = stream["codec_name"].as_str().is_some();
                    width = stream["width"].as_u64().map(|v| v as u32);
                    height = stream["height"].as_u64().map(|v| v as u32);
                    fps = stream["avg_frame_rate"]
                        .as_str()
                        .and_then(target_size::parse_fps_str)
                        .or_else(|| {
                            stream["r_frame_rate"]
                                .as_str()
                                .and_then(target_size::parse_fps_str)
                        });
                }
            }
            "audio" if stream["codec_name"].as_str().is_some() => {
                has_audio = true;
            }
            _ => {}
        }
    }

    Ok(Probe {
        duration,
        width,
        height,
        fps,
        has_audio,
        file_size,
    })
}

fn run_ffmpeg(ffmpeg: &str, args: &[String]) -> Result<(), String> {
    let out = Command::new(ffmpeg)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("ffmpeg spawn failed: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        let err = String::from_utf8_lossy(&out.stderr);
        let tail: String = err
            .lines()
            .rev()
            .take(8)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect::<Vec<_>>()
            .join(" | ");
        Err(format!("ffmpeg failed ({}): {tail}", out.status))
    }
}

/// Mirror of `lib.rs::execute_two_pass_attempt` (fresh pass-log dir per attempt).
fn two_pass_attempt(
    o: &Opts,
    plan: &target_size::TargetSizeEstimate,
    video_kbps: u32,
) -> Result<(Vec<String>, Vec<String>), String> {
    let pass_dir = target_size::PassLogDir::new()?;
    let build = |pass: u8| {
        target_size::build_two_pass_ffmpeg_args_with_options(
            &o.input,
            &o.output,
            plan,
            o.codec.as_deref(),
            pass,
            pass_dir.path(),
            video_kbps,
            o.max_quality,
        )
    };
    let p1 = build(1);
    run_ffmpeg(&o.ffmpeg, &p1)?;
    let p2 = build(2);
    if let Err(e) = run_ffmpeg(&o.ffmpeg, &p2) {
        let _ = std::fs::remove_file(&o.output);
        return Err(e);
    }
    Ok((p1, p2))
}

fn file_len(p: &str) -> Result<u64, String> {
    std::fs::metadata(p).map(|m| m.len()).map_err(|e| e.to_string())
}

fn run(o: &Opts) -> Result<Value, String> {
    let info = probe(&o.ffprobe, &o.input)?;
    // Same fallbacks as compress_single_video_impl.
    let plan = target_size::compute_target_size_plan(
        o.target_mb,
        info.duration,
        info.file_size,
        info.width.unwrap_or(1920),
        info.height.unwrap_or(1080),
        info.fps.unwrap_or(30.0),
        info.has_audio,
    )?;
    let probe_json = json!({
        "duration": info.duration,
        "width": info.width,
        "height": info.height,
        "fps": info.fps,
        "has_audio": info.has_audio,
        "file_size": info.file_size,
    });
    if o.plan_only {
        return Ok(json!({ "target_mb": o.target_mb, "probe": probe_json, "plan": plan }));
    }

    if Path::new(&o.output).exists() {
        std::fs::remove_file(&o.output).map_err(|e| format!("cannot remove old output: {e}"))?;
    }

    let started = Instant::now();
    let mut attempts = Vec::new();

    let (p1, p2) = two_pass_attempt(o, &plan, plan.video_kbps)?;
    let first_bytes = file_len(&o.output)?;
    attempts.push(json!({ "video_kbps": plan.video_kbps, "bytes": first_bytes }));
    let (mut final_bytes, mut last_p1, mut last_p2, mut retried) = (first_bytes, p1, p2, false);

    if first_bytes > plan.target_bytes {
        // Same as the app: delete, retry ONCE at -10% video bitrate.
        let _ = std::fs::remove_file(&o.output);
        let retry_kbps = target_size::scale_kbps_for_retry(plan.video_kbps);
        let (p1, p2) = two_pass_attempt(o, &plan, retry_kbps)?;
        final_bytes = file_len(&o.output)?;
        attempts.push(json!({ "video_kbps": retry_kbps, "bytes": final_bytes }));
        last_p1 = p1;
        last_p2 = p2;
        retried = true;
    }
    let seconds = started.elapsed().as_secs_f64();
    let ok = final_bytes <= plan.target_bytes;
    if !ok {
        // The app deletes the output and reports "Target size exceeded after retry".
        let _ = std::fs::remove_file(&o.output);
    }

    Ok(json!({
        "ok": ok,
        "input": o.input,
        "output": o.output,
        "target_mb": o.target_mb,
        "codec": o.codec.clone().unwrap_or_else(|| "h264".into()),
        "max_quality": o.max_quality,
        "probe": probe_json,
        "plan": plan,
        "retried": retried,
        "attempts": attempts,
        "final_bytes": final_bytes,
        "seconds": (seconds * 100.0).round() / 100.0,
        "pass1_args": last_p1,
        "pass2_args": last_p2,
    }))
}

fn main() {
    let result = parse_args().and_then(|o| run(&o));
    match result {
        Ok(v) => println!("{v}"),
        Err(e) => {
            println!("{}", json!({ "ok": false, "error": e }));
            std::process::exit(1);
        }
    }
}
