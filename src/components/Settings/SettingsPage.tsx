import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-dialog";
import { useSettingsContext } from "../../context/SettingsContext";
import { IcnChevronDown, IcnFolder, IcnX, IcnCheck, IcnMoon, IcnSun, IcnSparkles } from "../ui/Icons";

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
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
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

// ── Main component ────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettingsContext();
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("0.1.0"));
  }, []);

  const handlePickFolder = async () => {
    const result = await open({ directory: true, multiple: false });
    if (typeof result === "string") await updateSettings({ output_dir: result });
  };

  const langOptions  = LANGUAGES.map((l) => ({ value: l.code,  label: l.label }));
  const videoOptions = VIDEO_FORMATS.map((f) => ({ value: f, label: f.toUpperCase() }));
  const audioOptions = AUDIO_FORMATS.map((f) => ({ value: f, label: f.toUpperCase() }));
  const imageOptions = IMAGE_FORMATS.map((f) => ({ value: f, label: f.toUpperCase() }));

  return (
    <div
      style={{
        padding: "24px",
        height: "100%",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
      }}
    >
      <h2 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text)", lineHeight: 1.2 }}>
        {t("settings.title")}
      </h2>

      <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "560px" }}>

        {/* ── Appearance ───────────────────────────────────────────────────── */}
        <SectionCard title={t("settings.appearance")}>
          <SettingRow label={t("settings.theme")}>
            <ThemeToggle value={settings.theme} onChange={(v) => updateSettings({ theme: v })} />
          </SettingRow>
          <SettingRow label={t("settings.language")}>
            <PillSelect value={settings.language} options={langOptions} onChange={(v) => updateSettings({ language: v })} />
          </SettingRow>
        </SectionCard>

        {/* ── Conversion ───────────────────────────────────────────────────── */}
        <SectionCard title={t("settings.conversion")}>
          {/* Output folder */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <label style={{ fontSize: "13px", fontWeight: 500, color: "var(--text)" }}>{t("settings.outputDir")}</label>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <div
                className="glass-input"
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "var(--surface2)",
                  backdropFilter: "var(--glass-blur)",
                  WebkitBackdropFilter: "var(--glass-blur)",
                  border: "1px solid var(--border2)",
                  borderRadius: "10px",
                  padding: "8px 12px",
                  minWidth: 0,
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }}>
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
        </SectionCard>

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
                  <p style={{ fontSize: "14px", fontWeight: 700, color: "var(--text)" }}>MediaForge</p>
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
        </SectionCard>

      </div>
    </div>
  );
}
