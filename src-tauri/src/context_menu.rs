//! Windows Explorer cascading context menu registration under `HKEY_CURRENT_USER`.
//!
//! Uses `HKCU\Software\Classes\SystemFileAssociations\<ext>\shell\Kompri`
//! so no administrator privileges are required.
//!
//! Releases up to v1.2.1 shipped as **MediaForge** and registered the cascade under
//! `shell\MediaForge`. Those legacy keys are removed whenever the Kompri menu is
//! (re-)registered or unregistered, so an upgraded install never shows both menus.

/// Supported video file extensions registered in Windows Explorer.
pub const VIDEO_EXTENSIONS: &[&str] = &[".mp4", ".mkv", ".avi", ".mov", ".webm"];

/// Supported audio file extensions registered in Windows Explorer.
pub const AUDIO_EXTENSIONS: &[&str] = &[".mp3", ".flac", ".wav", ".ogg", ".aac", ".m4a"];

/// Supported image file extensions registered in Windows Explorer.
pub const IMAGE_EXTENSIONS: &[&str] = &[".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".tif"];

#[cfg(target_os = "windows")]
const SYSTEM_FILE_ASSOC_PREFIX: &str = r"Software\Classes\SystemFileAssociations";

/// Registry key name (and cascade title) of the Explorer submenu.
pub const MENU_KEY_NAME: &str = "Kompri";

/// Submenu key names written by earlier releases (MediaForge <= v1.2.1), removed on migration.
pub const LEGACY_MENU_KEY_NAMES: &[&str] = &["MediaForge"];

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
                compress_discord: "Compresser pour Discord (20 Mo)",
                compress_whatsapp: "Compresser pour WhatsApp (16 Mo)",
                convert_mp4: "Convertir en MP4",
                convert_mp3: "Convertir en MP3",
                convert_jpg: "Convertir en JPG",
                convert_png: "Convertir en PNG",
                convert_webp: "Convertir en WebP",
                open_in_app: "Ouvrir dans Kompri…",
            },
            "es" => Self {
                compress_discord: "Comprimir para Discord (20 MB)",
                compress_whatsapp: "Comprimir para WhatsApp (16 MB)",
                convert_mp4: "Convertir a MP4",
                convert_mp3: "Convertir a MP3",
                convert_jpg: "Convertir a JPG",
                convert_png: "Convertir a PNG",
                convert_webp: "Convertir a WebP",
                open_in_app: "Abrir en Kompri…",
            },
            "de" => Self {
                compress_discord: "Für Discord komprimieren (20 MB)",
                compress_whatsapp: "Für WhatsApp komprimieren (16 MB)",
                convert_mp4: "In MP4 konvertieren",
                convert_mp3: "In MP3 konvertieren",
                convert_jpg: "In JPG konvertieren",
                convert_png: "In PNG konvertieren",
                convert_webp: "In WebP konvertieren",
                open_in_app: "In Kompri öffnen…",
            },
            "pt" => Self {
                compress_discord: "Comprimir para Discord (20 MB)",
                compress_whatsapp: "Comprimir para WhatsApp (16 MB)",
                convert_mp4: "Converter para MP4",
                convert_mp3: "Converter para MP3",
                convert_jpg: "Converter para JPG",
                convert_png: "Converter para PNG",
                convert_webp: "Converter para WebP",
                open_in_app: "Abrir no Kompri…",
            },
            _ => Self {
                compress_discord: "Compress for Discord (20 MB)",
                compress_whatsapp: "Compress for WhatsApp (16 MB)",
                convert_mp4: "Convert to MP4",
                convert_mp3: "Convert to MP3",
                convert_jpg: "Convert to JPG",
                convert_png: "Convert to PNG",
                convert_webp: "Convert to WebP",
                open_in_app: "Open in Kompri…",
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

/// Checks whether the Kompri context menu is currently registered under `HKCU`.
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

/// Synchronizes the Windows Explorer context menu on startup when upgrading or when enabled in settings.
///
/// Re-writes the `HKCU` registry entries with the current executable path and language when
/// `enabled_in_settings` is `true` or existing entries are already registered.
pub fn sync_context_menu_on_startup(enabled_in_settings: bool, lang: &str) -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        let exe_path = windows_impl::current_exe_path()?;
        migrate_context_menu_at(SYSTEM_FILE_ASSOC_PREFIX, &exe_path, enabled_in_settings, lang)
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (enabled_in_settings, lang);
        Ok(false)
    }
}

/// Migrates or refreshes Explorer context menus under `HKCU\<base_prefix>` on startup.
///
/// Re-registers the menu with `exe_path` and `lang` if `enabled_in_settings` is `true` or
/// if entries are already registered under `base_prefix`, either as Kompri or under a legacy
/// name (e.g. upgrading from MediaForge v1.2.1 `MediaForge.exe` to Kompri v1.2.2 `Kompri.exe`).
/// Re-registering removes the legacy `shell\MediaForge` keys.
#[cfg(target_os = "windows")]
pub fn migrate_context_menu_at(
    base_prefix: &str,
    exe_path: &str,
    enabled_in_settings: bool,
    lang: &str,
) -> Result<bool, String> {
    let registered = is_context_menu_registered_at(base_prefix)?
        || windows_impl::is_legacy_registered_at(base_prefix)?;
    if enabled_in_settings || registered {
        register_context_menu_at(base_prefix, exe_path, lang)?;
        Ok(true)
    } else {
        Ok(false)
    }
}

/// Registers cascading Explorer context menus under `HKCU\<base_prefix>\<ext>\shell\Kompri`
/// and removes any legacy `shell\MediaForge` keys.
#[cfg(target_os = "windows")]
pub fn register_context_menu_at(
    base_prefix: &str,
    exe_path: &str,
    lang: &str,
) -> Result<(), String> {
    windows_impl::register_at(base_prefix, exe_path, lang)
}

/// Removes cascading Explorer context menus under `HKCU\<base_prefix>\<ext>\shell\Kompri`
/// (and any legacy `shell\MediaForge` keys).
#[cfg(target_os = "windows")]
pub fn unregister_context_menu_at(base_prefix: &str) -> Result<(), String> {
    windows_impl::unregister_at(base_prefix)
}

/// Returns `true` if any supported extension has `HKCU\<base_prefix>\<ext>\shell\Kompri`.
#[cfg(target_os = "windows")]
pub fn is_context_menu_registered_at(base_prefix: &str) -> Result<bool, String> {
    windows_impl::is_registered_at(base_prefix)
}

#[cfg(target_os = "windows")]
mod windows_impl {
    use super::{
        MenuLabels, AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, LEGACY_MENU_KEY_NAMES, MENU_KEY_NAME,
        VIDEO_EXTENSIONS,
    };
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
        named_key_path(prefix, ext, MENU_KEY_NAME)
    }

    fn named_key_path(prefix: &str, ext: &str, name: &str) -> String {
        format!(r"{prefix}\{ext}\shell\{name}")
    }

    fn delete_tree_if_present(hkcu: &RegKey, key_path: &str) -> Result<(), String> {
        match hkcu.delete_subkey_all(key_path) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == ErrorKind::NotFound => Ok(()),
            Err(e) => Err(format!("Failed to remove registry key '{key_path}': {e}")),
        }
    }

    /// Removes the submenus written by earlier releases (`shell\MediaForge`).
    fn remove_legacy_at(hkcu: &RegKey, prefix: &str) -> Result<(), String> {
        for name in LEGACY_MENU_KEY_NAMES {
            for ext in all_extensions() {
                delete_tree_if_present(hkcu, &named_key_path(prefix, ext, name))?;
            }
        }
        Ok(())
    }

    /// Returns `true` if any supported extension still has a legacy (`shell\MediaForge`) submenu.
    pub fn is_legacy_registered_at(base_prefix: &str) -> Result<bool, String> {
        let prefix = validate_prefix(base_prefix)?;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        for name in LEGACY_MENU_KEY_NAMES {
            for ext in all_extensions() {
                let key_path = named_key_path(prefix, ext, name);
                match hkcu.open_subkey(&key_path) {
                    Ok(_) => return Ok(true),
                    Err(e) if e.kind() == ErrorKind::NotFound => {}
                    Err(e) => {
                        return Err(format!("Failed to inspect registry key '{key_path}': {e}"));
                    }
                }
            }
        }
        Ok(false)
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
            .set_value("MUIVerb", &MENU_KEY_NAME)
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

        remove_legacy_at(&hkcu, prefix)?;

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
            delete_tree_if_present(&hkcu, &menu_key_path(prefix, ext))?;
        }
        remove_legacy_at(&hkcu, prefix)
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
        assert_eq!(fr.compress_discord, "Compresser pour Discord (20 Mo)");
        assert_eq!(fr.compress_whatsapp, "Compresser pour WhatsApp (16 Mo)");
        assert_eq!(fr.convert_mp4, "Convertir en MP4");
        assert_eq!(fr.convert_mp3, "Convertir en MP3");
        assert_eq!(fr.convert_jpg, "Convertir en JPG");
        assert_eq!(fr.convert_png, "Convertir en PNG");
        assert_eq!(fr.convert_webp, "Convertir en WebP");
        assert_eq!(fr.open_in_app, "Ouvrir dans Kompri…");

        let en = MenuLabels::for_lang("en");
        assert_eq!(en.compress_discord, "Compress for Discord (20 MB)");
        assert_eq!(en.compress_whatsapp, "Compress for WhatsApp (16 MB)");
        assert_eq!(en.convert_mp4, "Convert to MP4");
        assert_eq!(en.convert_mp3, "Convert to MP3");
        assert_eq!(en.convert_jpg, "Convert to JPG");
        assert_eq!(en.convert_png, "Convert to PNG");
        assert_eq!(en.convert_webp, "Convert to WebP");
        assert_eq!(en.open_in_app, "Open in Kompri…");

        let es = MenuLabels::for_lang("es");
        assert_eq!(es.compress_discord, "Comprimir para Discord (20 MB)");
        assert_eq!(es.compress_whatsapp, "Comprimir para WhatsApp (16 MB)");
        assert_eq!(es.convert_mp4, "Convertir a MP4");
        assert_eq!(es.convert_mp3, "Convertir a MP3");
        assert_eq!(es.convert_jpg, "Convertir a JPG");
        assert_eq!(es.convert_png, "Convertir a PNG");
        assert_eq!(es.convert_webp, "Convertir a WebP");
        assert_eq!(es.open_in_app, "Abrir en Kompri…");

        let de = MenuLabels::for_lang("de");
        assert_eq!(de.compress_discord, "Für Discord komprimieren (20 MB)");
        assert_eq!(de.compress_whatsapp, "Für WhatsApp komprimieren (16 MB)");
        assert_eq!(de.convert_mp4, "In MP4 konvertieren");
        assert_eq!(de.convert_mp3, "In MP3 konvertieren");
        assert_eq!(de.convert_jpg, "In JPG konvertieren");
        assert_eq!(de.convert_png, "In PNG konvertieren");
        assert_eq!(de.convert_webp, "In WebP konvertieren");
        assert_eq!(de.open_in_app, "In Kompri öffnen…");

        let pt = MenuLabels::for_lang("pt");
        assert_eq!(pt.compress_discord, "Comprimir para Discord (20 MB)");
        assert_eq!(pt.compress_whatsapp, "Comprimir para WhatsApp (16 MB)");
        assert_eq!(pt.convert_mp4, "Converter para MP4");
        assert_eq!(pt.convert_mp3, "Converter para MP3");
        assert_eq!(pt.convert_jpg, "Converter para JPG");
        assert_eq!(pt.convert_png, "Converter para PNG");
        assert_eq!(pt.convert_webp, "Converter para WebP");
        assert_eq!(pt.open_in_app, "Abrir no Kompri…");

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

        const TEST_PREFIX: &str = r"Software\Kompri_UnitTest_ContextMenu";
        const TEST_MIGRATION_PREFIX: &str = r"Software\Kompri_UnitTest_ContextMenu_Migration";
        const TEST_MIGRATION_EDGE_PREFIX: &str =
            r"Software\Kompri_UnitTest_ContextMenu_MigrationEdge";
        const TEST_RENAME_PREFIX: &str =
            r"Software\Kompri_UnitTest_ContextMenu_RenameFromMediaForge";
        const TEST_RENAME_DISABLE_PREFIX: &str =
            r"Software\Kompri_UnitTest_ContextMenu_RenameDisable";

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
            let exe = r"C:\Program Files\Kompri\Kompri.exe";

            assert!(!is_context_menu_registered_at(TEST_PREFIX).unwrap());

            register_context_menu_at(TEST_PREFIX, exe, "fr").unwrap();
            assert!(is_context_menu_registered_at(TEST_PREFIX).unwrap());

            // Verify video root & subcommands
            let mp4_root = hkcu
                .open_subkey(format!(r"{TEST_PREFIX}\.mp4\shell\Kompri"))
                .unwrap();
            assert_eq!(read_val(&mp4_root, "MUIVerb"), "Kompri");
            assert_eq!(read_val(&mp4_root, "Icon"), format!("\"{exe}\",0"));
            assert_eq!(read_val(&mp4_root, "SubCommands"), "");

            let discord_item = mp4_root.open_subkey(r"shell\01_discord").unwrap();
            assert_eq!(
                read_val(&discord_item, "MUIVerb"),
                "Compresser pour Discord (20 Mo)"
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
                let path = format!(r"{TEST_PREFIX}\{ext}\shell\Kompri");
                assert!(
                    hkcu.open_subkey(&path).is_ok(),
                    "expected registry key: {path}"
                );
            }

            // Verify audio commands
            let mp3_root = hkcu
                .open_subkey(format!(r"{TEST_PREFIX}\.mp3\shell\Kompri"))
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
                .open_subkey(format!(r"{TEST_PREFIX}\.png\shell\Kompri"))
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
                .open_subkey(format!(r"{TEST_PREFIX}\.mkv\shell\Kompri\shell\01_discord"))
                .unwrap();
            assert_eq!(read_val(&en_discord, "MUIVerb"), "Compress for Discord (20 MB)");

            // Unregister and verify all 18 extension keys are removed
            unregister_context_menu_at(TEST_PREFIX).unwrap();
            assert!(!is_context_menu_registered_at(TEST_PREFIX).unwrap());

            for ext in VIDEO_EXTENSIONS
                .iter()
                .chain(AUDIO_EXTENSIONS.iter())
                .chain(IMAGE_EXTENSIONS.iter())
            {
                let path = format!(r"{TEST_PREFIX}\{ext}\shell\Kompri");
                let err = hkcu.open_subkey(&path).unwrap_err();
                assert_eq!(err.kind(), ErrorKind::NotFound, "key remained: {path}");
            }
        }

        #[test]
        fn test_register_rejects_invalid_inputs() {
            assert!(register_context_menu_at(TEST_PREFIX, "", "en").is_err());
            assert!(
                register_context_menu_at(TEST_PREFIX, r#"C:\bad"path\Kompri.exe"#, "en")
                    .is_err()
            );
            assert!(
                register_context_menu_at(TEST_PREFIX, r"C:\%TEMP%\Kompri.exe", "en").is_err()
            );
            assert!(
                register_context_menu_at(TEST_PREFIX, "C:\\bad\npath\\Kompri.exe", "en")
                    .is_err()
            );
            assert!(
                register_context_menu_at(TEST_PREFIX, "C:\\bad\rpath\\Kompri.exe", "en")
                    .is_err()
            );
            assert!(register_context_menu_at("", r"C:\Kompri.exe", "en").is_err());
        }

        #[test]
        fn test_startup_migration_refreshes_exe_path() {
            let _guard = TestRegistryGuard::new(TEST_MIGRATION_PREFIX);
            let hkcu = RegKey::predef(HKEY_CURRENT_USER);
            let old_exe = r"C:\Users\Test\AppData\Local\Kompri\old-build\Kompri.exe";
            let new_exe = r"C:\Users\Test\AppData\Local\Kompri\Kompri.exe";

            // 1. Simulate a menu registered by a previous build at another path
            register_context_menu_at(TEST_MIGRATION_PREFIX, old_exe, "fr").unwrap();
            let old_discord_cmd = hkcu
                .open_subkey(format!(
                    r"{TEST_MIGRATION_PREFIX}\.mp4\shell\Kompri\shell\01_discord\command"
                ))
                .unwrap();
            assert_eq!(
                read_val(&old_discord_cmd, ""),
                format!("\"{old_exe}\" --action compress --preset discord -- \"%1\"")
            );

            // 2. Simulate startup migration to the current Kompri.exe
            let migrated =
                migrate_context_menu_at(TEST_MIGRATION_PREFIX, new_exe, true, "fr").unwrap();
            assert!(migrated);

            // 3. Verify HKCU commands & icons now point to the current Kompri.exe
            let new_mp4_root = hkcu
                .open_subkey(format!(r"{TEST_MIGRATION_PREFIX}\.mp4\shell\Kompri"))
                .unwrap();
            assert_eq!(read_val(&new_mp4_root, "Icon"), format!("\"{new_exe}\",0"));

            let new_discord_cmd = new_mp4_root
                .open_subkey(r"shell\01_discord\command")
                .unwrap();
            assert_eq!(
                read_val(&new_discord_cmd, ""),
                format!("\"{new_exe}\" --action compress --preset discord -- \"%1\"")
            );

            let new_jpg_cmd = hkcu
                .open_subkey(format!(
                    r"{TEST_MIGRATION_PREFIX}\.png\shell\Kompri\shell\01_jpg\command"
                ))
                .unwrap();
            assert_eq!(
                read_val(&new_jpg_cmd, ""),
                format!("\"{new_exe}\" --action convert --to jpg -- \"%1\"")
            );
        }

        #[test]
        fn test_migration_respects_unregistered_disabled_and_registered_fallback() {
            let _guard = TestRegistryGuard::new(TEST_MIGRATION_EDGE_PREFIX);
            let hkcu = RegKey::predef(HKEY_CURRENT_USER);
            let old_exe = r"C:\Users\Test\AppData\Local\Kompri\old-build\Kompri.exe";
            let new_exe = r"C:\Users\Test\AppData\Local\Kompri\Kompri.exe";

            // Unregistered + disabled in settings => no-op, returns false
            assert!(
                !migrate_context_menu_at(TEST_MIGRATION_EDGE_PREFIX, new_exe, false, "en").unwrap()
            );
            assert!(!is_context_menu_registered_at(TEST_MIGRATION_EDGE_PREFIX).unwrap());

            // Registered previously (e.g. setting absent/false in store) => still migrates
            register_context_menu_at(TEST_MIGRATION_EDGE_PREFIX, old_exe, "en").unwrap();
            assert!(
                migrate_context_menu_at(TEST_MIGRATION_EDGE_PREFIX, new_exe, false, "en").unwrap()
            );
            let migrated_cmd = hkcu
                .open_subkey(format!(
                    r"{TEST_MIGRATION_EDGE_PREFIX}\.mp4\shell\Kompri\shell\01_discord\command"
                ))
                .unwrap();
            assert_eq!(
                read_val(&migrated_cmd, ""),
                format!("\"{new_exe}\" --action compress --preset discord -- \"%1\"")
            );
        }

        /// Writes the exact `shell\MediaForge` layout that MediaForge v1.2.1 registered.
        fn write_mediaforge_121_menu(prefix: &str, exe: &str) {
            type Item<'a> = (&'a str, &'a str, &'a str);
            let hkcu = RegKey::predef(HKEY_CURRENT_USER);
            let video: &[Item] = &[
                ("01_discord", "Compress for Discord (10 MB)", "--action compress --preset discord"),
                ("02_whatsapp", "Compress for WhatsApp (16 MB)", "--action compress --preset whatsapp"),
                ("03_mp4", "Convert to MP4", "--action convert --to mp4"),
                ("99_open", "Open in MediaForge…", "--action open"),
            ];
            let audio: &[Item] = &[
                ("01_mp3", "Convert to MP3", "--action convert --to mp3"),
                ("99_open", "Open in MediaForge…", "--action open"),
            ];
            let image: &[Item] = &[
                ("01_jpg", "Convert to JPG", "--action convert --to jpg"),
                ("02_png", "Convert to PNG", "--action convert --to png"),
                ("03_webp", "Convert to WebP", "--action convert --to webp"),
                ("99_open", "Open in MediaForge…", "--action open"),
            ];
            let groups: [(&[&str], &[Item]); 3] = [
                (VIDEO_EXTENSIONS, video),
                (AUDIO_EXTENSIONS, audio),
                (IMAGE_EXTENSIONS, image),
            ];
            for (exts, items) in groups {
                for ext in exts {
                    let (root, _) = hkcu
                        .create_subkey(format!(r"{prefix}\{ext}\shell\MediaForge"))
                        .unwrap();
                    root.set_value("MUIVerb", &"MediaForge").unwrap();
                    root.set_value("Icon", &format!("\"{exe}\",0")).unwrap();
                    root.set_value("SubCommands", &"").unwrap();
                    for (sub, label, args) in items {
                        let (item, _) = root.create_subkey(format!(r"shell\{sub}")).unwrap();
                        item.set_value("MUIVerb", label).unwrap();
                        let (cmd, _) = item.create_subkey("command").unwrap();
                        cmd.set_value("", &format!("\"{exe}\" {args} -- \"%1\""))
                            .unwrap();
                    }
                }
            }
        }

        /// Splits a registry `command` value the way Explorer does for our quoted format
        /// and substitutes `%1`, so the result can be fed to the real CLI parser.
        fn explorer_argv(command_line: &str, file: &str) -> Vec<String> {
            let mut argv = Vec::new();
            let mut cur = String::new();
            let mut in_quotes = false;
            for c in command_line.chars() {
                match c {
                    '"' => in_quotes = !in_quotes,
                    ' ' if !in_quotes => {
                        if !cur.is_empty() {
                            argv.push(std::mem::take(&mut cur));
                        }
                    }
                    _ => cur.push(c),
                }
            }
            if !cur.is_empty() {
                argv.push(cur);
            }
            argv.into_iter()
                .map(|a| if a == "%1" { file.to_string() } else { a })
                .collect()
        }

        #[test]
        fn test_upgrade_from_mediaforge_121_leaves_only_working_kompri_keys() {
            use crate::cli::{parse_cli_args, CliAction};

            let _guard = TestRegistryGuard::new(TEST_RENAME_PREFIX);
            let hkcu = RegKey::predef(HKEY_CURRENT_USER);
            let old_exe = r"C:\Users\Test\AppData\Local\MediaForge\MediaForge.exe";
            let new_exe = r"C:\Users\Test\AppData\Local\Kompri\Kompri.exe";

            // 1. MediaForge v1.2.1 is installed with the context menu enabled.
            write_mediaforge_121_menu(TEST_RENAME_PREFIX, old_exe);
            assert!(windows_impl::is_legacy_registered_at(TEST_RENAME_PREFIX).unwrap());
            assert!(!is_context_menu_registered_at(TEST_RENAME_PREFIX).unwrap());

            // 2. Kompri v1.2.2 starts for the first time (setting enabled, French UI).
            assert!(migrate_context_menu_at(TEST_RENAME_PREFIX, new_exe, true, "fr").unwrap());

            // 3. Only the Kompri keys remain, for all 18 extensions.
            assert!(!windows_impl::is_legacy_registered_at(TEST_RENAME_PREFIX).unwrap());
            for ext in VIDEO_EXTENSIONS
                .iter()
                .chain(AUDIO_EXTENSIONS.iter())
                .chain(IMAGE_EXTENSIONS.iter())
            {
                let shell = hkcu
                    .open_subkey(format!(r"{TEST_RENAME_PREFIX}\{ext}\shell"))
                    .unwrap();
                let names: Vec<String> = shell.enum_keys().map(|k| k.unwrap()).collect();
                assert_eq!(names, vec!["Kompri".to_string()], "unexpected verbs on {ext}");

                let root = shell.open_subkey("Kompri").unwrap();
                assert_eq!(read_val(&root, "MUIVerb"), "Kompri");
                assert_eq!(read_val(&root, "Icon"), format!("\"{new_exe}\",0"));
                let open = root.open_subkey(r"shell\99_open").unwrap();
                assert_eq!(read_val(&open, "MUIVerb"), "Ouvrir dans Kompri…");
            }

            // 4. The Kompri commands work: they launch Kompri.exe and the real CLI parser
            //    turns each of them into the expected request.
            let file = r"C:\Users\Test\Videos\my clip.mp4";
            let cases = [
                (".mp4", "01_discord", CliAction::Compress { preset: "discord".into() }),
                (".mov", "02_whatsapp", CliAction::Compress { preset: "whatsapp".into() }),
                (".mkv", "03_mp4", CliAction::Convert { to: "mp4".into() }),
                (".flac", "01_mp3", CliAction::Convert { to: "mp3".into() }),
                (".png", "03_webp", CliAction::Convert { to: "webp".into() }),
                (".jpg", "99_open", CliAction::Open),
            ];
            for (ext, sub, expected) in cases {
                let cmd = hkcu
                    .open_subkey(format!(
                        r"{TEST_RENAME_PREFIX}\{ext}\shell\Kompri\shell\{sub}\command"
                    ))
                    .unwrap();
                let line = read_val(&cmd, "");
                let argv = explorer_argv(&line, file);
                assert_eq!(argv[0], new_exe, "command must launch Kompri.exe: {line}");
                let req = parse_cli_args(&argv)
                    .unwrap_or_else(|| panic!("CLI rejected registry command: {line}"));
                assert_eq!(req.action, expected, "{ext} {sub}");
                assert_eq!(req.files, vec![file.to_string()]);
            }
            let discord = hkcu
                .open_subkey(format!(
                    r"{TEST_RENAME_PREFIX}\.mp4\shell\Kompri\shell\01_discord"
                ))
                .unwrap();
            assert_eq!(read_val(&discord, "MUIVerb"), "Compresser pour Discord (20 Mo)");

            // 5. A second startup is idempotent.
            assert!(migrate_context_menu_at(TEST_RENAME_PREFIX, new_exe, true, "fr").unwrap());
            assert!(is_context_menu_registered_at(TEST_RENAME_PREFIX).unwrap());
            assert!(!windows_impl::is_legacy_registered_at(TEST_RENAME_PREFIX).unwrap());
        }

        #[test]
        fn test_legacy_mediaforge_keys_alone_trigger_migration_and_unregister_removes_them() {
            let _guard = TestRegistryGuard::new(TEST_RENAME_DISABLE_PREFIX);
            let old_exe = r"C:\Users\Test\AppData\Local\MediaForge\MediaForge.exe";
            let new_exe = r"C:\Users\Test\AppData\Local\Kompri\Kompri.exe";

            // Setting missing/false but the MediaForge menu is present => still migrated.
            write_mediaforge_121_menu(TEST_RENAME_DISABLE_PREFIX, old_exe);
            assert!(
                migrate_context_menu_at(TEST_RENAME_DISABLE_PREFIX, new_exe, false, "en").unwrap()
            );
            assert!(is_context_menu_registered_at(TEST_RENAME_DISABLE_PREFIX).unwrap());
            assert!(!windows_impl::is_legacy_registered_at(TEST_RENAME_DISABLE_PREFIX).unwrap());

            // Disabling the integration removes Kompri keys and any legacy leftovers.
            write_mediaforge_121_menu(TEST_RENAME_DISABLE_PREFIX, old_exe);
            unregister_context_menu_at(TEST_RENAME_DISABLE_PREFIX).unwrap();
            assert!(!is_context_menu_registered_at(TEST_RENAME_DISABLE_PREFIX).unwrap());
            assert!(!windows_impl::is_legacy_registered_at(TEST_RENAME_DISABLE_PREFIX).unwrap());

            // Nothing registered and disabled => no-op.
            assert!(
                !migrate_context_menu_at(TEST_RENAME_DISABLE_PREFIX, new_exe, false, "en").unwrap()
            );
            assert!(!is_context_menu_registered_at(TEST_RENAME_DISABLE_PREFIX).unwrap());
        }
    }
}
