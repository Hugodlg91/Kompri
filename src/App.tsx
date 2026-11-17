import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Sidebar, NavSection } from "./components/Layout/Sidebar";
import { TitleBar } from "./components/Layout/TitleBar";
import { ConverterPage } from "./components/Converter/ConverterPage";
import { ProgressBar } from "./components/Converter/ProgressBar";
import { HistoryPage } from "./components/History/HistoryPage";
import { SettingsPage } from "./components/Settings/SettingsPage";
import { IcnCheck, IcnFolder, IcnX } from "./components/ui/Icons";
import { SettingsProvider, useSettingsContext } from "./context/SettingsContext";
import { SectionActiveContext } from "./context/SectionActiveContext";

const CONVERTER_SECTIONS = ["image", "video", "audio"] as const;
type ConverterSection = (typeof CONVERTER_SECTIONS)[number];

interface CliState {
  is_cli_mode: boolean;
  action_label?: string;
  open_files: string[];
  open_section?: string;
}

interface CliJobStatus {
  status: "running" | "done" | "error";
  current_file: string;
  index: number;
  total: number;
  percentage: number;
  pass?: number;
  total_passes?: number;
  output_path?: string;
  error?: string;
}

function isConverterSection(s?: string): s is ConverterSection {
  return s === "image" || s === "video" || s === "audio";
}

const SHORTCUT_MAP: Record<string, NavSection> = {
  "1": "image",
  "2": "video",
  "3": "audio",
  "4": "history",
  "5": "settings",
};

// ─── Inner layout (requires SettingsContext) ──────────────────────────────────

function AppLayout() {
  const { t } = useTranslation();
  const [section, setSection] = useState<NavSection>("image");
  const { isLoading } = useSettingsContext();
  const [cliState, setCliState] = useState<CliState | null>(null);
  const [cliJobStatus, setCliJobStatus] = useState<CliJobStatus | null>(null);

  // Check initial CLI invocation state and subscribe to CLI events
  useEffect(() => {
    let cancelled = false;

    invoke<CliState | null>("get_cli_state")
      .catch(() => null)
      .then((state) => {
        if (cancelled || !state) return;
        if (isConverterSection(state.open_section)) {
          setSection(state.open_section);
        }
        if (state.is_cli_mode) {
          setCliState(state);
        }
      });

    let unlistenOpenFiles: (() => void) | undefined;
    let unlistenJobStatus: (() => void) | undefined;

    listen<{ files: string[]; section: string }>("cli-open-files", (event) => {
      if (cancelled) return;
      if (isConverterSection(event.payload?.section)) {
        setSection(event.payload.section);
      }
    })
      .then((u) => {
        if (cancelled) u();
        else unlistenOpenFiles = u;
      })
      .catch(() => {});

    listen<CliJobStatus>("cli-job-status", (event) => {
      if (!cancelled && event.payload) {
        setCliJobStatus(event.payload);
      }
    })
      .then((u) => {
        if (cancelled) u();
        else unlistenJobStatus = u;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      unlistenOpenFiles?.();
      unlistenJobStatus?.();
    };
  }, []);

  // Global keyboard shortcuts: Ctrl+1..5 / Cmd+1..5
  useEffect(() => {
    if (cliState?.is_cli_mode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        const target = SHORTCUT_MAP[e.key];
        if (target) {
          e.preventDefault();
          setSection(target);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cliState?.is_cli_mode]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
          <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }
    // Converters stay mounted so a running conversion keeps its form,
    // progress and result while the user visits another section.
    return (
      <>
        {CONVERTER_SECTIONS.map((type) => (
          <div
            key={type}
            hidden={section !== type}
            style={section === type ? { height: "100%" } : undefined}
          >
            <SectionActiveContext.Provider value={section === type}>
              <ConverterPage type={type} />
            </SectionActiveContext.Provider>
          </div>
        ))}
        {section === "history" && <HistoryPage />}
        {section === "settings" && <SettingsPage />}
      </>
    );
  };

  if (cliState?.is_cli_mode) {
    const totalFiles = cliJobStatus?.total ?? cliState.open_files.length;
    const currentIndex = cliJobStatus?.index ?? 0;
    const fallbackName = cliState.open_files[0]?.split(/[\\/]/).pop() ?? "";
    const currentFileName = cliJobStatus?.current_file || fallbackName;
    const outputFilePath = cliJobStatus?.output_path;
    const outputFileName = outputFilePath?.split(/[\\/]/).pop() ?? currentFileName;

    return (
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          overflow: "hidden",
          background: "var(--bg)",
          color: "var(--text)",
        }}
      >
        <div className="ambient-canvas" aria-hidden="true">
          <div className="ambient-orb ambient-orb-1" />
          <div className="ambient-orb ambient-orb-2" />
          <div className="ambient-orb ambient-orb-3" />
        </div>

        <TitleBar />

        <main
          className="app-main"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
        >
          <div
            className="card animate-fade-in"
            style={{
              width: "100%",
              maxWidth: "520px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
              <span className="glass-badge" style={{ color: "var(--accent)", background: "var(--accent-dim)" }}>
                {cliState.action_label || "MediaForge"}
              </span>
              {totalFiles > 1 && (
                <span className="glass-badge">
                  {t("batch.progress", {
                    index: Math.min(currentIndex + 1, totalFiles),
                    total: totalFiles,
                  })}
                </span>
              )}
            </div>

            {cliJobStatus?.status === "done" ? (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    background: "rgba(16, 185, 129, 0.08)",
                    border: "1px solid rgba(16, 185, 129, 0.32)",
                    borderRadius: "12px",
                    padding: "14px 16px",
                  }}
                >
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "10px",
                      background: "rgba(16, 185, 129, 0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--success)",
                      flexShrink: 0,
                    }}
                  >
                    <IcnCheck size={16} strokeWidth={2.5} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: "12px", fontWeight: 700, color: "var(--success)" }}>
                      {t("result.success")}
                    </p>
                    {outputFileName && (
                      <p className="truncate" style={{ fontSize: "12px", color: "var(--text-sub)" }} title={outputFilePath ?? outputFileName}>
                        {outputFileName}
                      </p>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap" }}>
                  {outputFilePath && (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => invoke("open_folder", { file_path: outputFilePath })}
                    >
                      <IcnFolder size={14} />
                      {t("result.openFolder")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => getCurrentWindow().close().catch(() => {})}
                  >
                    {t("window.close")}
                  </button>
                </div>
              </>
            ) : cliJobStatus?.status === "error" ? (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "10px",
                    color: "var(--error)",
                    fontSize: "13px",
                    background: "rgba(248, 113, 113, 0.08)",
                    border: "1px solid rgba(248, 113, 113, 0.25)",
                    borderRadius: "12px",
                    padding: "12px 14px",
                  }}
                >
                  <IcnX size={15} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: "1px" }} />
                  <span>{t("converter.error")}: {cliJobStatus.error}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => getCurrentWindow().close().catch(() => {})}
                  >
                    {t("window.close")}
                  </button>
                </div>
              </>
            ) : (
              <ProgressBar
                progress={cliJobStatus?.percentage ?? 0}
                currentFile={currentFileName}
                pass={cliJobStatus?.pass}
                totalPasses={cliJobStatus?.total_passes}
              />
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
        background: "var(--bg)",
        color: "var(--text)",
      }}
    >
      {/* Ambient Liquid Glass Aurora Backdrop */}
      <div className="ambient-canvas" aria-hidden="true">
        <div className="ambient-orb ambient-orb-1" />
        <div className="ambient-orb ambient-orb-2" />
        <div className="ambient-orb ambient-orb-3" />
      </div>

      {/* Foreground App Shell */}
      <TitleBar />
      <div className="app-body">
        <Sidebar active={section} onChange={setSection} />
        <main className="app-main">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

function App() {
  return (
    <SettingsProvider>
      <AppLayout />
    </SettingsProvider>
  );
}

export default App;
