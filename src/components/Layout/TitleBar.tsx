import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSettingsContext } from "../../context/SettingsContext";
import { IcnSun, IcnMoon, IcnChevronDown } from "../ui/Icons";

const LANGUAGES = [
  { code: "fr", label: "FR" },
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
  { code: "de", label: "DE" },
  { code: "pt", label: "PT" },
];

export function TitleBar() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettingsContext();
  const [controlsHover, setControlsHover] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);

  const currentLang = LANGUAGES.find((l) => l.code === settings.language) ?? LANGUAGES[1];
  const isDark = settings.theme === "dark";

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    if (langOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [langOpen]);

  const pillStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    border: "1px solid var(--border2)",
    borderRadius: "999px",
    fontFamily: "var(--font-family-mono, ui-monospace, monospace)",
    fontSize: "10px",
    fontWeight: 600,
    padding: "4px 10px",
    color: "var(--text-sub)",
    background: "var(--surface2)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    boxShadow: "inset 0 1px 0 var(--glass-highlight)",
    cursor: "pointer",
    letterSpacing: "0.06em",
    transition: "border-color 0.15s ease, color 0.15s ease, background 0.15s ease, transform 0.12s ease",
    whiteSpace: "nowrap",
  };

  return (
    <header
      style={{
        position: "relative",
        zIndex: 30,
        height: "42px",
        minHeight: "42px",
        background: "var(--surface)",
        backdropFilter: "var(--glass-blur)",
        WebkitBackdropFilter: "var(--glass-blur)",
        borderBottom: "1px solid var(--border)",
        boxShadow: "inset 0 1px 0 var(--glass-highlight)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        flexShrink: 0,
        userSelect: "none",
      }}
      data-tauri-drag-region
      onDoubleClick={(e) => {
        if (e.target === e.currentTarget) {
          getCurrentWindow().toggleMaximize().catch(() => {});
        }
      }}
    >
      {/* Left: macOS-inspired window controls with subtle specular sheen */}
      <div
        style={{ display: "flex", gap: "8px", alignItems: "center" }}
        onMouseEnter={() => setControlsHover(true)}
        onMouseLeave={() => setControlsHover(false)}
      >
        <button
          type="button"
          data-testid="window-close"
          title={t("window.close")}
          aria-label={t("window.close")}
          onClick={() => getCurrentWindow().close().catch(() => {})}
          style={{
            width: "13px",
            height: "13px",
            borderRadius: "50%",
            background: "linear-gradient(180deg, #ff736b 0%, #ff5f57 100%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45), 0 1px 2px rgba(0,0,0,0.25)",
            border: "none",
            padding: 0,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            outline: "none",
            transition: "filter 0.15s ease, transform 0.1s ease",
          }}
        >
          {controlsHover && (
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none" style={{ display: "block" }}>
              <path
                d="M2.5 2.5L7.5 7.5M7.5 2.5L2.5 7.5"
                stroke="#4a0002"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>

        <button
          type="button"
          data-testid="window-minimize"
          title={t("window.minimize")}
          aria-label={t("window.minimize")}
          onClick={() => getCurrentWindow().minimize().catch(() => {})}
          style={{
            width: "13px",
            height: "13px",
            borderRadius: "50%",
            background: "linear-gradient(180deg, #ffd05b 0%, #febc2e 100%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45), 0 1px 2px rgba(0,0,0,0.25)",
            border: "none",
            padding: 0,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            outline: "none",
            transition: "filter 0.15s ease, transform 0.1s ease",
          }}
        >
          {controlsHover && (
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none" style={{ display: "block" }}>
              <path
                d="M2 5h6"
                stroke="#5c3c00"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>

        <button
          type="button"
          data-testid="window-maximize"
          title={t("window.maximize")}
          aria-label={t("window.maximize")}
          onClick={() => getCurrentWindow().toggleMaximize().catch(() => {})}
          style={{
            width: "13px",
            height: "13px",
            borderRadius: "50%",
            background: "linear-gradient(180deg, #42dd59 0%, #28c840 100%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45), 0 1px 2px rgba(0,0,0,0.25)",
            border: "none",
            padding: 0,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            outline: "none",
            transition: "filter 0.15s ease, transform 0.1s ease",
          }}
        >
          {controlsHover && (
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none" style={{ display: "block" }}>
              <path
                d="M5 2v6M2 5h6"
                stroke="#004d0d"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Centre: Liquid Glass App Capsule */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          pointerEvents: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: "7px",
          padding: "3px 12px",
          borderRadius: "999px",
          background: "var(--surface2)",
          border: "1px solid var(--border)",
          boxShadow: "inset 0 1px 0 var(--glass-highlight)",
        }}
      >
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            background: "var(--accent)",
            boxShadow: "0 0 8px var(--accent)",
          }}
        />
        <span
          style={{
            fontWeight: 700,
            fontSize: "11px",
            letterSpacing: "0.18em",
            color: "var(--text-sub)",
          }}
        >
          MEDIAFORGE
        </span>
      </div>

      {/* Right: Frosted Glass Pills */}
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        {/* Theme pill */}
        <button
          style={pillStyle}
          onClick={() =>
            updateSettings({ theme: isDark ? "light" : "dark" })
          }
          title={t("settings.theme")}
        >
          {isDark ? (
            <IcnSun size={12} color="var(--accent)" />
          ) : (
            <IcnMoon size={12} color="var(--accent)" />
          )}
          <span>{isDark ? "LIGHT" : "DARK"}</span>
        </button>

        {/* Language pill + frosted glass dropdown */}
        <div ref={langRef} style={{ position: "relative" }}>
          <button
            style={pillStyle}
            onClick={() => setLangOpen((v) => !v)}
            title={t("settings.language")}
          >
            <span>{currentLang.label}</span>
            <IcnChevronDown
              size={11}
              style={{
                transition: "transform 0.15s ease",
                transform: langOpen ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>

          {langOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                background: "var(--popover-bg, var(--surface-solid))",
                backdropFilter: "var(--glass-blur)",
                WebkitBackdropFilter: "var(--glass-blur)",
                border: "1px solid var(--border2)",
                borderRadius: "12px",
                padding: "5px",
                display: "flex",
                flexDirection: "column",
                gap: "2px",
                zIndex: 9999,
                minWidth: "68px",
                boxShadow: "var(--shadow), inset 0 1px 0 var(--glass-highlight)",
              }}
              className="fade-in"
            >
              {LANGUAGES.map((l) => {
                const active = l.code === settings.language;
                return (
                  <button
                    key={l.code}
                    onClick={() => {
                      updateSettings({ language: l.code });
                      setLangOpen(false);
                    }}
                    style={{
                      display: "block",
                      textAlign: "center",
                      borderRadius: "8px",
                      border: active ? "1px solid rgba(139, 122, 255, 0.35)" : "1px solid transparent",
                      padding: "5px 10px",
                      fontFamily: "var(--font-family-mono, ui-monospace, monospace)",
                      fontSize: "10px",
                      fontWeight: active ? 700 : 500,
                      letterSpacing: "0.06em",
                      color: active ? "var(--accent)" : "var(--text-sub)",
                      background: active ? "var(--accent-dim)" : "transparent",
                      width: "100%",
                      cursor: "pointer",
                      transition: "background 0.15s ease, color 0.15s ease",
                    }}
                  >
                    {l.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
