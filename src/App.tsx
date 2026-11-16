import { useState, useEffect } from "react";
import { Sidebar, NavSection } from "./components/Layout/Sidebar";
import { TitleBar } from "./components/Layout/TitleBar";
import { ConverterPage } from "./components/Converter/ConverterPage";
import { HistoryPage } from "./components/History/HistoryPage";
import { SettingsPage } from "./components/Settings/SettingsPage";
import { SettingsProvider, useSettingsContext } from "./context/SettingsContext";
import { SectionActiveContext } from "./context/SectionActiveContext";

const CONVERTER_SECTIONS = ["image", "video", "audio"] as const;

const SHORTCUT_MAP: Record<string, NavSection> = {
  "1": "image",
  "2": "video",
  "3": "audio",
  "4": "history",
  "5": "settings",
};

// ─── Inner layout (requires SettingsContext) ──────────────────────────────────

function AppLayout() {
  const [section, setSection] = useState<NavSection>("image");
  const { isLoading } = useSettingsContext();

  // Global keyboard shortcuts: Ctrl+1..5 / Cmd+1..5
  useEffect(() => {
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
  }, []);

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
          <div key={type} hidden={section !== type}>
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
      <div style={{ position: "relative", zIndex: 1, display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar active={section} onChange={setSection} />
        <main style={{ flex: 1, overflowY: "auto", position: "relative" }}>
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
