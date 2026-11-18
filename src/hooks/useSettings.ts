import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import i18n from "../i18n";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppSettings {
  language: string;
  theme: "dark" | "light";
  output_dir: string | null;
  default_video_format: string;
  default_audio_format: string;
  default_image_format: string;
  preset_discord_mb?: number;
  preset_whatsapp_mb?: number;
  preset_gmail_mb?: number;
  context_menu_enabled?: boolean;
  target_size_max_quality?: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  language: "en",
  theme: "dark",
  output_dir: null,
  default_video_format: "mp4",
  default_audio_format: "mp3",
  default_image_format: "webp",
  preset_discord_mb: 20,
  preset_whatsapp_mb: 16,
  preset_gmail_mb: 25,
  context_menu_enabled: false,
  target_size_max_quality: false,
};

function validMb(v: unknown, fallback?: number): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback;
}

// ─── Theme helper ─────────────────────────────────────────────────────────────

function applyTheme(theme: "dark" | "light") {
  document.documentElement.setAttribute("data-theme", theme);
  // Mirror to localStorage so the flash-prevention script can use it
  localStorage.setItem("mf-theme", theme);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    invoke<AppSettings>("get_settings")
      .then((s) => {
        const merged: AppSettings = {
          ...DEFAULT_SETTINGS,
          ...s,
          preset_discord_mb: validMb(s?.preset_discord_mb, DEFAULT_SETTINGS.preset_discord_mb),
          preset_whatsapp_mb: s?.preset_whatsapp_mb ?? DEFAULT_SETTINGS.preset_whatsapp_mb,
          preset_gmail_mb: s?.preset_gmail_mb ?? DEFAULT_SETTINGS.preset_gmail_mb,
          context_menu_enabled: s?.context_menu_enabled ?? DEFAULT_SETTINGS.context_menu_enabled,
          target_size_max_quality:
            s?.target_size_max_quality ?? DEFAULT_SETTINGS.target_size_max_quality,
        };
        setSettings(merged);
        applyTheme(merged.theme);
        i18n.changeLanguage(merged.language);
      })
      .catch(() => {
        // Use defaults if store unavailable; still apply default theme
        applyTheme(DEFAULT_SETTINGS.theme);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const updateSettings = useCallback(
    async (partial: Partial<AppSettings>) => {
      const next = { ...settings, ...partial } as AppSettings;
      setSettings(next);
      if (partial.theme !== undefined) applyTheme(partial.theme);
      if (partial.language !== undefined) {
        i18n.changeLanguage(partial.language);
        if (next.context_menu_enabled) {
          invoke("set_context_menu_enabled", {
            enabled: true,
            language: partial.language,
          }).catch(() => {});
        }
      }
      await invoke("save_settings", {
        settings: next,
      } as unknown as Record<string, unknown>);
    },
    [settings]
  );

  return { settings, updateSettings, isLoading };
}
