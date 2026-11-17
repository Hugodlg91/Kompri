//! Windows Explorer cascading context menu registration under `HKEY_CURRENT_USER`.
//!
//! Uses `HKCU\Software\Classes\SystemFileAssociations\<ext>\shell\MediaForge`
//! so no administrator privileges are required.

/// Supported video file extensions registered in Windows Explorer.
pub const VIDEO_EXTENSIONS: &[&str] = &[".mp4", ".mkv", ".avi", ".mov", ".webm"];

/// Supported audio file extensions registered in Windows Explorer.
pub const AUDIO_EXTENSIONS: &[&str] = &[".mp3", ".flac", ".wav", ".ogg", ".aac", ".m4a"];

/// Supported image file extensions registered in Windows Explorer.
pub const IMAGE_EXTENSIONS: &[&str] = &[".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif"];

#[cfg(target_os = "windows")]
const SYSTEM_FILE_ASSOC_PREFIX: &str = r"Software\Classes\SystemFileAssociations";

/// Localized context menu labels for the supported UI languages.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MenuLabels {
    pub compress_discord: &'static str,
    pub compress_whatsapp: &'static str,
    pub convert_mp4: &'static str,
    pub convert_mp3: &'static str,
    pub convert_jpg: &'static str,
    pub convert_png: &'static str,
    pub convert_webp: &'static str,
    pub open_in_app: &'static str,
}

impl MenuLabels {
    /// Returns localized menu labels for `"fr"`, `"en"`, `"es"`, `"de"`, or `"pt"`.
    /// Unknown language codes fall back to English (`"en"`).
    pub fn for_lang(lang: &str) -> Self {
        let normalized = lang.trim().to_ascii_lowercase();
        let code = normalized.split(['-', '_']).next().unwrap_or("en");

        match code {
            "fr" => Self {
                compress_discord: "Compresser pour Discord (10 Mo)",
                compress_whatsapp: "Compresser pour WhatsApp (16 Mo)",
                convert_mp4: "Convertir en MP4",
                convert_mp3: "Convertir en MP3",
                convert_jpg: "Convertir en JPG",
                convert_png: "Convertir en PNG",
                convert_webp: "Convertir en WebP",
                open_in_app: "Ouvrir dans MediaForge…",
            },
            "es" => Self {
                compress_discord: "Comprimir para Discord (10 MB)",
                compress_whatsapp: "Comprimir para WhatsApp (16 MB)",
                convert_mp4: "Convertir a MP4",
                convert_mp3: "Convertir a MP3",
                convert_jpg: "Convertir a JPG",
                convert_png: "Convertir a PNG",
                convert_webp: "Convertir a WebP",
                open_in_app: "Abrir en MediaForge…",
            },
            "de" => Self {
                compress_discord: "Für Discord komprimieren (10 MB)",
                compress_whatsapp: "Für WhatsApp komprimieren (16 MB)",
                convert_mp4: "In MP4 konvertieren",
                convert_mp3: "In MP3 konvertieren",
                convert_jpg: "In JPG konvertieren",
                convert_png: "In PNG konvertieren",
                convert_webp: "In WebP konvertieren",
                open_in_app: "In MediaForge öffnen…",
            },
            "pt" => Self {
                compress_discord: "Comprimir para Discord (10 MB)",
                compress_whatsapp: "Comprimir para WhatsApp (16 MB)",
                convert_mp4: "Converter para MP4",
                convert_mp3: "Converter para MP3",
                convert_jpg: "Converter para JPG",
                convert_png: "Converter para PNG",
                convert_webp: "Converter para WebP",
                open_in_app: "Abrir no MediaForge…",
            },
            _ => Self {
                compress_discord: "Compress for Discord (10 MB)",
                compress_whatsapp: "Compress for WhatsApp (16 MB)",
                convert_mp4: "Convert to MP4",
                convert_mp3: "Convert to MP3",
                convert_jpg: "Convert to JPG",
                convert_png: "Convert to PNG",
                convert_webp: "Convert to WebP",
                open_in_app: "Open in MediaForge…",
            },
        }
    }
}

/// Returns the current operating system identifier (`"windows"`, `"macos"`, or `"linux"`).
pub fn current_platform() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "windows"
    }
    #[cfg(target_os = "macos")]
    {
        "macos"
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        "linux"
    }
}

/// Registers the Windows Explorer context menu under `HKCU` for the current executable.
/// Returns `Ok(true)` when registered on Windows.
pub fn register_context_menu(lang: &str) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let exe_path = windows_impl::current_exe_path()?;
        register_context_menu_at(SYSTEM_FILE_ASSOC_PREFIX, &exe_path, lang)?;
        Ok(true)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = lang;
        Err("Context menu is only supported on Windows".to_string())
    }
}

/// Removes the Windows Explorer context menu entries from `HKCU`.
/// Returns `Ok(false)` (not registered) after cleanup or on non-Windows platforms.
pub fn unregister_context_menu() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        unregister_context_menu_at(SYSTEM_FILE_ASSOC_PREFIX)?;
        Ok(false)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

/// Checks whether the MediaForge context menu is currently registered under `HKCU`.
pub fn is_context_menu_registered() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        is_context_menu_registered_at(SYSTEM_FILE_ASSOC_PREFIX)
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

/// Registers cascading Explorer context menus under `HKCU\<base_prefix>\<ext>\shell\MediaForge`.
#[cfg(target_os = "windows")]
pub fn register_context_menu_at(
    base_prefix: &str,
    exe_path: &str,
    lang: &str,
) -> Result<(), String> {
    windows_impl::register_at(base_prefix, exe_path, lang)
}

/// Removes cascading Explorer context menus under `HKCU\<base_prefix>\<ext>\shell\MediaForge`.
#[cfg(target_os = "windows")]
pub fn unregister_context_menu_at(base_prefix: &str) -> Result<(), String> {
    windows_impl::unregister_at(base_prefix)
}

/// Returns `true` if any supported extension has `HKCU\<base_prefix>\<ext>\shell\MediaForge`.
#[cfg(target_os = "windows")]
pub fn is_context_menu_registered_at(base_prefix: &str) -> Result<bool, String> {
    windows_impl::is_registered_at(base_prefix)
}

#[cfg(target_os = "windows")]
mod windows_impl {
    use super::{MenuLabels, AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS};
    use std::io::ErrorKind;
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    struct SubCommandSpec<'a> {
        subkey: &'a str,
        label: &'a str,
        cli_args: &'a str,
    }

    pub fn current_exe_path() -> Result<String, String> {
        let exe = std::env::current_exe()
            .map_err(|e| format!("Failed to locate current executable: {e}"))?;
        let raw = exe
            .to_str()
            .ok_or_else(|| "Executable path contains invalid UTF-8".to_string())?;

        // Explorer shell commands expect standard Win32 paths rather than verbatim \\?\ prefixes.
        let normalized = if let Some(unc) = raw.strip_prefix(r"\\?\UNC\") {
            format!(r"\\{unc}")
        } else if let Some(local) = raw.strip_prefix(r"\\?\") {
            local.to_string()
        } else {
            raw.to_string()
        };

        Ok(normalized)
    }

    fn all_extensions() -> impl Iterator<Item = &'static str> {
        VIDEO_EXTENSIONS
            .iter()
            .chain(AUDIO_EXTENSIONS.iter())
            .chain(IMAGE_EXTENSIONS.iter())
            .copied()
    }

    fn validate_prefix(base_prefix: &str) -> Result<&str, String> {
        let trimmed = base_prefix.trim_matches('\\');
        if trimmed.is_empty() || trimmed.contains('\0') {
            return Err("Invalid registry base prefix".to_string());
        }
        Ok(trimmed)
    }

    fn validate_exe_path(exe_path: &str) -> Result<&str, String> {
        if exe_path.trim().is_empty()
            || exe_path.contains('"')
            || exe_path.contains('\0')
            || exe_path.contains('%')
            || exe_path.contains('\r')
            || exe_path.contains('\n')
        {
            return Err("Invalid executable path for registry command".to_string());
        }
        Ok(exe_path)
    }

    fn menu_key_path(prefix: &str, ext: &str) -> String {
        format!(r"{prefix}\{ext}\shell\MediaForge")
    }

    fn write_extension_menu(
        hkcu: &RegKey,
        prefix: &str,
        ext: &str,
        exe_path: &str,
        items: &[SubCommandSpec<'_>],
    ) -> Result<(), String> {
        let root_path = menu_key_path(prefix, ext);

        // Clear any leftover subkeys from prior versions before recreating the submenu.
        match hkcu.delete_subkey_all(&root_path) {
            Ok(()) => {}
            Err(e) if e.kind() == ErrorKind::NotFound => {}
            Err(e) => {
                return Err(format!(
                    "Failed to reset existing registry key '{root_path}': {e}"
                ));
            }
        }

        let (root_key, _) = hkcu
            .create_subkey(&root_path)
            .map_err(|e| format!("Failed to create registry key '{root_path}': {e}"))?;

        let icon_value = format!("\"{exe_path}\",0");
        root_key
            .set_value("MUIVerb", &"MediaForge")
            .map_err(|e| format!("Failed to set MUIVerb on '{root_path}': {e}"))?;
        root_key
            .set_value("Icon", &icon_value)
            .map_err(|e| format!("Failed to set Icon on '{root_path}': {e}"))?;
        // Empty SubCommands tells Windows Explorer to populate the cascade from `shell\*`.
        root_key
            .set_value("SubCommands", &"")
            .map_err(|e| format!("Failed to set SubCommands on '{root_path}': {e}"))?;

        let (shell_key, _) = root_key
            .create_subkey("shell")
            .map_err(|e| format!("Failed to create shell subkey under '{root_path}': {e}"))?;

        for item in items {
            let (item_key, _) = shell_key.create_subkey(item.subkey).map_err(|e| {
                format!(
                    "Failed to create submenu key '{}' under '{root_path}': {e}",
                    item.subkey
                )
            })?;
            item_key
                .set_value("MUIVerb", &item.label)
                .map_err(|e| format!("Failed to set MUIVerb for '{}': {e}", item.subkey))?;

            let (cmd_key, _) = item_key
                .create_subkey("command")
                .map_err(|e| format!("Failed to create command key for '{}': {e}", item.subkey))?;
            let command_line = format!("\"{exe_path}\" {} -- \"%1\"", item.cli_args);
            cmd_key
                .set_value("", &command_line)
                .map_err(|e| format!("Failed to set command for '{}': {e}", item.subkey))?;
        }

        Ok(())
    }

    pub fn register_at(base_prefix: &str, exe_path: &str, lang: &str) -> Result<(), String> {
        let prefix = validate_prefix(base_prefix)?;
        let exe_path = validate_exe_path(exe_path)?;
        let labels = MenuLabels::for_lang(lang);
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);

        let video_items = [
            SubCommandSpec {
                subkey: "01_discord",
                label: labels.compress_discord,
                cli_args: "--action compress --preset discord",
            },
            SubCommandSpec {
                subkey: "02_whatsapp",
                label: labels.compress_whatsapp,
                cli_args: "--action compress --preset whatsapp",
            },
            SubCommandSpec {
                subkey: "03_mp4",
                label: labels.convert_mp4,
                cli_args: "--action convert --to mp4",
            },
            SubCommandSpec {
                subkey: "99_open",
                label: labels.open_in_app,
                cli_args: "--action open",
            },
        ];

        let audio_items = [
            SubCommandSpec {
                subkey: "01_mp3",
                label: labels.convert_mp3,
                cli_args: "--action convert --to mp3",
            },
            SubCommandSpec {
                subkey: "99_open",
                label: labels.open_in_app,
                cli_args: "--action open",
            },
        ];

        let image_items = [
            SubCommandSpec {
                subkey: "01_jpg",
                label: labels.convert_jpg,
                cli_args: "--action convert --to jpg",
            },
            SubCommandSpec {
                subkey: "02_png",
                label: labels.convert_png,
                cli_args: "--action convert --to png",
            },
            SubCommandSpec {
                subkey: "03_webp",
                label: labels.convert_webp,
                cli_args: "--action convert --to webp",
            },
            SubCommandSpec {
                subkey: "99_open",
                label: labels.open_in_app,
                cli_args: "--action open",
            },
        ];

        let groups: [(&[&str], &[SubCommandSpec<'_>]); 3] = [
            (VIDEO_EXTENSIONS, &video_items),
            (AUDIO_EXTENSIONS, &audio_items),
            (IMAGE_EXTENSIONS, &image_items),
        ];

        for (extensions, items) in groups {
            for ext in extensions {
                write_extension_menu(&hkcu, prefix, ext, exe_path, items)?;
            }
        }

        Ok(())
    }

    pub fn unregister_at(base_prefix: &str) -> Result<(), String> {
        let prefix = validate_prefix(base_prefix)?;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);

        for ext in all_extensions() {
            let key_path = menu_key_path(prefix, ext);
            match hkcu.delete_subkey_all(&key_path) {
                Ok(()) => {}
                Err(e) if e.kind() == ErrorKind::NotFound => {}
                Err(e) => {
                    return Err(format!("Failed to remove registry key '{key_path}': {e}"));
                }
            }
        }

        Ok(())
    }

    pub fn is_registered_at(base_prefix: &str) -> Result<bool, String> {
        let prefix = validate_prefix(base_prefix)?;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);

        for ext in all_extensions() {
            let key_path = menu_key_path(prefix, ext);
            match hkcu.open_subkey(&key_path) {
                Ok(_) => return Ok(true),
                Err(e) if e.kind() == ErrorKind::NotFound => {}
                Err(e) => {
                    return Err(format!("Failed to inspect registry key '{key_path}': {e}"));
                }
            }
        }

        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_menu_labels_all_languages() {
        let fr = MenuLabels::for_lang("fr");
        assert_eq!(fr.compress_discord, "Compresser pour Discord (10 Mo)");
        assert_eq!(fr.compress_whatsapp, "Compresser pour WhatsApp (16 Mo)");
        assert_eq!(fr.convert_mp4, "Convertir en MP4");
        assert_eq!(fr.convert_mp3, "Convertir en MP3");
        assert_eq!(fr.convert_jpg, "Convertir en JPG");
        assert_eq!(fr.convert_png, "Convertir en PNG");
        assert_eq!(fr.convert_webp, "Convertir en WebP");
        assert_eq!(fr.open_in_app, "Ouvrir dans MediaForge…");

        let en = MenuLabels::for_lang("en");
        assert_eq!(en.compress_discord, "Compress for Discord (10 MB)");
        assert_eq!(en.compress_whatsapp, "Compress for WhatsApp (16 MB)");
        assert_eq!(en.convert_mp4, "Convert to MP4");
        assert_eq!(en.convert_mp3, "Convert to MP3");
        assert_eq!(en.convert_jpg, "Convert to JPG");
        assert_eq!(en.convert_png, "Convert to PNG");
        assert_eq!(en.convert_webp, "Convert to WebP");
        assert_eq!(en.open_in_app, "Open in MediaForge…");

        let es = MenuLabels::for_lang("es");
        assert_eq!(es.compress_discord, "Comprimir para Discord (10 MB)");
        assert_eq!(es.compress_whatsapp, "Comprimir para WhatsApp (16 MB)");
        assert_eq!(es.convert_mp4, "Convertir a MP4");
        assert_eq!(es.convert_mp3, "Convertir a MP3");
        assert_eq!(es.convert_jpg, "Convertir a JPG");
        assert_eq!(es.convert_png, "Convertir a PNG");
        assert_eq!(es.convert_webp, "Convertir a WebP");
        assert_eq!(es.open_in_app, "Abrir en MediaForge…");

        let de = MenuLabels::for_lang("de");
        assert_eq!(de.compress_discord, "Für Discord komprimieren (10 MB)");
        assert_eq!(de.compress_whatsapp, "Für WhatsApp komprimieren (16 MB)");
        assert_eq!(de.convert_mp4, "In MP4 konvertieren");
        assert_eq!(de.convert_mp3, "In MP3 konvertieren");
        assert_eq!(de.convert_jpg, "In JPG konvertieren");
        assert_eq!(de.convert_png, "In PNG konvertieren");
        assert_eq!(de.convert_webp, "In WebP konvertieren");
        assert_eq!(de.open_in_app, "In MediaForge öffnen…");

        let pt = MenuLabels::for_lang("pt");
        assert_eq!(pt.compress_discord, "Comprimir para Discord (10 MB)");
        assert_eq!(pt.compress_whatsapp, "Comprimir para WhatsApp (16 MB)");
        assert_eq!(pt.convert_mp4, "Converter para MP4");
        assert_eq!(pt.convert_mp3, "Converter para MP3");
        assert_eq!(pt.convert_jpg, "Converter para JPG");
        assert_eq!(pt.convert_png, "Converter para PNG");
        assert_eq!(pt.convert_webp, "Converter para WebP");
        assert_eq!(pt.open_in_app, "Abrir no MediaForge…");

        // Fallback and locale variants
        assert_eq!(MenuLabels::for_lang("fr-FR"), fr);
        assert_eq!(MenuLabels::for_lang("DE"), de);
        assert_eq!(MenuLabels::for_lang("unknown"), en);
    }

    #[test]
    fn test_current_platform_is_known() {
        let p = current_platform();
        assert!(matches!(p, "windows" | "macos" | "linux"));
    }

    #[cfg(target_os = "windows")]
    mod windows_tests {
        use super::*;
        use std::io::ErrorKind;
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;

        const TEST_PREFIX: &str = r"Software\MediaForge_UnitTest_ContextMenu";

        struct TestRegistryGuard(&'static str);

        impl TestRegistryGuard {
            fn new(prefix: &'static str) -> Self {
                let hkcu = RegKey::predef(HKEY_CURRENT_USER);
                let _ = hkcu.delete_subkey_all(prefix);
                Self(prefix)
            }
        }

        impl Drop for TestRegistryGuard {
            fn drop(&mut self) {
                let hkcu = RegKey::predef(HKEY_CURRENT_USER);
                let _ = hkcu.delete_subkey_all(self.0);
            }
        }

        fn read_val(key: &RegKey, name: &str) -> String {
            key.get_value(name).expect("expected registry value")
        }

        #[test]
        fn test_register_and_unregister_context_menu_hkcu() {
            let _guard = TestRegistryGuard::new(TEST_PREFIX);
            let hkcu = RegKey::predef(HKEY_CURRENT_USER);
            let exe = r"C:\Program Files\MediaForge\MediaForge.exe";

            assert!(!is_context_menu_registered_at(TEST_PREFIX).unwrap());

            register_context_menu_at(TEST_PREFIX, exe, "fr").unwrap();
            assert!(is_context_menu_registered_at(TEST_PREFIX).unwrap());

            // Verify video root & subcommands
            let mp4_root = hkcu
                .open_subkey(format!(r"{TEST_PREFIX}\.mp4\shell\MediaForge"))
                .unwrap();
            assert_eq!(read_val(&mp4_root, "MUIVerb"), "MediaForge");
            assert_eq!(read_val(&mp4_root, "Icon"), format!("\"{exe}\",0"));
            assert_eq!(read_val(&mp4_root, "SubCommands"), "");

            let discord_item = mp4_root.open_subkey(r"shell\01_discord").unwrap();
            assert_eq!(
                read_val(&discord_item, "MUIVerb"),
                "Compresser pour Discord (10 Mo)"
            );
            let discord_cmd = discord_item.open_subkey("command").unwrap();
            assert_eq!(
                read_val(&discord_cmd, ""),
                format!("\"{exe}\" --action compress --preset discord -- \"%1\"")
            );

            let whatsapp_cmd = mp4_root.open_subkey(r"shell\02_whatsapp\command").unwrap();
            assert_eq!(
                read_val(&whatsapp_cmd, ""),
                format!("\"{exe}\" --action compress --preset whatsapp -- \"%1\"")
            );

            let mp4_cmd = mp4_root.open_subkey(r"shell\03_mp4\command").unwrap();
            assert_eq!(
                read_val(&mp4_cmd, ""),
                format!("\"{exe}\" --action convert --to mp4 -- \"%1\"")
            );

            let open_cmd = mp4_root.open_subkey(r"shell\99_open\command").unwrap();
            assert_eq!(
                read_val(&open_cmd, ""),
                format!("\"{exe}\" --action open -- \"%1\"")
            );

            // Verify all 18 extensions were registered
            for ext in VIDEO_EXTENSIONS
                .iter()
                .chain(AUDIO_EXTENSIONS.iter())
                .chain(IMAGE_EXTENSIONS.iter())
            {
                let path = format!(r"{TEST_PREFIX}\{ext}\shell\MediaForge");
                assert!(
                    hkcu.open_subkey(&path).is_ok(),
                    "expected registry key: {path}"
                );
            }

            // Verify audio commands
            let mp3_root = hkcu
                .open_subkey(format!(r"{TEST_PREFIX}\.mp3\shell\MediaForge"))
                .unwrap();
            let mp3_item = mp3_root.open_subkey(r"shell\01_mp3").unwrap();
            assert_eq!(read_val(&mp3_item, "MUIVerb"), "Convertir en MP3");
            let mp3_cmd = mp3_item.open_subkey("command").unwrap();
            assert_eq!(
                read_val(&mp3_cmd, ""),
                format!("\"{exe}\" --action convert --to mp3 -- \"%1\"")
            );
            let mp3_open_cmd = mp3_root.open_subkey(r"shell\99_open\command").unwrap();
            assert_eq!(
                read_val(&mp3_open_cmd, ""),
                format!("\"{exe}\" --action open -- \"%1\"")
            );
            assert!(mp3_root.open_subkey(r"shell\01_discord").is_err());

            // Verify image commands
            let png_root = hkcu
                .open_subkey(format!(r"{TEST_PREFIX}\.png\shell\MediaForge"))
                .unwrap();
            let jpg_item = png_root.open_subkey(r"shell\01_jpg").unwrap();
            assert_eq!(read_val(&jpg_item, "MUIVerb"), "Convertir en JPG");
            assert_eq!(
                read_val(&jpg_item.open_subkey("command").unwrap(), ""),
                format!("\"{exe}\" --action convert --to jpg -- \"%1\"")
            );
            let png_item = png_root.open_subkey(r"shell\02_png").unwrap();
            assert_eq!(read_val(&png_item, "MUIVerb"), "Convertir en PNG");
            assert_eq!(
                read_val(&png_item.open_subkey("command").unwrap(), ""),
                format!("\"{exe}\" --action convert --to png -- \"%1\"")
            );
            let webp_item = png_root.open_subkey(r"shell\03_webp").unwrap();
            assert_eq!(read_val(&webp_item, "MUIVerb"), "Convertir en WebP");
            let webp_cmd = webp_item.open_subkey("command").unwrap();
            assert_eq!(
                read_val(&webp_cmd, ""),
                format!("\"{exe}\" --action convert --to webp -- \"%1\"")
            );
            let png_open_cmd = png_root.open_subkey(r"shell\99_open\command").unwrap();
            assert_eq!(
                read_val(&png_open_cmd, ""),
                format!("\"{exe}\" --action open -- \"%1\"")
            );

            // Re-register with English and confirm label update
            register_context_menu_at(TEST_PREFIX, exe, "en").unwrap();
            let en_discord = hkcu
                .open_subkey(format!(r"{TEST_PREFIX}\.mkv\shell\MediaForge\shell\01_discord"))
                .unwrap();
            assert_eq!(read_val(&en_discord, "MUIVerb"), "Compress for Discord (10 MB)");

            // Unregister and verify all 18 extension keys are removed
            unregister_context_menu_at(TEST_PREFIX).unwrap();
            assert!(!is_context_menu_registered_at(TEST_PREFIX).unwrap());

            for ext in VIDEO_EXTENSIONS
                .iter()
                .chain(AUDIO_EXTENSIONS.iter())
                .chain(IMAGE_EXTENSIONS.iter())
            {
                let path = format!(r"{TEST_PREFIX}\{ext}\shell\MediaForge");
                let err = hkcu.open_subkey(&path).unwrap_err();
                assert_eq!(err.kind(), ErrorKind::NotFound, "key remained: {path}");
            }
        }

        #[test]
        fn test_register_rejects_invalid_inputs() {
            assert!(register_context_menu_at(TEST_PREFIX, "", "en").is_err());
            assert!(
                register_context_menu_at(TEST_PREFIX, r#"C:\bad"path\MediaForge.exe"#, "en")
                    .is_err()
            );
            assert!(
                register_context_menu_at(TEST_PREFIX, r"C:\%TEMP%\MediaForge.exe", "en").is_err()
            );
            assert!(
                register_context_menu_at(TEST_PREFIX, "C:\\bad\npath\\MediaForge.exe", "en")
                    .is_err()
            );
            assert!(
                register_context_menu_at(TEST_PREFIX, "C:\\bad\rpath\\MediaForge.exe", "en")
                    .is_err()
            );
            assert!(register_context_menu_at("", r"C:\MediaForge.exe", "en").is_err());
        }
    }
}
