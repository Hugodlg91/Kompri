//! Command-line argument parsing and collision-free output path resolution.

use serde::{Deserialize, Serialize};
use std::io::ErrorKind;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CliAction {
    Compress { preset: String },
    Convert { to: String },
    Open,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct CliRequest {
    pub action: CliAction,
    pub files: Vec<String>,
    pub wait: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct CliStartupState {
    pub is_cli_mode: bool,
    pub action_label: Option<String>,
    pub open_files: Vec<String>,
    pub open_section: Option<String>, // "image" | "video" | "audio"
}

fn is_valid_preset(preset: &str) -> bool {
    matches!(preset, "discord" | "whatsapp" | "gmail")
}

fn is_valid_target_format(ext: &str) -> bool {
    matches!(
        ext,
        "mp4"
            | "mkv"
            | "avi"
            | "mov"
            | "webm"
            | "mp3"
            | "flac"
            | "wav"
            | "ogg"
            | "aac"
            | "m4a"
            | "jpg"
            | "jpeg"
            | "png"
            | "webp"
            | "bmp"
            | "tiff"
            | "tif"
    )
}

/// Parses CLI arguments passed to the application (skipping `args[0]`, the executable path).
///
/// Returns `None` if `--action` is missing/invalid, required action parameters are missing,
/// or no input file paths were provided.
pub fn parse_cli_args(args: &[String]) -> Option<CliRequest> {
    let mut iter = args.iter().skip(1);

    let mut action_kind: Option<String> = None;
    let mut preset: Option<String> = None;
    let mut to: Option<String> = None;
    let mut wait = false;
    let mut files: Vec<String> = Vec::new();
    let mut positional_only = false;

    while let Some(arg) = iter.next() {
        if positional_only {
            if !arg.trim().is_empty() {
                files.push(arg.clone());
            }
            continue;
        }

        if arg == "--" {
            positional_only = true;
            continue;
        }

        if arg == "--action" {
            action_kind = Some(iter.next()?.clone());
        } else if let Some(val) = arg.strip_prefix("--action=") {
            action_kind = Some(val.to_string());
        } else if arg == "--preset" {
            preset = Some(iter.next()?.clone());
        } else if let Some(val) = arg.strip_prefix("--preset=") {
            preset = Some(val.to_string());
        } else if arg == "--to" {
            to = Some(iter.next()?.clone());
        } else if let Some(val) = arg.strip_prefix("--to=") {
            to = Some(val.to_string());
        } else if arg == "--wait" || arg == "--headless" {
            wait = true;
        } else if arg.starts_with('-') {
            // Ignore unknown flags injected by OS/WebView/single-instance launchers.
            continue;
        } else if !arg.trim().is_empty() {
            files.push(arg.clone());
        }
    }

    if files.is_empty() {
        return None;
    }

    let action = match action_kind?.trim().to_ascii_lowercase().as_str() {
        "compress" => {
            let p = preset?.trim().to_ascii_lowercase();
            if !is_valid_preset(&p) {
                return None;
            }
            CliAction::Compress { preset: p }
        }
        "convert" => {
            let target = to?.trim().trim_start_matches('.').to_ascii_lowercase();
            if !is_valid_target_format(&target) {
                return None;
            }
            CliAction::Convert { to: target }
        }
        "open" => CliAction::Open,
        _ => return None,
    };

    Some(CliRequest {
        action,
        files,
        wait,
    })
}

fn split_dir_and_name(input_path: &str) -> (&str, &str) {
    if let Some(pos) = input_path.rfind(['/', '\\']) {
        (&input_path[..=pos], &input_path[pos + 1..])
    } else if input_path.len() >= 2
        && input_path.as_bytes()[0].is_ascii_alphabetic()
        && input_path.as_bytes()[1] == b':'
    {
        (&input_path[..2], &input_path[2..])
    } else {
        ("", input_path)
    }
}

fn file_stem_str(file_name: &str) -> &str {
    match file_name.rfind('.') {
        Some(dot) if dot > 0 => &file_name[..dot],
        _ => file_name,
    }
}

fn format_candidate(dir_prefix: &str, stem: &str, suffix: &str, index: Option<u64>, ext: &str) -> String {
    let ext_part = if ext.is_empty() {
        String::new()
    } else {
        format!(".{ext}")
    };

    match index {
        None => format!("{dir_prefix}{stem}{suffix}{ext_part}"),
        Some(n) => format!("{dir_prefix}{stem}{suffix}_{n}{ext_part}"),
    }
}

fn path_is_free(path: &str) -> bool {
    match std::fs::symlink_metadata(path) {
        Ok(_) => false,
        Err(e) if e.kind() == ErrorKind::NotFound => true,
        // Avoid infinite probing on unrecoverable OS errors (e.g. PermissionDenied).
        Err(_) => true,
    }
}

/// Builds a non-overwriting output file path in the same directory as `input_path`,
/// preserving original path separators (`\`, `/`, or UNC `\\server\share\...`).
///
/// Checks `std::fs::symlink_metadata` and appends `_2`, `_3`, ... before the extension
/// if the base candidate already exists.
pub fn build_unique_cli_output_path(input_path: &str, suffix: &str, target_ext: &str) -> String {
    let (dir_prefix, file_name) = split_dir_and_name(input_path);
    let stem = file_stem_str(file_name);
    let clean_ext = target_ext.trim().trim_start_matches('.');

    let base = format_candidate(dir_prefix, stem, suffix, None, clean_ext);
    if path_is_free(&base) {
        return base;
    }

    for n in 2u64.. {
        let candidate = format_candidate(dir_prefix, stem, suffix, Some(n), clean_ext);
        if path_is_free(&candidate) {
            return candidate;
        }
    }

    base
}

/// Detects the MediaForge section (`"image"`, `"audio"`, or `"video"`) from a file's extension.
pub fn detect_media_section(file_path: &str) -> &'static str {
    let file_name = file_path.rsplit(['/', '\\']).next().unwrap_or(file_path);
    let ext = file_name
        .rsplit_once('.')
        .map(|(_, e)| e.to_ascii_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "png" | "jpg" | "jpeg" | "webp" | "bmp" | "tiff" | "tif" | "gif" | "ico" | "avif"
        | "heic" | "heif" | "svg" => "image",
        "mp3" | "flac" | "wav" | "ogg" | "aac" | "m4a" | "wma" | "opus" | "aiff" | "alac" => {
            "audio"
        }
        _ => "video",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static NEXT_TEST_ID: AtomicUsize = AtomicUsize::new(0);

    struct TempDirGuard(PathBuf);

    impl TempDirGuard {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "mediaforge-cli-test-{}-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
                NEXT_TEST_ID.fetch_add(1, Ordering::Relaxed)
            ));
            std::fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TempDirGuard {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn s(items: &[&str]) -> Vec<String> {
        items.iter().map(|v| (*v).to_string()).collect()
    }

    #[test]
    fn test_parse_compress_discord_with_spaces() {
        let args = s(&[
            "MediaForge.exe",
            "--action",
            "compress",
            "--preset",
            "discord",
            r"C:\My Videos\clip 1.mp4",
        ]);

        let req = parse_cli_args(&args).expect("should parse compress command");
        assert_eq!(
            req,
            CliRequest {
                action: CliAction::Compress {
                    preset: "discord".to_string()
                },
                files: vec![r"C:\My Videos\clip 1.mp4".to_string()],
                wait: false,
            }
        );
    }

    #[test]
    fn test_parse_convert_multiple_files_with_wait() {
        let args = s(&[
            "MediaForge.exe",
            "--action",
            "convert",
            "--to",
            "mp3",
            "file1.wav",
            "file2.wav",
            "--wait",
        ]);

        let req = parse_cli_args(&args).expect("should parse multi-file convert command");
        assert_eq!(
            req,
            CliRequest {
                action: CliAction::Convert {
                    to: "mp3".to_string()
                },
                files: vec!["file1.wav".to_string(), "file2.wav".to_string()],
                wait: true,
            }
        );
    }

    #[test]
    fn test_parse_open_unc_unicode_path() {
        let args = s(&[
            r"C:\Program Files\MediaForge\MediaForge.exe",
            "--action",
            "open",
            r"\\server\share\vidéo accentuée.mkv",
        ]);

        let req = parse_cli_args(&args).expect("should parse open UNC path");
        assert_eq!(
            req,
            CliRequest {
                action: CliAction::Open,
                files: vec![r"\\server\share\vidéo accentuée.mkv".to_string()],
                wait: false,
            }
        );
    }

    #[test]
    fn test_parse_equals_syntax_and_headless_alias() {
        let args = s(&[
            "MediaForge.exe",
            "--action=compress",
            "--preset=gmail",
            "--headless",
            "--unknown-flag",
            "clip.mov",
        ]);

        let req = parse_cli_args(&args).expect("should parse equals syntax");
        assert_eq!(
            req,
            CliRequest {
                action: CliAction::Compress {
                    preset: "gmail".to_string()
                },
                files: vec!["clip.mov".to_string()],
                wait: true,
            }
        );
    }

    #[test]
    fn test_parse_invalid_or_incomplete_returns_none() {
        assert_eq!(parse_cli_args(&s(&[])), None);
        assert_eq!(parse_cli_args(&s(&["MediaForge.exe"])), None);
        assert_eq!(
            parse_cli_args(&s(&["MediaForge.exe", "clip.mp4"])),
            None
        );
        assert_eq!(
            parse_cli_args(&s(&["MediaForge.exe", "--action", "open"])),
            None
        );
        assert_eq!(
            parse_cli_args(&s(&["MediaForge.exe", "--action", "compress", "clip.mp4"])),
            None
        );
        assert_eq!(
            parse_cli_args(&s(&[
                "MediaForge.exe",
                "--action",
                "compress",
                "--preset",
                "unknown",
                "clip.mp4"
            ])),
            None
        );
        assert_eq!(
            parse_cli_args(&s(&["MediaForge.exe", "--action", "convert", "clip.mp4"])),
            None
        );
        assert_eq!(
            parse_cli_args(&s(&[
                "MediaForge.exe",
                "--action",
                "convert",
                "--to",
                "exe",
                "clip.mp4"
            ])),
            None
        );
        assert_eq!(
            parse_cli_args(&s(&["MediaForge.exe", "--action"])),
            None
        );
    }

    #[test]
    fn test_build_unique_cli_output_path_never_overwrites() {
        let dir = TempDirGuard::new();
        let input = dir.0.join("clip.mov");
        let input_str = input.to_str().unwrap();

        let first = build_unique_cli_output_path(input_str, "_discord", "mp4");
        assert_eq!(PathBuf::from(&first), dir.0.join("clip_discord.mp4"));

        // Create clip_discord.mp4 -> next must be clip_discord_2.mp4
        std::fs::write(&first, b"existing-1").unwrap();
        let second = build_unique_cli_output_path(input_str, "_discord", "mp4");
        assert_eq!(PathBuf::from(&second), dir.0.join("clip_discord_2.mp4"));

        // Create clip_discord_2.mp4 -> next must be clip_discord_3.mp4
        std::fs::write(&second, b"existing-2").unwrap();
        let third = build_unique_cli_output_path(input_str, "_discord", "mp4");
        assert_eq!(PathBuf::from(&third), dir.0.join("clip_discord_3.mp4"));

        // Original files remain untouched
        assert_eq!(std::fs::read(&first).unwrap(), b"existing-1");
        assert_eq!(std::fs::read(&second).unwrap(), b"existing-2");
    }

    #[test]
    fn test_build_unique_cli_output_path_preserves_separators() {
        assert_eq!(
            build_unique_cli_output_path(
                r"C:\NonExistentMediaForgeDir\clip.mov",
                "_discord",
                "mp4"
            ),
            r"C:\NonExistentMediaForgeDir\clip_discord.mp4"
        );
        assert_eq!(
            build_unique_cli_output_path(
                "C:/NonExistentMediaForgeDir/clip.mov",
                "_discord",
                "mp4"
            ),
            "C:/NonExistentMediaForgeDir/clip_discord.mp4"
        );
        assert_eq!(
            build_unique_cli_output_path(
                r"\\nonexistent-server-mf\share\vidéo accentuée.mkv",
                "_whatsapp",
                "mp4"
            ),
            r"\\nonexistent-server-mf\share\vidéo accentuée_whatsapp.mp4"
        );
    }

    #[test]
    fn test_detect_media_section() {
        assert_eq!(detect_media_section(r"C:\Photos\pic.PNG"), "image");
        assert_eq!(detect_media_section("/tmp/pic.webp"), "image");
        assert_eq!(detect_media_section(r"D:\Music\track.flac"), "audio");
        assert_eq!(detect_media_section("voice.M4A"), "audio");
        assert_eq!(detect_media_section(r"\\server\share\movie.mkv"), "video");
        assert_eq!(detect_media_section(r"C:\dir.png\clip.mp4"), "video");
    }

    #[test]
    fn test_cli_types_serde_roundtrip() {
        let req = CliRequest {
            action: CliAction::Compress {
                preset: "discord".to_string(),
            },
            files: vec!["clip.mp4".to_string()],
            wait: true,
        };
        let json = serde_json::to_string(&req).unwrap();
        assert!(json.contains(r#""kind":"compress""#), "{json}");
        let back: CliRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(back, req);

        let state = CliStartupState {
            is_cli_mode: true,
            action_label: Some("Compress for Discord".to_string()),
            open_files: vec!["clip.mp4".to_string()],
            open_section: Some("video".to_string()),
        };
        let state_json = serde_json::to_string(&state).unwrap();
        let state_back: CliStartupState = serde_json::from_str(&state_json).unwrap();
        assert_eq!(state_back, state);
    }
}
