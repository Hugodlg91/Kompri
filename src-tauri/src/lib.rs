use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};
use serde::{Deserialize, Serialize};
use tauri_plugin_store::StoreExt;

pub mod cli;
pub mod context_menu;
pub mod target_size;

// ─── State ───────────────────────────────────────────────────────────────────

#[derive(Clone)]
pub struct AppState {
    pub current_process: Arc<Mutex<Option<CommandChild>>>,
    /// Held for a whole FFmpeg job (single file or batch).
    pub ffmpeg_busy: Arc<AtomicBool>,
    /// Set by cancel_conversion, cleared when the next FFmpeg job starts.
    pub cancel_requested: Arc<AtomicBool>,
    /// Held for a whole image job (single file or batch).
    pub image_busy: Arc<AtomicBool>,
}

/// Stable error code returned when a job of the same kind is already running.
/// The frontend translates it.
pub const BUSY_ERROR: &str = "busy";

/// Exclusive claim on a job slot, released when dropped (also on early return).
pub struct JobGuard(Arc<AtomicBool>);

impl JobGuard {
    /// Refuse a second job explicitly instead of replacing the running one.
    pub fn try_acquire(flag: &Arc<AtomicBool>) -> Result<Self, String> {
        flag.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map(|_| JobGuard(Arc::clone(flag)))
            .map_err(|_| BUSY_ERROR.to_string())
    }
}

impl Drop for JobGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

/// Claim the FFmpeg slot and clear any cancellation left from a previous job.
fn start_ffmpeg_job(state: &AppState) -> Result<JobGuard, String> {
    // Share the process mutex with cancellation: publishing a new job and
    // clearing the previous cancellation must be one indivisible transition.
    let _process = state.current_process.lock().map_err(|e| e.to_string())?;
    let guard = JobGuard::try_acquire(&state.ffmpeg_busy)?;
    state.cancel_requested.store(false, Ordering::Release);
    Ok(guard)
}

fn cancelled_error() -> String {
    "cancelled".to_string()
}

/// Anti-zombie: automatically kill any live FFmpeg process when the
/// application is shut down and Tauri drops the managed state.
impl Drop for AppState {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.current_process.lock() {
            if let Some(child) = guard.take() {
                let _ = child.kill();
            }
        }
    }
}

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
struct ProgressPayload {
    percentage: f32,
    current_time: String,
    speed: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pass: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    total_passes: Option<u8>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct MediaInfo {
    pub duration: f64,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub file_size: u64,
    pub bitrate: Option<String>,
    pub fps: Option<f64>,
    pub audio_bitrate_kbps: Option<u32>,
    pub has_audio: bool,
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/// Parse "HH:MM:SS.ms" → total seconds.
fn time_str_to_secs(s: &str) -> Option<f64> {
    let parts: Vec<&str> = s.trim().split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let h: f64 = parts[0].parse().ok()?;
    let m: f64 = parts[1].parse().ok()?;
    let s: f64 = parts[2].parse().ok()?;
    Some(h * 3600.0 + m * 60.0 + s)
}

/// Extract duration from an FFmpeg stderr line like:
///   "  Duration: 00:01:23.45, start: ..."
fn parse_duration_line(line: &str) -> Option<f64> {
    let start = line.find("Duration: ")?;
    let rest = &line[start + 10..];
    let end = rest.find(',').unwrap_or(rest.len());
    time_str_to_secs(&rest[..end])
}

fn format_secs(secs: f64) -> String {
    let h = (secs / 3600.0) as u64;
    let m = ((secs % 3600.0) / 60.0) as u64;
    let s = (secs % 60.0) as u64;
    format!("{:02}:{:02}:{:02}", h, m, s)
}

fn format_byte_size(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{} B", bytes)
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else if bytes < 1024 * 1024 * 1024 {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    } else {
        format!("{:.2} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    }
}

// ─── Core FFmpeg runner ───────────────────────────────────────────────────────

/// Spawn ffmpeg with the given args, stream progress events, and return the
/// output path on success.
async fn run_ffmpeg(
    app: tauri::AppHandle,
    process_slot: Arc<Mutex<Option<CommandChild>>>,
    cancel_requested: Arc<AtomicBool>,
    args: Vec<String>,
    output_path: String,
) -> Result<String, String> {
    run_ffmpeg_with_pass(app, process_slot, cancel_requested, args, output_path, true, None).await
}

async fn run_ffmpeg_with_pass(
    app: tauri::AppHandle,
    process_slot: Arc<Mutex<Option<CommandChild>>>,
    cancel_requested: Arc<AtomicBool>,
    args: Vec<String>,
    output_path: String,
    check_output: bool,
    pass_info: Option<(u8, u8)>,
) -> Result<String, String> {
    if cancel_requested.load(Ordering::Acquire) {
        return Err(cancelled_error());
    }
    if check_output {
        ensure_output_available(&output_path)?;
    }
    let (mut rx, child) = app
        .shell()
        .sidecar("ffmpeg")
        .map_err(|e| e.to_string())?
        .args(&args)
        .spawn()
        .map_err(|e| e.to_string())?;

    {
        let mut guard = process_slot.lock().map_err(|e| e.to_string())?;
        // A cancel that arrived while spawning found an empty slot: honour it now.
        if cancel_requested.load(Ordering::Acquire) {
            let _ = child.kill();
        } else {
            *guard = Some(child);
        }
    }

    let mut total_duration = 0.0f64;
    let mut out_time_us: Option<u64> = None;
    let mut speed = String::from("N/A");
    let mut stderr_buf = String::new();
    let (pass, total_passes) = match pass_info {
        Some((p, t)) => (Some(p), Some(t)),
        None => (None, None),
    };

    while let Some(event) = rx.recv().await {
        match event {
            // stderr → contains "Duration:" at the start and human-readable progress
            CommandEvent::Stderr(bytes) => {
                stderr_buf.push_str(&String::from_utf8_lossy(&bytes));
                // FFmpeg flushes partial lines; scan for Duration once we have it
                if total_duration == 0.0 {
                    for line in stderr_buf.lines() {
                        if let Some(d) = parse_duration_line(line) {
                            total_duration = d;
                            break;
                        }
                    }
                }
            }
            // stdout → machine-readable progress via `-progress pipe:1`
            CommandEvent::Stdout(bytes) => {
                let text = String::from_utf8_lossy(&bytes);
                for part in text.split('\n') {
                    let part = part.trim();
                    if let Some(v) = part.strip_prefix("out_time_us=") {
                        out_time_us = v.parse().ok();
                    } else if let Some(v) = part.strip_prefix("speed=") {
                        speed = v.trim_end_matches('x').to_string() + "x";
                    } else if part == "progress=continue" || part == "progress=end" {
                        if let Some(us) = out_time_us {
                            let current_secs = us as f64 / 1_000_000.0;
                            let raw_pct = if total_duration > 0.0 {
                                ((current_secs / total_duration) * 100.0)
                                    .clamp(0.0, 100.0) as f32
                            } else {
                                0.0
                            };
                            let percentage = match pass_info {
                                Some((1, 2)) => (raw_pct * 0.5).clamp(0.0, 50.0),
                                Some((2, 2)) => (50.0 + raw_pct * 0.5).clamp(50.0, 100.0),
                                _ => raw_pct,
                            };
                            let _ = app.emit(
                                "conversion_progress",
                                ProgressPayload {
                                    percentage,
                                    current_time: format_secs(current_secs),
                                    speed: speed.clone(),
                                    pass,
                                    total_passes,
                                },
                            );
                        }
                    }
                }
            }
            CommandEvent::Terminated(status) => {
                let mut guard = process_slot.lock().map_err(|e| e.to_string())?;
                *guard = None;

                if cancel_requested.load(Ordering::Acquire) {
                    return Err(cancelled_error());
                }

                // Bundled FFmpeg can return code 0 when -n refuses a file.
                // Do not report that refusal as a successful conversion.
                if stderr_buf.contains("already exists. Exiting.") {
                    return Err(output_exists_error(&output_path));
                }

                return if status.code == Some(0) {
                    let done_pct = match pass_info {
                        Some((1, 2)) => 50.0,
                        _ => 100.0,
                    };
                    let _ = app.emit(
                        "conversion_progress",
                        ProgressPayload {
                            percentage: done_pct,
                            current_time: String::new(),
                            speed: String::new(),
                            pass,
                            total_passes,
                        },
                    );
                    Ok(output_path)
                } else if status.code == Some(255) || status.code == Some(-1) {
                    // Killed by cancel_conversion
                    Err(cancelled_error())
                } else {
                    Err(format!(
                        "FFmpeg exited with code {:?}",
                        status.code
                    ))
                };
            }
            _ => {}
        }
    }

    Ok(output_path)
}

// ─── Commands ────────────────────────────────────────────────────────────────

#[tauri::command(rename_all = "snake_case")]
async fn convert_video(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input_path: String,
    output_path: String,
    resolution: Option<String>,
    codec: Option<String>,
    bitrate: Option<String>,
) -> Result<String, String> {
    let mut args: Vec<String> = vec![
        "-i".into(),
        target_size::safe_media_path(&input_path),
        // machine-readable progress to stdout
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
    ];

    if let Some(res) = &resolution {
        // res is e.g. "1280:720" (FFmpeg uses colon, not 'x', in scale filter)
        let scale = res.replace('x', ":");
        args.extend(["-vf".into(), format!("scale={}", scale)]);
    }

    match codec.as_deref() {
        Some("h264") => args.extend(["-c:v".into(), "libx264".into()]),
        Some("h265") => args.extend(["-c:v".into(), "libx265".into()]),
        Some("vp9") => args.extend(["-c:v".into(), "libvpx-vp9".into()]),
        _ => {} // auto / copy
    }

    if let Some(br) = &bitrate {
        args.extend(["-b:v".into(), br.clone()]);
    }

    // Refuse existing outputs, including files created after our preflight check.
    args.extend([
        "-nostdin".into(),
        "-n".into(),
        target_size::safe_media_path(&output_path),
    ]);

    let _job = start_ffmpeg_job(&state)?;
    let slot = Arc::clone(&state.current_process);
    let cancel = Arc::clone(&state.cancel_requested);
    run_ffmpeg(app, slot, cancel, args, output_path).await
}

#[tauri::command(rename_all = "snake_case")]
async fn convert_audio(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input_path: String,
    output_path: String,
    bitrate: Option<String>,
    sample_rate: Option<String>,
    normalize: bool,
) -> Result<String, String> {
    let mut args: Vec<String> = vec![
        "-i".into(),
        target_size::safe_media_path(&input_path),
        "-progress".into(),
        "pipe:1".into(),
        "-nostats".into(),
        "-vn".into(), // strip video stream
    ];

    if let Some(br) = &bitrate {
        args.extend(["-b:a".into(), br.clone()]);
    }

    if let Some(sr) = &sample_rate {
        args.extend(["-ar".into(), sr.clone()]);
    }

    if normalize {
        args.extend(["-af".into(), "loudnorm".into()]);
    }

    args.extend([
        "-nostdin".into(),
        "-n".into(),
        target_size::safe_media_path(&output_path),
    ]);

    let _job = start_ffmpeg_job(&state)?;
    let slot = Arc::clone(&state.current_process);
    let cancel = Arc::clone(&state.cancel_requested);
    run_ffmpeg(app, slot, cancel, args, output_path).await
}

#[tauri::command(rename_all = "snake_case")]
async fn cancel_conversion(state: tauri::State<'_, AppState>) -> Result<(), String> {
    request_cancellation(&state)
}

fn request_cancellation(state: &AppState) -> Result<(), String> {
    let mut guard = state
        .current_process
        .lock()
        .map_err(|e| e.to_string())?;
    // Serialize with start_ffmpeg_job so a fresh cancellation cannot be
    // overwritten by its initialization, or race with registering the child.
    if state.ffmpeg_busy.load(Ordering::Acquire) {
        state.cancel_requested.store(true, Ordering::Release);
    }
    if let Some(child) = guard.take() {
        child.kill().map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn parse_ffprobe_json(v: &serde_json::Value, file_size: u64) -> MediaInfo {
    let format = &v["format"];
    let streams = v["streams"].as_array().cloned().unwrap_or_default();

    let mut duration: f64 = format["duration"]
        .as_str()
        .and_then(|s| s.parse().ok())
        .filter(|d: &f64| d.is_finite() && *d > 0.0)
        .unwrap_or(0.0);

    let bitrate = format["bit_rate"]
        .as_str()
        .and_then(|s| s.parse::<u64>().ok())
        .map(|bps| format!("{} kbps", bps / 1000));

    let mut width = None;
    let mut height = None;
    let mut video_codec = None;
    let mut audio_codec = None;
    let mut fps = None;
    let mut audio_bitrate_kbps = None;

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
                // Skip attached cover art / thumbnail pictures
                if stream["disposition"]["attached_pic"].as_i64() == Some(1) {
                    continue;
                }
                if video_codec.is_none() {
                    width = stream["width"].as_u64().map(|v| v as u32);
                    height = stream["height"].as_u64().map(|v| v as u32);
                    video_codec = stream["codec_name"].as_str().map(String::from);
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
            "audio" if audio_codec.is_none() => {
                audio_codec = stream["codec_name"].as_str().map(String::from);
                audio_bitrate_kbps = stream["bit_rate"]
                    .as_str()
                    .and_then(|s| s.parse::<u64>().ok())
                    .map(|bps| (bps / 1000) as u32);
            }
            _ => {}
        }
    }

    let has_audio = audio_codec.is_some();

    MediaInfo {
        duration,
        width,
        height,
        video_codec,
        audio_codec,
        file_size,
        bitrate,
        fps,
        audio_bitrate_kbps,
        has_audio,
    }
}

#[tauri::command(rename_all = "snake_case")]
async fn get_media_info(
    app: tauri::AppHandle,
    input_path: String,
) -> Result<MediaInfo, String> {
    let file_size = std::fs::metadata(&input_path)
        .map(|m| m.len())
        .unwrap_or(0);
    let safe_input = target_size::safe_media_path(&input_path);

    let (mut rx, _child) = app
        .shell()
        .sidecar("ffprobe")
        .map_err(|e| e.to_string())?
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
            "-i",
            &safe_input,
        ])
        .spawn()
        .map_err(|e| e.to_string())?;

    let mut stdout_data = Vec::new();
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => stdout_data.extend(bytes),
            CommandEvent::Terminated(_) => break,
            _ => {}
        }
    }

    let v: serde_json::Value = serde_json::from_slice(&stdout_data)
        .map_err(|e| format!("ffprobe parse error: {}", e))?;

    Ok(parse_ffprobe_json(&v, file_size))
}

// ─── Target-size 2-pass video compression ────────────────────────────────────

#[tauri::command(rename_all = "snake_case")]
async fn estimate_target_size(
    app: tauri::AppHandle,
    input_path: String,
    target_mb: f64,
    codec: Option<String>,
) -> Result<target_size::TargetSizeEstimate, String> {
    let _ = codec;
    let info = get_media_info(app, input_path).await?;
    target_size::compute_target_size_plan(
        target_mb,
        info.duration,
        info.file_size,
        info.width.unwrap_or(1920),
        info.height.unwrap_or(1080),
        info.fps.unwrap_or(30.0),
        info.has_audio,
    )
}

#[allow(clippy::too_many_arguments)]
async fn execute_two_pass_attempt(
    app: &tauri::AppHandle,
    slot: &Arc<Mutex<Option<CommandChild>>>,
    cancel: &Arc<AtomicBool>,
    input_path: &str,
    output_path: &str,
    plan: &target_size::TargetSizeEstimate,
    codec: Option<&str>,
    video_kbps: u32,
) -> Result<(), String> {
    let pass_dir = target_size::PassLogDir::new()?;

    let pass1_args = target_size::build_two_pass_ffmpeg_args(
        input_path,
        output_path,
        plan,
        codec,
        1,
        pass_dir.path(),
        video_kbps,
    );
    run_ffmpeg_with_pass(
        app.clone(),
        Arc::clone(slot),
        Arc::clone(cancel),
        pass1_args,
        output_path.to_string(),
        false,
        Some((1, 2)),
    )
    .await?;

    let pass2_args = target_size::build_two_pass_ffmpeg_args(
        input_path,
        output_path,
        plan,
        codec,
        2,
        pass_dir.path(),
        video_kbps,
    );
    let pass2_res = run_ffmpeg_with_pass(
        app.clone(),
        Arc::clone(slot),
        Arc::clone(cancel),
        pass2_args,
        output_path.to_string(),
        false,
        Some((2, 2)),
    )
    .await;

    if let Err(ref e) = pass2_res {
        if *e != output_exists_error(output_path) {
            let _ = std::fs::remove_file(output_path);
        }
    }
    pass2_res.map(|_| ())
}

fn copy_file_create_new(input_path: &str, output_path: &str) -> Result<(), String> {
    use std::io::Write;
    let mut reader = std::fs::File::open(input_path).map_err(|e| e.to_string())?;
    let file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(output_path)
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                output_exists_error(output_path)
            } else {
                e.to_string()
            }
        })?;
    let copy_res = (|| -> Result<(), String> {
        let mut writer = std::io::BufWriter::new(file);
        std::io::copy(&mut reader, &mut writer).map_err(|e| e.to_string())?;
        writer.flush().map_err(|e| e.to_string())
    })();
    if copy_res.is_err() {
        let _ = std::fs::remove_file(output_path);
    }
    copy_res
}

fn has_mp4_extension(path: &str) -> bool {
    std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("mp4"))
        .unwrap_or(false)
}

#[allow(clippy::too_many_arguments)]
async fn compress_single_video_impl(
    app: tauri::AppHandle,
    slot: Arc<Mutex<Option<CommandChild>>>,
    cancel: Arc<AtomicBool>,
    input_path: String,
    output_path: String,
    target_mb: f64,
    codec: Option<String>,
    copy_if_under: bool,
) -> Result<String, String> {
    if cancel.load(Ordering::Acquire) {
        return Err(cancelled_error());
    }
    ensure_output_available(&output_path)?;

    let info = get_media_info(app.clone(), input_path.clone()).await?;
    let plan = target_size::compute_target_size_plan(
        target_mb,
        info.duration,
        info.file_size,
        info.width.unwrap_or(1920),
        info.height.unwrap_or(1080),
        info.fps.unwrap_or(30.0),
        info.has_audio,
    )?;

    if plan.already_under_target && copy_if_under {
        if has_mp4_extension(&input_path) {
            copy_file_create_new(&input_path, &output_path)?;
            let _ = app.emit(
                "conversion_progress",
                ProgressPayload {
                    percentage: 100.0,
                    current_time: String::new(),
                    speed: String::new(),
                    pass: None,
                    total_passes: None,
                },
            );
            return Ok(output_path);
        }

        // Source is not an MP4 container: try fast stream-copy remux into MP4 first.
        let remux_args: Vec<String> = vec![
            "-nostdin".into(),
            "-i".into(),
            target_size::safe_media_path(&input_path),
            "-progress".into(),
            "pipe:1".into(),
            "-nostats".into(),
            "-map".into(),
            "0:v:0".into(),
            "-map".into(),
            "0:a:0?".into(),
            "-c".into(),
            "copy".into(),
            "-sn".into(),
            "-movflags".into(),
            "+faststart".into(),
            "-n".into(),
            target_size::safe_media_path(&output_path),
        ];

        match run_ffmpeg_with_pass(
            app.clone(),
            Arc::clone(&slot),
            Arc::clone(&cancel),
            remux_args,
            output_path.clone(),
            false,
            None,
        )
        .await
        {
            Ok(_) => {
                if let Ok(meta) = std::fs::metadata(&output_path) {
                    if meta.len() <= plan.target_bytes {
                        return Ok(output_path);
                    }
                }
                let _ = std::fs::remove_file(&output_path);
            }
            Err(e) if e == output_exists_error(&output_path) => {
                return Err(e);
            }
            Err(e) if e == cancelled_error() => {
                let _ = std::fs::remove_file(&output_path);
                return Err(e);
            }
            Err(_) => {
                let _ = std::fs::remove_file(&output_path);
            }
        }
    }

    execute_two_pass_attempt(
        &app,
        &slot,
        &cancel,
        &input_path,
        &output_path,
        &plan,
        codec.as_deref(),
        plan.video_kbps,
    )
    .await?;

    let actual_bytes = std::fs::metadata(&output_path)
        .map_err(|e| e.to_string())?
        .len();

    if actual_bytes <= plan.target_bytes {
        return Ok(output_path);
    }

    // Output exceeded target size: remove first output and retry ONCE with video bitrate reduced by 10%.
    let _ = std::fs::remove_file(&output_path);
    let retry_kbps = target_size::scale_kbps_for_retry(plan.video_kbps);

    execute_two_pass_attempt(
        &app,
        &slot,
        &cancel,
        &input_path,
        &output_path,
        &plan,
        codec.as_deref(),
        retry_kbps,
    )
    .await?;

    let retry_bytes = std::fs::metadata(&output_path)
        .map_err(|e| e.to_string())?
        .len();

    if retry_bytes <= plan.target_bytes {
        Ok(output_path)
    } else {
        let _ = std::fs::remove_file(&output_path);
        Err(format!(
            "Target size exceeded after retry ({} > {:.1} MB)",
            format_byte_size(retry_bytes),
            target_mb
        ))
    }
}

#[tauri::command(rename_all = "snake_case")]
async fn compress_video_to_size(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input_path: String,
    output_path: String,
    target_mb: f64,
    codec: Option<String>,
    copy_if_under: Option<bool>,
) -> Result<String, String> {
    let _job = start_ffmpeg_job(&state)?;
    let slot = Arc::clone(&state.current_process);
    let cancel = Arc::clone(&state.cancel_requested);
    compress_single_video_impl(
        app,
        slot,
        cancel,
        input_path,
        output_path,
        target_mb,
        codec,
        copy_if_under.unwrap_or(false),
    )
    .await
}

#[tauri::command(rename_all = "snake_case")]
async fn compress_video_batch_to_size(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    files: Vec<BatchMediaItem>,
    target_mb: f64,
    codec: Option<String>,
    copy_if_under: Option<bool>,
) -> Result<Vec<BatchResult>, String> {
    let _job = start_ffmpeg_job(&state)?;
    let total = files.len();
    let mut results: Vec<BatchResult> = Vec::with_capacity(total);
    let copy_under = copy_if_under.unwrap_or(true);

    for (i, item) in files.into_iter().enumerate() {
        if state.cancel_requested.load(Ordering::Acquire) {
            return Err(cancelled_error());
        }

        let file_name = std::path::Path::new(&item.input_path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let _ = app.emit(
            "batch_progress",
            BatchProgressPayload {
                index: i,
                total,
                current_file: file_name,
                percentage: (i as f32 / total as f32) * 100.0,
            },
        );

        let slot = Arc::clone(&state.current_process);
        let cancel = Arc::clone(&state.cancel_requested);
        let res = compress_single_video_impl(
            app.clone(),
            slot,
            cancel,
            item.input_path.clone(),
            item.output_path.clone(),
            target_mb,
            codec.clone(),
            copy_under,
        )
        .await;

        let cancelled = matches!(res, Err(ref e) if *e == cancelled_error());
        results.push(BatchResult {
            input: item.input_path,
            output: item.output_path,
            success: res.is_ok(),
            error: res.err(),
        });

        if cancelled {
            return Err(cancelled_error());
        }
    }

    let _ = app.emit(
        "batch_progress",
        BatchProgressPayload {
            index: total,
            total,
            current_file: String::new(),
            percentage: 100.0,
        },
    );

    Ok(results)
}

// ─── Image types ─────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct ResizeOptions {
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub keep_aspect_ratio: bool,
}

#[derive(Serialize, Clone)]
pub struct ImageInfo {
    pub width: u32,
    pub height: u32,
    pub format: String,
    pub file_size: u64,
    pub has_alpha: bool,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct BatchImageItem {
    pub input_path: String,
    pub output_path: String,
}

#[derive(Serialize, Clone)]
pub struct BatchResult {
    pub input: String,
    pub output: String,
    pub success: bool,
    pub error: Option<String>,
}

/// Generic item for video/audio batch: input path + pre-computed output path.
#[derive(Serialize, Deserialize, Clone)]
pub struct BatchMediaItem {
    pub input_path: String,
    pub output_path: String,
}

#[derive(Serialize, Clone)]
struct BatchProgressPayload {
    index: usize,
    total: usize,
    current_file: String,
    percentage: f32,
}

#[derive(Serialize, Clone)]
struct ImageProgressPayload {
    percentage: f32,
    current_file: Option<String>,
}

// ─── Image helpers ────────────────────────────────────────────────────────────

fn output_exists_error(path: &str) -> String {
    format!("Le fichier de sortie existe déjà : {}. Choisissez un autre dossier de destination.", path)
}

/// Also reject directories and dangling symlinks; neither is a free output path.
fn ensure_output_available(path: &str) -> Result<(), String> {
    match std::fs::symlink_metadata(path) {
        Ok(_) => Err(output_exists_error(path)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Load, optionally resize, and save an image to the target format with
/// optional quality (applies to JPEG only; WebP/PNG/BMP/TIFF use defaults).
fn process_single_image(
    input_path: &str,
    output_path: &str,
    format: &str,
    quality: Option<u8>,
    resize: Option<&ResizeOptions>,
) -> Result<(), String> {
    use image::imageops::FilterType;
    use std::io::Write;

    ensure_output_available(output_path)?;
    let output_format = match format.to_lowercase().as_str() {
        "jpg" | "jpeg" => image::ImageFormat::Jpeg,
        "webp" => image::ImageFormat::WebP,
        "png" => image::ImageFormat::Png,
        "bmp" => image::ImageFormat::Bmp,
        "tiff" | "tif" => image::ImageFormat::Tiff,
        other => return Err(format!("Format non supporté : {}", other)),
    };

    let mut img = image::open(input_path)
        .map_err(|e| format!("Impossible d'ouvrir l'image : {}", e))?;

    // ── Resize ────────────────────────────────────────────────────────────────
    if let Some(r) = resize {
        let (orig_w, orig_h) = (img.width(), img.height());
        let (new_w, new_h) = match (r.width, r.height, r.keep_aspect_ratio) {
            // Both dims, no ratio constraint
            (Some(w), Some(h), false) => (w, h),
            // Both dims, keep ratio (fit inside the box)
            (Some(w), Some(h), true) => {
                let ratio = (w as f64 / orig_w as f64).min(h as f64 / orig_h as f64);
                (
                    (orig_w as f64 * ratio).round() as u32,
                    (orig_h as f64 * ratio).round() as u32,
                )
            }
            // Only width — height follows ratio
            (Some(w), None, _) => {
                let ratio = w as f64 / orig_w as f64;
                (w, (orig_h as f64 * ratio).round() as u32)
            }
            // Only height — width follows ratio
            (None, Some(h), _) => {
                let ratio = h as f64 / orig_h as f64;
                ((orig_w as f64 * ratio).round() as u32, h)
            }
            _ => (orig_w, orig_h),
        };

        if new_w != orig_w || new_h != orig_h {
            img = img.resize_exact(new_w, new_h, FilterType::Lanczos3);
        }
    }

    // ── Encode ────────────────────────────────────────────────────────────────
    let quality = quality.unwrap_or(85);

    // JPEG cannot retain alpha. Composite over white instead of silently
    // turning transparent areas black; also normalize higher bit depths to RGB8.
    if output_format == image::ImageFormat::Jpeg {
        let rgb = if img.color().has_alpha() {
            let rgba = img.to_rgba8();
            image::RgbImage::from_fn(rgba.width(), rgba.height(), |x, y| {
                let pixel = rgba.get_pixel(x, y);
                let alpha = u32::from(pixel[3]);
                image::Rgb(std::array::from_fn(|channel| {
                    ((u32::from(pixel[channel]) * alpha + 255 * (255 - alpha) + 127) / 255) as u8
                }))
            })
        } else {
            img.to_rgb8()
        };
        img = image::DynamicImage::ImageRgb8(rgb);
    }

    // Reserve the output atomically; never truncate another conversion's file.
    let file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(output_path)
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                output_exists_error(output_path)
            } else {
                e.to_string()
            }
        })?;
    let result = (|| -> Result<(), String> {
        let mut writer = std::io::BufWriter::new(file);
        if output_format == image::ImageFormat::Jpeg {
            let encoder =
                image::codecs::jpeg::JpegEncoder::new_with_quality(&mut writer, quality);
            img.write_with_encoder(encoder).map_err(|e| e.to_string())?;
        } else {
            img.write_to(&mut writer, output_format).map_err(|e| e.to_string())?;
        }
        writer.flush().map_err(|e| e.to_string())
    })();
    // The writer is closed before removing an incomplete file, also on Windows.
    if result.is_err() {
        let _ = std::fs::remove_file(output_path);
    }
    result
}

// ─── Image commands ───────────────────────────────────────────────────────────

#[tauri::command(rename_all = "snake_case")]
async fn convert_image(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    input_path: String,
    output_path: String,
    format: String,
    quality: Option<u8>,
    resize: Option<ResizeOptions>,
) -> Result<String, String> {
    let _job = JobGuard::try_acquire(&state.image_busy)?;
    let out = output_path.clone();

    tauri::async_runtime::spawn_blocking(move || {
        process_single_image(&input_path, &output_path, &format, quality, resize.as_ref())
    })
    .await
    .map_err(|e| e.to_string())??;

    let _ = app.emit(
        "image_progress",
        ImageProgressPayload {
            percentage: 100.0,
            current_file: None,
        },
    );

    Ok(out)
}

#[tauri::command(rename_all = "snake_case")]
async fn convert_images_batch(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    files: Vec<BatchImageItem>,
    format: String,
    quality: Option<u8>,
    resize: Option<ResizeOptions>,
) -> Result<Vec<BatchResult>, String> {
    let _job = JobGuard::try_acquire(&state.image_busy)?;
    let total = files.len();
    let mut results: Vec<BatchResult> = Vec::with_capacity(total);

    for (i, item) in files.into_iter().enumerate() {
        let file_name = std::path::Path::new(&item.input_path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let _ = app.emit(
            "image_progress",
            ImageProgressPayload {
                percentage: (i as f32 / total as f32) * 100.0,
                current_file: Some(file_name),
            },
        );

        let input = item.input_path.clone();
        let output = item.output_path.clone();
        let fmt = format.clone();
        let resize_clone = resize.clone();

        let result = tauri::async_runtime::spawn_blocking(move || {
            process_single_image(&input, &output, &fmt, quality, resize_clone.as_ref())
        })
        .await
        .map_err(|e| e.to_string())?;

        results.push(BatchResult {
            input: item.input_path,
            output: item.output_path,
            success: result.is_ok(),
            error: result.err(),
        });
    }

    let _ = app.emit(
        "image_progress",
        ImageProgressPayload {
            percentage: 100.0,
            current_file: None,
        },
    );

    Ok(results)
}

#[tauri::command(rename_all = "snake_case")]
async fn get_image_info(input_path: String) -> Result<ImageInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let file_size = std::fs::metadata(&input_path)
            .map(|m| m.len())
            .unwrap_or(0);

        let reader = image::ImageReader::open(&input_path)
            .map_err(|e| format!("Impossible d'ouvrir : {}", e))?
            .with_guessed_format()
            .map_err(|e| format!("Format non reconnu : {}", e))?;

        let format_str = reader
            .format()
            .map(|f| format!("{:?}", f).to_lowercase())
            .unwrap_or_else(|| "unknown".to_string());

        let img = reader
            .decode()
            .map_err(|e| format!("Impossible de décoder : {}", e))?;

        let (width, height) = (img.width(), img.height());

        let has_alpha = matches!(
            img.color(),
            image::ColorType::Rgba8
                | image::ColorType::Rgba16
                | image::ColorType::Rgba32F
                | image::ColorType::La8
                | image::ColorType::La16
        );

        Ok::<ImageInfo, String>(ImageInfo {
            width,
            height,
            format: format_str,
            file_size,
            has_alpha,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

// ─── Video batch ─────────────────────────────────────────────────────────────

#[tauri::command(rename_all = "snake_case")]
async fn convert_video_batch(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    files: Vec<BatchMediaItem>,
    resolution: Option<String>,
    codec: Option<String>,
    bitrate: Option<String>,
) -> Result<Vec<BatchResult>, String> {
    let _job = start_ffmpeg_job(&state)?;
    let total = files.len();
    let mut results: Vec<BatchResult> = Vec::with_capacity(total);

    for (i, item) in files.into_iter().enumerate() {
        // Also catches a cancel issued between two files, when no process runs.
        if state.cancel_requested.load(Ordering::Acquire) {
            return Err(cancelled_error());
        }

        let file_name = std::path::Path::new(&item.input_path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let _ = app.emit(
            "batch_progress",
            BatchProgressPayload {
                index: i,
                total,
                current_file: file_name.clone(),
                percentage: (i as f32 / total as f32) * 100.0,
            },
        );

        let mut args: Vec<String> = vec![
            "-i".into(),
            target_size::safe_media_path(&item.input_path),
            "-progress".into(),
            "pipe:1".into(),
            "-nostats".into(),
        ];

        if let Some(res) = &resolution {
            let scale = res.replace('x', ":");
            args.extend(["-vf".into(), format!("scale={}", scale)]);
        }

        match codec.as_deref() {
            Some("h264") => args.extend(["-c:v".into(), "libx264".into()]),
            Some("h265") => args.extend(["-c:v".into(), "libx265".into()]),
            Some("vp9") => args.extend(["-c:v".into(), "libvpx-vp9".into()]),
            _ => {}
        }

        if let Some(br) = &bitrate {
            args.extend(["-b:v".into(), br.clone()]);
        }

        args.extend([
            "-nostdin".into(),
            "-n".into(),
            target_size::safe_media_path(&item.output_path),
        ]);

        let slot = Arc::clone(&state.current_process);
        let cancel = Arc::clone(&state.cancel_requested);
        let result = run_ffmpeg(app.clone(), slot, cancel, args, item.output_path.clone()).await;

        let cancelled = matches!(result, Err(ref e) if *e == cancelled_error());
        results.push(BatchResult {
            input: item.input_path,
            output: item.output_path,
            success: result.is_ok(),
            error: result.err(),
        });

        if cancelled {
            return Err(cancelled_error());
        }
    }

    let _ = app.emit(
        "batch_progress",
        BatchProgressPayload {
            index: total,
            total,
            current_file: String::new(),
            percentage: 100.0,
        },
    );

    Ok(results)
}

// ─── Audio batch ──────────────────────────────────────────────────────────────

#[tauri::command(rename_all = "snake_case")]
async fn convert_audio_batch(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    files: Vec<BatchMediaItem>,
    bitrate: Option<String>,
    sample_rate: Option<String>,
    normalize: bool,
) -> Result<Vec<BatchResult>, String> {
    let _job = start_ffmpeg_job(&state)?;
    let total = files.len();
    let mut results: Vec<BatchResult> = Vec::with_capacity(total);

    for (i, item) in files.into_iter().enumerate() {
        // Also catches a cancel issued between two files, when no process runs.
        if state.cancel_requested.load(Ordering::Acquire) {
            return Err(cancelled_error());
        }

        let file_name = std::path::Path::new(&item.input_path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        let _ = app.emit(
            "batch_progress",
            BatchProgressPayload {
                index: i,
                total,
                current_file: file_name.clone(),
                percentage: (i as f32 / total as f32) * 100.0,
            },
        );

        let mut args: Vec<String> = vec![
            "-i".into(),
            target_size::safe_media_path(&item.input_path),
            "-progress".into(),
            "pipe:1".into(),
            "-nostats".into(),
            "-vn".into(),
        ];

        if let Some(br) = &bitrate {
            args.extend(["-b:a".into(), br.clone()]);
        }

        if let Some(sr) = &sample_rate {
            args.extend(["-ar".into(), sr.clone()]);
        }

        if normalize {
            args.extend(["-af".into(), "loudnorm".into()]);
        }

        args.extend([
            "-nostdin".into(),
            "-n".into(),
            target_size::safe_media_path(&item.output_path),
        ]);

        let slot = Arc::clone(&state.current_process);
        let cancel = Arc::clone(&state.cancel_requested);
        let result = run_ffmpeg(app.clone(), slot, cancel, args, item.output_path.clone()).await;

        let cancelled = matches!(result, Err(ref e) if *e == cancelled_error());
        results.push(BatchResult {
            input: item.input_path,
            output: item.output_path,
            success: result.is_ok(),
            error: result.err(),
        });

        if cancelled {
            return Err(cancelled_error());
        }
    }

    let _ = app.emit(
        "batch_progress",
        BatchProgressPayload {
            index: total,
            total,
            current_file: String::new(),
            percentage: 100.0,
        },
    );

    Ok(results)
}

// ─── Settings ────────────────────────────────────────────────────────────────

fn default_discord_mb() -> f64 {
    10.0
}
fn default_whatsapp_mb() -> f64 {
    16.0
}
fn default_gmail_mb() -> f64 {
    25.0
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Settings {
    pub language: String,
    pub theme: String,
    pub output_dir: Option<String>,
    pub default_video_format: String,
    pub default_audio_format: String,
    pub default_image_format: String,
    #[serde(default = "default_discord_mb")]
    pub preset_discord_mb: f64,
    #[serde(default = "default_whatsapp_mb")]
    pub preset_whatsapp_mb: f64,
    #[serde(default = "default_gmail_mb")]
    pub preset_gmail_mb: f64,
    #[serde(default)]
    pub context_menu_enabled: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            language: "en".to_string(),
            theme: "dark".to_string(),
            output_dir: None,
            default_video_format: "mp4".to_string(),
            default_audio_format: "mp3".to_string(),
            default_image_format: "webp".to_string(),
            preset_discord_mb: default_discord_mb(),
            preset_whatsapp_mb: default_whatsapp_mb(),
            preset_gmail_mb: default_gmail_mb(),
            context_menu_enabled: false,
        }
    }
}

#[tauri::command(rename_all = "snake_case")]
async fn get_settings(app: tauri::AppHandle) -> Result<Settings, String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    let d = Settings::default();
    let language = store.get("language")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or(d.language);
    let theme = store.get("theme")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or(d.theme);
    let output_dir = store.get("output_dir")
        .and_then(|v| if v.is_null() { None } else { v.as_str().map(String::from) });
    let default_video_format = store.get("default_video_format")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or(d.default_video_format);
    let default_audio_format = store.get("default_audio_format")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or(d.default_audio_format);
    let default_image_format = store.get("default_image_format")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or(d.default_image_format);
    let preset_discord_mb = store.get("preset_discord_mb")
        .and_then(|v| v.as_f64())
        .filter(|v| v.is_finite() && *v > 0.1)
        .unwrap_or(d.preset_discord_mb);
    let preset_whatsapp_mb = store.get("preset_whatsapp_mb")
        .and_then(|v| v.as_f64())
        .filter(|v| v.is_finite() && *v > 0.1)
        .unwrap_or(d.preset_whatsapp_mb);
    let preset_gmail_mb = store.get("preset_gmail_mb")
        .and_then(|v| v.as_f64())
        .filter(|v| v.is_finite() && *v > 0.1)
        .unwrap_or(d.preset_gmail_mb);
    let context_menu_enabled = store.get("context_menu_enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or_else(|| context_menu::is_context_menu_registered().unwrap_or(false));
    Ok(Settings {
        language,
        theme,
        output_dir,
        default_video_format,
        default_audio_format,
        default_image_format,
        preset_discord_mb,
        preset_whatsapp_mb,
        preset_gmail_mb,
        context_menu_enabled,
    })
}

#[tauri::command(rename_all = "snake_case")]
async fn save_settings(app: tauri::AppHandle, settings: Settings) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set("language", serde_json::json!(settings.language));
    store.set("theme", serde_json::json!(settings.theme));
    store.set("output_dir", serde_json::json!(settings.output_dir));
    store.set("default_video_format", serde_json::json!(settings.default_video_format));
    store.set("default_audio_format", serde_json::json!(settings.default_audio_format));
    store.set("default_image_format", serde_json::json!(settings.default_image_format));
    store.set("preset_discord_mb", serde_json::json!(settings.preset_discord_mb));
    store.set("preset_whatsapp_mb", serde_json::json!(settings.preset_whatsapp_mb));
    store.set("preset_gmail_mb", serde_json::json!(settings.preset_gmail_mb));
    store.set("context_menu_enabled", serde_json::json!(settings.context_menu_enabled));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

// ─── Context Menu & Platform Commands ────────────────────────────────────────

const FALLBACK_THIRD_PARTY_NOTICES: &str = "\
# Third-Party Notices & Licenses — Kompri

Kompri bundles external FFmpeg and FFprobe binaries as sidecar executables and uses open-source libraries.

## FFmpeg & FFprobe (Bundled Sidecar Binaries)
- **License**: GNU General Public License v3.0 (GPL-3.0) — bundled builds are compiled with `--enable-gpl` and include `libx264` and `libx265` (upgrading LGPL components to GPL v3).
- **Official FFmpeg Source Code**: https://ffmpeg.org/download.html
- **Full License Text**: https://www.gnu.org/licenses/gpl-3.0.html (also bundled in `licenses/FFmpeg-GPLv3.txt`)
- **Platform Builds**:
  - **Windows (`x86_64`)**: gyan.dev FFmpeg release essentials — https://www.gyan.dev/ffmpeg/builds/
  - **macOS (`aarch64`)**: eugeneware/ffmpeg-static (`b6.1.1`) — https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1
  - **Linux (`x86_64`)**: John Van Sickle static builds — https://johnvansickle.com/ffmpeg/

## Included Video Codecs
- **x264 (H.264 / AVC)**: GPL-2.0-or-later — https://www.videolan.org/developers/x264.html
- **x265 (H.265 / HEVC)**: GPL-2.0-or-later — https://www.videolan.org/developers/x265.html

## Application Frameworks & Libraries
- **Tauri & Official Plugins**: Apache-2.0 OR MIT — https://github.com/tauri-apps/tauri
- **Rust Crates** (`serde`, `serde_json`, `image`, `winreg`): MIT / Apache-2.0
- **Frontend Packages** (`react`, `react-dom`, `i18next`, `react-i18next`): MIT
";

fn load_third_party_notices_from_candidates(candidates: &[std::path::PathBuf]) -> String {
    for path in candidates {
        if let Ok(content) = std::fs::read_to_string(path) {
            if !content.trim().is_empty() {
                return content;
            }
        }
    }

    FALLBACK_THIRD_PARTY_NOTICES.to_string()
}

/// Return the contents of `THIRD_PARTY_NOTICES.md` from bundled resources or the workspace root,
/// falling back to the embedded notice text if no file is found on disk.
#[tauri::command(rename_all = "snake_case")]
fn get_third_party_notices() -> String {
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            candidates.push(exe_dir.join("_up_").join("THIRD_PARTY_NOTICES.md"));
            candidates.push(exe_dir.join("THIRD_PARTY_NOTICES.md"));
            candidates.push(
                exe_dir
                    .join("..")
                    .join("Resources")
                    .join("_up_")
                    .join("THIRD_PARTY_NOTICES.md"),
            );
            candidates.push(
                exe_dir
                    .join("..")
                    .join("Resources")
                    .join("THIRD_PARTY_NOTICES.md"),
            );
            candidates.push(
                exe_dir
                    .join("..")
                    .join("lib")
                    .join("Kompri")
                    .join("_up_")
                    .join("THIRD_PARTY_NOTICES.md"),
            );
            candidates.push(
                exe_dir
                    .join("..")
                    .join("lib")
                    .join("kompri")
                    .join("_up_")
                    .join("THIRD_PARTY_NOTICES.md"),
            );
        }
    }
    candidates.push(std::path::PathBuf::from("THIRD_PARTY_NOTICES.md"));
    candidates.push(std::path::PathBuf::from("..").join("THIRD_PARTY_NOTICES.md"));

    load_third_party_notices_from_candidates(&candidates)
}

#[tauri::command(rename_all = "snake_case")]
fn get_platform() -> String {
    context_menu::current_platform().to_string()
}

#[tauri::command(rename_all = "snake_case")]
async fn get_context_menu_status() -> Result<bool, String> {
    context_menu::is_context_menu_registered()
}

#[tauri::command(rename_all = "snake_case")]
async fn set_context_menu_enabled(
    app: tauri::AppHandle,
    enabled: bool,
    language: Option<String>,
) -> Result<bool, String> {
    let lang = language.unwrap_or_else(|| "en".to_string());
    let status = if enabled {
        context_menu::register_context_menu(&lang)?
    } else {
        context_menu::unregister_context_menu()?
    };
    if let Ok(store) = app.store("settings.json") {
        store.set("context_menu_enabled", serde_json::json!(status));
        let _ = store.save();
    }
    Ok(status)
}

// ─── CLI & Single-Instance Runtime ───────────────────────────────────────────

#[derive(Clone, Default)]
pub struct CliRuntimeState {
    pub startup: Arc<Mutex<cli::CliStartupState>>,
    pub job_lock: Arc<tauri::async_runtime::Mutex<()>>,
}

#[derive(Serialize, Clone)]
struct CliJobStatusPayload {
    status: String,
    current_file: String,
    index: usize,
    total: usize,
    percentage: f32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pass: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    total_passes: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    output_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn emit_cli_job_status(app: &tauri::AppHandle, payload: CliJobStatusPayload) {
    if let Some(cli_state) = app.try_state::<CliRuntimeState>() {
        if let Ok(mut guard) = cli_state.startup.lock() {
            guard.latest_job_status = serde_json::to_value(&payload).ok();
        }
    }
    let _ = app.emit("cli-job-status", payload);
}

#[derive(Serialize, Clone)]
struct CliOpenFilesPayload {
    files: Vec<String>,
    section: String,
}

#[tauri::command(rename_all = "snake_case")]
async fn get_cli_state(
    cli_state: tauri::State<'_, CliRuntimeState>,
) -> Result<cli::CliStartupState, String> {
    let guard = cli_state.startup.lock().map_err(|e| e.to_string())?;
    Ok(guard.clone())
}

async fn execute_cli_file_action(
    app: &tauri::AppHandle,
    state: &AppState,
    action: &cli::CliAction,
    input_path: &str,
) -> Result<String, String> {
    let settings = get_settings(app.clone()).await.unwrap_or_default();
    match action {
        cli::CliAction::Compress { preset } => {
            let (target_mb, suffix) = match preset.as_str() {
                "discord" => (settings.preset_discord_mb, "_discord"),
                "whatsapp" => (settings.preset_whatsapp_mb, "_whatsapp"),
                "gmail" => (settings.preset_gmail_mb, "_gmail"),
                _ => (settings.preset_discord_mb, "_compressed"),
            };
            let output_path = cli::build_unique_cli_output_path(input_path, suffix, "mp4");
            let _job = start_ffmpeg_job(state)?;
            let slot = Arc::clone(&state.current_process);
            let cancel = Arc::clone(&state.cancel_requested);
            compress_single_video_impl(
                app.clone(),
                slot,
                cancel,
                input_path.to_string(),
                output_path,
                target_mb,
                Some("h264".to_string()),
                true,
            )
            .await
        }
        cli::CliAction::Convert { to } => {
            let output_path = cli::build_unique_cli_output_path(input_path, "_converted", to);
            let section = cli::detect_media_section(input_path);
            match (section, to.as_str()) {
                ("image", _) | (_, "jpg" | "jpeg" | "png" | "webp" | "bmp" | "tiff" | "tif") => {
                    let _job = JobGuard::try_acquire(&state.image_busy)?;
                    let inp = input_path.to_string();
                    let out = output_path.clone();
                    let fmt = to.clone();
                    tauri::async_runtime::spawn_blocking(move || {
                        process_single_image(&inp, &out, &fmt, Some(85), None)
                    })
                    .await
                    .map_err(|e| e.to_string())??;
                    Ok(output_path)
                }
                (_, "mp3" | "flac" | "wav" | "ogg" | "aac" | "m4a") => {
                    let _job = start_ffmpeg_job(state)?;
                    let slot = Arc::clone(&state.current_process);
                    let cancel = Arc::clone(&state.cancel_requested);
                    let args: Vec<String> = vec![
                        "-i".into(),
                        target_size::safe_media_path(input_path),
                        "-progress".into(),
                        "pipe:1".into(),
                        "-nostats".into(),
                        "-vn".into(),
                        "-nostdin".into(),
                        "-n".into(),
                        target_size::safe_media_path(&output_path),
                    ];
                    run_ffmpeg(app.clone(), slot, cancel, args, output_path).await
                }
                _ => {
                    let _job = start_ffmpeg_job(state)?;
                    let slot = Arc::clone(&state.current_process);
                    let cancel = Arc::clone(&state.cancel_requested);
                    let args: Vec<String> = vec![
                        "-i".into(),
                        target_size::safe_media_path(input_path),
                        "-progress".into(),
                        "pipe:1".into(),
                        "-nostats".into(),
                        "-nostdin".into(),
                        "-n".into(),
                        target_size::safe_media_path(&output_path),
                    ];
                    run_ffmpeg(app.clone(), slot, cancel, args, output_path).await
                }
            }
        }
        cli::CliAction::Open => Ok(input_path.to_string()),
    }
}

fn spawn_cli_request_handler(app: tauri::AppHandle, req: cli::CliRequest) {
    if matches!(req.action, cli::CliAction::Open) {
        let section = req
            .files
            .first()
            .map(|f| cli::detect_media_section(f).to_string())
            .unwrap_or_else(|| "video".to_string());
        let mut all_files = req.files.clone();
        if let Some(cli_state) = app.try_state::<CliRuntimeState>() {
            if let Ok(mut guard) = cli_state.startup.lock() {
                guard.is_cli_mode = false;
                if guard.open_section.as_deref() == Some(section.as_str()) {
                    for f in &req.files {
                        if !guard.open_files.contains(f) {
                            guard.open_files.push(f.clone());
                        }
                    }
                    all_files = guard.open_files.clone();
                } else {
                    guard.open_files = req.files.clone();
                    guard.open_section = Some(section.clone());
                }
            }
        }
        if let Some(win) = app.get_webview_window("main") {
            let _ = win.show();
            let _ = win.unminimize();
            let _ = win.set_focus();
        }
        let _ = app.emit(
            "cli-open-files",
            CliOpenFilesPayload {
                files: all_files,
                section,
            },
        );
        return;
    }

    tauri::async_runtime::spawn(async move {
        let job_lock = app
            .try_state::<CliRuntimeState>()
            .map(|s| Arc::clone(&s.job_lock));
        let _serial_guard = match &job_lock {
            Some(lock) => Some(lock.lock().await),
            None => None,
        };

        let state = app.state::<AppState>().inner().clone();
        let total = req.files.len();
        let mut last_output: Option<String> = None;
        let mut last_error: Option<String> = None;

        for (idx, file_path) in req.files.iter().enumerate() {
            let file_name = std::path::Path::new(file_path)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| file_path.clone());

            emit_cli_job_status(
                &app,
                CliJobStatusPayload {
                    status: "running".to_string(),
                    current_file: file_name.clone(),
                    index: idx,
                    total,
                    percentage: (idx as f32 / total.max(1) as f32) * 100.0,
                    pass: None,
                    total_passes: None,
                    output_path: None,
                    error: None,
                },
            );

            match execute_cli_file_action(&app, &state, &req.action, file_path).await {
                Ok(out_path) => {
                    let src_ext = std::path::Path::new(file_path)
                        .extension()
                        .map(|e| e.to_string_lossy().to_string())
                        .unwrap_or_default();
                    let dst_ext = std::path::Path::new(&out_path)
                        .extension()
                        .map(|e| e.to_string_lossy().to_string())
                        .unwrap_or_default();
                    let now_ms = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_millis() as u64)
                        .unwrap_or(0);
                    let _ = add_history_item(
                        app.clone(),
                        HistoryItem {
                            id: format!("cli-{now_ms}-{idx}"),
                            file_name,
                            media_type: cli::detect_media_section(&out_path).to_string(),
                            source_format: src_ext,
                            target_format: dst_ext,
                            output_path: out_path.clone(),
                            timestamp: now_ms,
                            status: "success".to_string(),
                            file_size: None,
                        },
                    )
                    .await;
                    last_output = Some(out_path);
                }
                Err(err) => {
                    last_error = Some(err);
                }
            }
        }

        if let Some(err) = &last_error {
            emit_cli_job_status(
                &app,
                CliJobStatusPayload {
                    status: "error".to_string(),
                    current_file: String::new(),
                    index: total,
                    total,
                    percentage: 100.0,
                    pass: None,
                    total_passes: None,
                    output_path: last_output.clone(),
                    error: Some(err.clone()),
                },
            );
            if req.wait {
                app.exit(1);
            }
        } else {
            emit_cli_job_status(
                &app,
                CliJobStatusPayload {
                    status: "done".to_string(),
                    current_file: String::new(),
                    index: total,
                    total,
                    percentage: 100.0,
                    pass: None,
                    total_passes: None,
                    output_path: last_output,
                    error: None,
                },
            );
            if req.wait {
                app.exit(0);
            }
        }
    });
}

// ─── Folder opener ───────────────────────────────────────────────────────────

/// Open the parent folder of the given file path in the native file manager.
#[tauri::command(rename_all = "snake_case")]
async fn open_folder(app: tauri::AppHandle, file_path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let path = std::path::Path::new(&file_path);
    let folder = path.parent().unwrap_or(path);
    app.opener()
        .open_path(folder.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|e| e.to_string())
}

// ─── History ─────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct HistoryItem {
    pub id: String,
    pub file_name: String,
    pub media_type: String, // "image" | "video" | "audio"
    pub source_format: String,
    pub target_format: String,
    pub output_path: String,
    pub timestamp: u64,
    pub status: String, // "success" | "error"
    pub file_size: Option<String>,
}

const HISTORY_KEY: &str = "items";
const HISTORY_MAX: usize = 50;

#[tauri::command(rename_all = "snake_case")]
async fn get_history(app: tauri::AppHandle) -> Result<Vec<HistoryItem>, String> {
    let store = app.store("history.json").map_err(|e| e.to_string())?;
    let items: Vec<HistoryItem> = store
        .get(HISTORY_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    // Already stored newest-first, but re-sort for safety
    let mut items = items;
    items.sort_by_key(|a| std::cmp::Reverse(a.timestamp));
    Ok(items)
}

#[tauri::command(rename_all = "snake_case")]
async fn add_history_item(app: tauri::AppHandle, mut item: HistoryItem) -> Result<(), String> {
    if item.file_size.is_none() && !item.output_path.is_empty() {
        if let Ok(meta) = std::fs::metadata(&item.output_path) {
            item.file_size = Some(format_byte_size(meta.len()));
        }
    }
    let store = app.store("history.json").map_err(|e| e.to_string())?;
    let mut items: Vec<HistoryItem> = store
        .get(HISTORY_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    items.insert(0, item);
    items.truncate(HISTORY_MAX);
    store.set(HISTORY_KEY, serde_json::to_value(&items).map_err(|e| e.to_string())?);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
async fn remove_history_item(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let store = app.store("history.json").map_err(|e| e.to_string())?;
    let mut items: Vec<HistoryItem> = store
        .get(HISTORY_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();
    items.retain(|item| item.id != id);
    store.set(HISTORY_KEY, serde_json::to_value(&items).map_err(|e| e.to_string())?);
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
async fn clear_history(app: tauri::AppHandle) -> Result<(), String> {
    let store = app.store("history.json").map_err(|e| e.to_string())?;
    store.set(HISTORY_KEY, serde_json::json!([]));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
async fn open_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(&path, None::<&str>)
        .map_err(|e| e.to_string())
}

// ─── App entry ───────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let initial_args: Vec<String> = std::env::args().collect();
    let initial_cli_req = cli::parse_cli_args(&initial_args);
    let startup_state = match &initial_cli_req {
        Some(req) => match &req.action {
            cli::CliAction::Compress { preset } => cli::CliStartupState {
                is_cli_mode: true,
                action_label: Some(format!("Compress ({preset})")),
                open_files: req.files.clone(),
                open_section: None,
                latest_job_status: None,
            },
            cli::CliAction::Convert { to } => cli::CliStartupState {
                is_cli_mode: true,
                action_label: Some(format!("Convert → {}", to.to_uppercase())),
                open_files: req.files.clone(),
                open_section: None,
                latest_job_status: None,
            },
            cli::CliAction::Open => {
                let section = req
                    .files
                    .first()
                    .map(|f| cli::detect_media_section(f).to_string())
                    .unwrap_or_else(|| "video".to_string());
                cli::CliStartupState {
                    is_cli_mode: false,
                    action_label: None,
                    open_files: req.files.clone(),
                    open_section: Some(section),
                    latest_job_status: None,
                }
            }
        },
        None => cli::CliStartupState::default(),
    };

    tauri::Builder::default()
        .manage(AppState {
            current_process: Arc::new(Mutex::new(None)),
            ffmpeg_busy: Arc::new(AtomicBool::new(false)),
            cancel_requested: Arc::new(AtomicBool::new(false)),
            image_busy: Arc::new(AtomicBool::new(false)),
        })
        .manage(CliRuntimeState {
            startup: Arc::new(Mutex::new(startup_state)),
            job_lock: Arc::new(tauri::async_runtime::Mutex::new(())),
        })
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(req) = cli::parse_cli_args(&argv) {
                spawn_cli_request_handler(app.clone(), req);
            } else if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(move |app| {
            let (language, context_menu_enabled) = match app.store("settings.json") {
                Ok(store) => {
                    let language = store
                        .get("language")
                        .and_then(|v| v.as_str().map(String::from))
                        .unwrap_or_else(|| Settings::default().language);
                    let enabled = store
                        .get("context_menu_enabled")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    (language, enabled)
                }
                Err(_) => (Settings::default().language, false),
            };
            let _ = context_menu::sync_context_menu_on_startup(context_menu_enabled, &language);

            if let Some(req) = initial_cli_req {
                if !matches!(req.action, cli::CliAction::Open) {
                    if let Some(win) = app.get_webview_window("main") {
                        if req.wait {
                            let _ = win.hide();
                        } else {
                            let _ = win.set_size(tauri::Size::Logical(tauri::LogicalSize {
                                width: 460.0,
                                height: 240.0,
                            }));
                            let _ = win.center();
                        }
                    }
                }
                spawn_cli_request_handler(app.handle().clone(), req);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            convert_video,
            convert_audio,
            cancel_conversion,
            get_media_info,
            estimate_target_size,
            compress_video_to_size,
            compress_video_batch_to_size,
            convert_image,
            convert_images_batch,
            get_image_info,
            convert_video_batch,
            convert_audio_batch,
            open_folder,
            get_settings,
            save_settings,
            get_platform,
            get_third_party_notices,
            get_context_menu_status,
            set_context_menu_enabled,
            get_cli_state,
            get_history,
            add_history_item,
            remove_history_item,
            clear_history,
            open_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// ─── Unit tests ───────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── time_str_to_secs ──────────────────────────────────────────────────────

    #[test]
    fn test_time_str_to_secs_basic() {
        assert_eq!(time_str_to_secs("00:00:00.00"), Some(0.0));
        assert_eq!(time_str_to_secs("00:01:00.00"), Some(60.0));
        assert_eq!(time_str_to_secs("01:00:00.00"), Some(3600.0));
    }

    #[test]
    fn test_time_str_to_secs_mixed() {
        // 1h 2m 3.5s = 3723.5s
        let result = time_str_to_secs("01:02:03.5").unwrap();
        assert!((result - 3723.5).abs() < 0.01, "got {result}");
    }

    #[test]
    fn test_time_str_to_secs_invalid() {
        assert_eq!(time_str_to_secs(""), None);
        assert_eq!(time_str_to_secs("not_a_time"), None);
        assert_eq!(time_str_to_secs("01:30"), None); // only 2 parts
    }

    // ── parse_duration_line ───────────────────────────────────────────────────

    #[test]
    fn test_parse_duration_line_found() {
        let line = "  Duration: 00:01:23.45, start: 0.000000, bitrate: 128 kb/s";
        let secs = parse_duration_line(line).unwrap();
        // 1*60 + 23.45 = 83.45
        assert!((secs - 83.45).abs() < 0.01, "got {secs}");
    }

    #[test]
    fn test_parse_duration_line_not_found() {
        assert_eq!(parse_duration_line("some random ffmpeg output"), None);
        assert_eq!(parse_duration_line(""), None);
    }

    // ── format_secs ──────────────────────────────────────────────────────────

    #[test]
    fn test_format_secs_zero() {
        assert_eq!(format_secs(0.0), "00:00:00");
    }

    #[test]
    fn test_format_secs_minutes() {
        assert_eq!(format_secs(90.0), "00:01:30");
    }

    #[test]
    fn test_format_secs_hours() {
        assert_eq!(format_secs(3661.0), "01:01:01");
    }

    // ── format_byte_size ──────────────────────────────────────────────────────

    #[test]
    fn test_format_byte_size() {
        assert_eq!(format_byte_size(0), "0 B");
        assert_eq!(format_byte_size(512), "512 B");
        assert_eq!(format_byte_size(1024), "1.0 KB");
        assert_eq!(format_byte_size(1536), "1.5 KB");
        assert_eq!(format_byte_size(1024 * 1024), "1.0 MB");
        assert_eq!(format_byte_size(5 * 1024 * 1024 + 524_288), "5.5 MB");
        assert_eq!(format_byte_size(1024 * 1024 * 1024), "1.00 GB");
    }

    // ── HistoryItem defaults (serde round-trip) ───────────────────────────────

    #[test]
    fn test_history_item_serde_roundtrip() {
        let item = HistoryItem {
            id: "abc123".to_string(),
            file_name: "video.mp4".to_string(),
            media_type: "video".to_string(),
            source_format: "mp4".to_string(),
            target_format: "mkv".to_string(),
            output_path: "/tmp/video_converted.mkv".to_string(),
            timestamp: 1_700_000_000,
            status: "success".to_string(),
            file_size: Some("12.4 MB".to_string()),
        };

        let json = serde_json::to_string(&item).expect("serialize");
        let back: HistoryItem = serde_json::from_str(&json).expect("deserialize");

        assert_eq!(back.id, "abc123");
        assert_eq!(back.media_type, "video");
        assert_eq!(back.file_size, Some("12.4 MB".to_string()));
    }

    #[test]
    fn test_history_item_null_file_size() {
        let json = r#"{
            "id":"x","file_name":"a.mp3","media_type":"audio",
            "source_format":"mp3","target_format":"flac",
            "output_path":"/tmp/a_converted.flac",
            "timestamp":0,"status":"success","file_size":null
        }"#;
        let item: HistoryItem = serde_json::from_str(json).expect("deserialize");
        assert_eq!(item.file_size, None);
    }

    // ── Settings defaults ─────────────────────────────────────────────────────

    #[test]
    fn test_settings_default() {
        let s = Settings::default();
        assert_eq!(s.language, "en");
        assert_eq!(s.theme, "dark");
        assert!(s.output_dir.is_none());
        assert_eq!(s.default_video_format, "mp4");
        assert_eq!(s.default_audio_format, "mp3");
        assert_eq!(s.default_image_format, "webp");
    }

    #[test]
    fn test_parse_ffprobe_json_skips_attached_pic_and_uses_stream_duration_fallback() {
        let probe = serde_json::json!({
            "format": {
                "duration": "0",
                "bit_rate": "2500000"
            },
            "streams": [
                {
                    "codec_type": "video",
                    "codec_name": "h264",
                    "width": 1920,
                    "height": 1080,
                    "avg_frame_rate": "60/1",
                    "duration": "42.5",
                    "disposition": { "attached_pic": 0 }
                },
                {
                    "codec_type": "video",
                    "codec_name": "mjpeg",
                    "width": 600,
                    "height": 600,
                    "avg_frame_rate": "90000/1",
                    "disposition": { "attached_pic": 1 }
                },
                {
                    "codec_type": "audio",
                    "codec_name": "aac",
                    "bit_rate": "128000"
                }
            ]
        });

        let info = parse_ffprobe_json(&probe, 12_345_678);
        assert!((info.duration - 42.5).abs() < 1e-6);
        assert_eq!(info.width, Some(1920));
        assert_eq!(info.height, Some(1080));
        assert_eq!(info.video_codec.as_deref(), Some("h264"));
        assert_eq!(info.fps, Some(60.0));
        assert_eq!(info.audio_codec.as_deref(), Some("aac"));
        assert_eq!(info.audio_bitrate_kbps, Some(128));
        assert!(info.has_audio);
    }

    #[test]
    fn test_get_third_party_notices_returns_ffmpeg_gpl_info() {
        let notices = get_third_party_notices();
        assert!(!notices.trim().is_empty());
        assert!(notices.contains("FFmpeg"), "missing FFmpeg in: {notices}");
        assert!(notices.contains("GPL"), "missing GPL in: {notices}");

        let fallback = load_third_party_notices_from_candidates(&[
            std::path::PathBuf::from("__nonexistent_kompri_notices__.md"),
        ]);
        assert!(fallback.contains("FFmpeg"));
        assert!(fallback.contains("GPL-3.0"));
        assert!(fallback.contains("gyan.dev"));
        assert!(fallback.contains("eugeneware"));
        assert!(fallback.contains("johnvansickle"));
    }
}

#[cfg(test)]
mod output_tests;

#[cfg(test)]
mod job_tests;
