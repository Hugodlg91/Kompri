import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-dialog";
import { useSettingsContext } from "../../context/SettingsContext";
import { IcnChevronDown, IcnFolder, IcnX, IcnCheck, IcnMoon, IcnSun, IcnSparkles, IcnFile } from "../ui/Icons";

const LANGUAGES = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
];

const VIDEO_FORMATS = ["mp4", "mkv", "avi", "mov", "webm"];
const AUDIO_FORMATS = ["mp3", "flac", "wav", "ogg", "aac", "m4a"];
const IMAGE_FORMATS = ["png", "jpg", "webp", "bmp", "tiff"];

const FALLBACK_THIRD_PARTY_NOTICES = `Third-Party Software Notices — Kompri

Kompri bundles unmodified static binaries of FFmpeg and FFprobe as local sidecars for offline media conversion and probing.

1. FFmpeg & FFprobe
   License: GNU General Public License v3.0 (GPLv3)
   Reason:  Prebuilt binaries are compiled with GPL-licensed encoders and libraries (--enable-gpl --enable-version3 --enable-libx264 --enable-libx265).

   Platform Binaries:
   - Windows (x86_64): gyan.dev FFmpeg Essentials / Full builds
     https://www.gyan.dev/ffmpeg/builds/
   - macOS (arm64 / aarch64): eugeneware/ffmpeg-static (static Darwin builds)
     https://github.com/eugeneware/ffmpeg-static
   - Linux (x86_64): johnvansickle.com static FFmpeg builds
     https://johnvansickle.com/ffmpeg/

   Corresponding Source Code:
   - Official FFmpeg website & source tarballs: https://ffmpeg.org
   - Official FFmpeg Git mirror: https://github.com/FFmpeg/FFmpeg

   You may obtain the complete corresponding source code for FFmpeg under the terms of the GNU General Public License v3.0 at the links above.`;

// ── PillSelect with SVG chevron ──────────────────────────────────────────────

function PillSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [coords, setCoords] = useState<{
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
    width: number;
  }>({ width: 150 });

  const updateCoords = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const estimatedHeight = options.length * 34 + 16;
    const openUpward = rect.bottom + estimatedHeight > window.innerHeight - 12;
    const width = Math.max(rect.width, 150);
    const alignRight = rect.right - width >= 12;

    setCoords({
      top: openUpward ? undefined : rect.bottom + 6,
      bottom: openUpward ? window.innerHeight - rect.top + 6 : undefined,
      left: alignRight ? undefined : Math.max(12, rect.left),
      right: alignRight ? Math.max(12, window.innerWidth - rect.right) : undefined,
      width,
    });
  };

  useEffect(() => {
    if (!isOpen) return;

    updateCoords();

    const handleResizeOrScroll = () => {
      updateCoords();
    };

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        !buttonRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    window.addEventListener("resize", handleResizeOrScroll);
    window.addEventListener("scroll", handleResizeOrScroll, true);
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("resize", handleResizeOrScroll);
      window.removeEventListener("scroll", handleResizeOrScroll, true);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, options.length]);

  const current = options.find((o) => o.value === value);

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={buttonRef}
        type="button"
        className="glass-select"
        onClick={() => {
          if (!isOpen) updateCoords();
          setIsOpen((v) => !v);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "12px",
          padding: "8px 12px",
          border: isOpen ? "1px solid var(--accent)" : "1px solid var(--border2)",
          borderRadius: "10px",
          color: "var(--text)",
          background: "var(--surface)",
          backdropFilter: "var(--glass-blur)",
          WebkitBackdropFilter: "var(--glass-blur)",
          cursor: "pointer",
          minWidth: "120px",
          width: "100%",
          justifyContent: "space-between",
          transition: "border-color 0.15s, box-shadow 0.15s",
          fontWeight: 500,
          boxShadow: "var(--shadow-sm)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)";
        }}
        onMouseLeave={(e) => {
          if (!isOpen) (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border2)";
        }}
      >
        <span>{current?.label ?? value}</span>
        <span
          style={{
            color: "var(--muted)",
            display: "flex",
            transition: "transform 0.15s",
            transform: isOpen ? "rotate(180deg)" : "rotate(0)",
          }}
        >
          <IcnChevronDown size={13} strokeWidth={2} />
        </span>
      </button>

      {isOpen &&
        (coords.top !== undefined || coords.bottom !== undefined) &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            className="fade-in glass-panel"
            style={{
              position: "fixed",
              top: coords.top !== undefined ? `${coords.top}px` : undefined,
              bottom: coords.bottom !== undefined ? `${coords.bottom}px` : undefined,
              left: coords.left !== undefined ? `${coords.left}px` : undefined,
              right: coords.right !== undefined ? `${coords.right}px` : undefined,
              minWidth: `${coords.width}px`,
              zIndex: 9999,
              background: "var(--popover-bg, var(--surface-solid))",
              backdropFilter: "var(--glass-blur)",
              WebkitBackdropFilter: "var(--glass-blur)",
              border: "1px solid var(--border2)",
              borderRadius: "12px",
              padding: "5px",
              boxShadow: "var(--shadow), inset 0 1px 0 var(--glass-highlight)",
              display: "flex",
              flexDirection: "column",
              gap: "2px",
            }}
          >
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setIsOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "8px",
                  textAlign: "left",
                  padding: "7px 10px",
                  borderRadius: "8px",
                  border: "none",
                  fontSize: "12px",
                  cursor: "pointer",
                  color: o.value === value ? "var(--accent)" : "var(--text)",
                  background: o.value === value ? "var(--accent-dim)" : "transparent",
                  fontWeight: o.value === value ? 600 : 400,
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (o.value !== value) (e.currentTarget as HTMLButtonElement).style.background = "var(--surface2)";
                }}
                onMouseLeave={(e) => {
                  if (o.value !== value) (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                }}
              >
                <span>{o.label}</span>
                {o.value === value && <IcnCheck size={12} strokeWidth={2.5} />}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

// ── SectionCard ──────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="card glass-card"
      style={{
        background: "var(--surface)",
        backdropFilter: "var(--glass-blur)",
        WebkitBackdropFilter: "var(--glass-blur)",
        border: "1px solid var(--border)",
        borderRadius: "16px",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <h3
        style={{
          fontSize: "10px",
          color: "var(--muted)",
          letterSpacing: "0.12em",
          fontWeight: 700,
          textTransform: "uppercase",
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
      <label style={{ fontSize: "13px", color: "var(--text)", flexShrink: 0, fontWeight: 500 }}>{label}</label>
      <div>{children}</div>
    </div>
  );
}

// ── ThemeToggle ───────────────────────────────────────────────────────────────

function ThemeToggle({ value, onChange }: { value: "dark" | "light"; onChange: (v: "dark" | "light") => void }) {
  const { t } = useTranslation();
  return (
    <div className="seg-ctrl" style={{ minWidth: "170px" }}>
      <button
        className={value === "dark" ? "active" : ""}
        onClick={() => onChange("dark")}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px", flex: 1 }}
      >
        <IcnMoon size={13} />
        <span>{t("settings.themeDark")}</span>
      </button>
      <button
        className={value === "light" ? "active" : ""}
        onClick={() => onChange("light")}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px", flex: 1 }}
      >
        <IcnSun size={13} />
        <span>{t("settings.themeLight")}</span>
      </button>
    </div>
  );
}

function PresetNumberInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      <label
        style={{
          fontSize: "10px",
          fontWeight: 600,
          color: "var(--muted)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </label>
      <input
        type="number"
        min={1}
        step={1}
        aria-label={label}
        className="glass-input"
        value={draft}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          const n = parseFloat(raw);
          if (!Number.isNaN(n) && n >= 1) {
            onCommit(n);
          }
        }}
        onBlur={() => {
          const n = parseFloat(draft);
          if (Number.isNaN(n) || n < 1) {
            setDraft(String(value));
          }
        }}
        style={{ width: "100%" }}
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettingsContext();
  const [version, setVersion] = useState("");
  const [platform, setPlatform] = useState<string>("unknown");
  const [contextMenuEnabled, setContextMenuEnabled] = useState<boolean>(false);
  const [contextMenuBusy, setContextMenuBusy] = useState(false);
  const [licensesOpen, setLicensesOpen] = useState(false);
  const [licensesText, setLicensesText] = useState<string>(FALLBACK_THIRD_PARTY_NOTICES);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("0.1.0"));
  }, []);

  useEffect(() => {
    if (!licensesOpen) return;
    let cancelled = false;
    invoke<string>("get_third_party_notices")
      .then((notice) => {
        if (cancelled) return;
        const resolved =
          typeof notice === "string" && notice.trim().length > 0
            ? notice
            : FALLBACK_THIRD_PARTY_NOTICES;
        setLicensesText((prev) => (prev === resolved ? prev : resolved));
      })
      .catch(() => {
        if (!cancelled) {
          setLicensesText((prev) =>
            prev === FALLBACK_THIRD_PARTY_NOTICES ? prev : FALLBACK_THIRD_PARTY_NOTICES
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [licensesOpen]);

  useEffect(() => {
    let cancelled = false;
    invoke<string>("get_platform")
      .catch(() => "unknown")
      .then((p) => {
        if (cancelled) return;
        const resolved = typeof p === "string" ? p : "unknown";
        setPlatform(resolved);
        if (resolved === "windows") {
          invoke<boolean>("get_context_menu_status")
            .catch(() => false)
            .then((enabled) => {
              if (!cancelled) setContextMenuEnabled(Boolean(enabled));
            });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLanguageChange = async (newLang: string) => {
    await updateSettings({ language: newLang });
    if (contextMenuEnabled && !settings.context_menu_enabled) {
      invoke("set_context_menu_enabled", { enabled: true, language: newLang }).catch(() => {});
    }
  };

  const handleToggleContextMenu = async () => {
    if (contextMenuBusy) return;
    const nextValue = !contextMenuEnabled;
    setContextMenuBusy(true);
    try {
      const actual = await invoke<boolean>("set_context_menu_enabled", {
        enabled: nextValue,
        language: settings.language,
      });
      const finalValue = typeof actual === "boolean" ? actual : nextValue;
      setContextMenuEnabled(finalValue);
      await updateSettings({ context_menu_enabled: finalValue });
    } catch {
      // keep previous state on error
    } finally {
      setContextMenuBusy(false);
    }
  };

  const handlePickFolder = async () => {
    const result = await open({ directory: true, multiple: false });
    if (typeof result === "string") await updateSettings({ output_dir: result });
  };

  const langOptions  = LANGUAGES.map((l) => ({ value: l.code,  label: l.label }));
  const videoOptions = VIDEO_FORMATS.map((f) => ({ value: f, label: f.toUpperCase() }));
  const audioOptions = AUDIO_FORMATS.map((f) => ({ value: f, label: f.toUpperCase() }));
  const imageOptions = IMAGE_FORMATS.map((f) => ({ value: f, label: f.toUpperCase() }));

  return (
    <div className="page-container">
      <h2 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text)", lineHeight: 1.2 }}>
        {t("settings.title")}
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "720px", width: "100%" }}>

        {/* ── Appearance ───────────────────────────────────────────────────── */}
        <SectionCard title={t("settings.appearance")}>
          <SettingRow label={t("settings.theme")}>
            <ThemeToggle value={settings.theme} onChange={(v) => updateSettings({ theme: v })} />
          </SettingRow>
          <SettingRow label={t("settings.language")}>
            <PillSelect value={settings.language} options={langOptions} onChange={handleLanguageChange} />
          </SettingRow>
        </SectionCard>

        {/* ── Conversion ───────────────────────────────────────────────────── */}
        <SectionCard title={t("settings.conversion")}>
          {/* Output folder */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ fontSize: "13px", fontWeight: 500, color: "var(--text)" }}>{t("settings.outputDir")}</label>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
              <div
                className="glass-input"
                style={{
                  flex: "1 1 200px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "var(--surface2)",
                  backdropFilter: "var(--glass-blur)",
                  WebkitBackdropFilter: "var(--glass-blur)",
                  border: "1px solid var(--border2)",
                  borderRadius: "10px",
                  padding: "8px 12px",
                  minWidth: "160px",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <IcnFolder size={14} color="var(--muted)" />
                <span
                  style={{
                    fontSize: "12px",
                    color: settings.output_dir ? "var(--text)" : "var(--muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                  }}
                  title={settings.output_dir ?? ""}
                >
                  {settings.output_dir ?? t("settings.outputDirDefault")}
                </span>
              </div>
              <button className="btn-ghost" onClick={handlePickFolder} style={{ fontSize: "12px", padding: "8px 12px", flexShrink: 0 }}>
                {t("settings.chooseFolder")}
              </button>
              {settings.output_dir && (
                <button
                  className="btn-ghost"
                  onClick={() => updateSettings({ output_dir: null })}
                  style={{ padding: "8px", flexShrink: 0 }}
                  title={t("settings.reset")}
                >
                  <IcnX size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Default formats */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ fontSize: "13px", fontWeight: 500, color: "var(--text)" }}>{t("settings.defaultFormats")}</label>
            <div className="responsive-grid-3">
              {[
                { label: t("settings.defaultVideo"), val: settings.default_video_format, opts: videoOptions, key: "default_video_format" },
                { label: t("settings.defaultAudio"), val: settings.default_audio_format, opts: audioOptions, key: "default_audio_format" },
                { label: t("settings.defaultImage"), val: settings.default_image_format, opts: imageOptions, key: "default_image_format" },
              ].map(({ label, val, opts, key }) => (
                <div key={key} style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    {label}
                  </span>
                  <PillSelect value={val} options={opts} onChange={(v) => updateSettings({ [key]: v } as Record<string, string>)} />
                </div>
              ))}
            </div>
          </div>

          {/* Target size presets */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ fontSize: "13px", fontWeight: 500, color: "var(--text)" }}>
              {t("settings.targetSizePresets")}
            </label>
            <div className="responsive-grid-3">
              <PresetNumberInput
                label="Discord (MB)"
                value={settings.preset_discord_mb ?? 10}
                onCommit={(v) => updateSettings({ preset_discord_mb: v })}
              />
              <PresetNumberInput
                label="WhatsApp (MB)"
                value={settings.preset_whatsapp_mb ?? 16}
                onCommit={(v) => updateSettings({ preset_whatsapp_mb: v })}
              />
              <PresetNumberInput
                label="Gmail (MB)"
                value={settings.preset_gmail_mb ?? 25}
                onCommit={(v) => updateSettings({ preset_gmail_mb: v })}
              />
            </div>
          </div>
        </SectionCard>

        {/* ── Windows Explorer Context Menu ────────────────────────────────── */}
        {platform === "windows" && (
          <SectionCard title="Windows Explorer">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
                <label
                  htmlFor="context-menu-toggle"
                  style={{ fontSize: "13px", color: "var(--text)", fontWeight: 500, cursor: "pointer" }}
                >
                  {t("settings.contextMenu")}
                </label>
                <span style={{ fontSize: "11px", color: "var(--muted)", lineHeight: 1.4 }}>
                  {t("settings.contextMenuHint")}
                </span>
              </div>
              <button
                id="context-menu-toggle"
                type="button"
                role="switch"
                aria-checked={contextMenuEnabled}
                aria-label={t("settings.contextMenu")}
                disabled={contextMenuBusy}
                onClick={handleToggleContextMenu}
                style={{
                  width: "40px",
                  height: "22px",
                  borderRadius: "999px",
                  background: contextMenuEnabled ? "var(--accent)" : "var(--border2)",
                  border: "1px solid var(--border)",
                  cursor: contextMenuBusy ? "not-allowed" : "pointer",
                  position: "relative",
                  transition: "background 0.15s ease",
                  flexShrink: 0,
                  padding: 0,
                  opacity: contextMenuBusy ? 0.65 : 1,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "2px",
                    left: contextMenuEnabled ? "20px" : "2px",
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    background: "#ffffff",
                    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
                    transition: "left 0.15s ease",
                  }}
                />
              </button>
            </div>
          </SectionCard>
        )}

        {/* ── About ────────────────────────────────────────────────────────── */}
        <SectionCard title={t("settings.about")}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                className="glass-badge"
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  background: "var(--accent-dim)",
                  border: "1px solid var(--border2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--accent)",
                }}
              >
                <IcnSparkles size={16} />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <p style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>Kompri</p>
                  {version && (
                    <span
                      className="glass-badge"
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        color: "var(--text-sub)",
                        background: "var(--surface2)",
                        border: "1px solid var(--border)",
                        borderRadius: "6px",
                        padding: "2px 7px",
                      }}
                    >
                      {t("settings.version")} {version}
                    </span>
                  )}
                </div>
                <p style={{ fontSize: "11px", color: "var(--text-sub)", marginTop: "2px" }}>{t("settings.formerlyName")}</p>
              </div>
            </div>
            <div
              className="glass-badge"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                background: "rgba(16, 185, 129, 0.08)",
                backdropFilter: "var(--glass-blur)",
                WebkitBackdropFilter: "var(--glass-blur)",
                border: "1px solid rgba(16, 185, 129, 0.24)",
                borderRadius: "999px",
                padding: "5px 12px",
              }}
            >
              <IcnCheck size={12} strokeWidth={2.5} color="var(--success)" />
              <span style={{ fontSize: "11px", color: "var(--success)", fontWeight: 600 }}>{t("settings.localOnly")}</span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-start", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn-ghost"
              data-testid="third-party-licenses-btn"
              aria-expanded={licensesOpen}
              onClick={() => setLicensesOpen((prev) => !prev)}
              style={{ fontSize: "12px", padding: "7px 12px" }}
            >
              <IcnFile size={13} />
              <span>{t("settings.thirdPartyLicenses")}</span>
            </button>
          </div>

          {licensesOpen && (
            <div
              className="fade-in glass-panel"
              data-testid="third-party-licenses-panel"
              style={{
                padding: "14px",
                background: "var(--surface2)",
                border: "1px solid var(--border2)",
                borderRadius: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn-ghost"
                  data-testid="third-party-licenses-close"
                  onClick={() => setLicensesOpen(false)}
                  style={{ fontSize: "11px", padding: "4px 10px" }}
                >
                  <IcnX size={12} />
                  <span>{t("settings.thirdPartyLicensesClose")}</span>
                </button>
              </div>
              <pre
                style={{
                  margin: 0,
                  maxHeight: "260px",
                  overflowY: "auto",
                  fontFamily: "var(--font-family-mono)",
                  fontSize: "11px",
                  lineHeight: 1.55,
                  color: "var(--text-sub)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {licensesText}
              </pre>
            </div>
          )}
        </SectionCard>

      </div>
    </div>
  );
}
