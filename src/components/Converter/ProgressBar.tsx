import { useTranslation } from "react-i18next";

interface ProgressBarProps {
  progress: number;
  currentTime?: string;
  speed?: string;
  currentFile?: string;
  onCancel?: () => void;
}

export function ProgressBar({ progress, currentTime, speed, currentFile, onCancel }: ProgressBarProps) {
  const { t } = useTranslation();
  const pct = Math.round(Math.min(100, Math.max(0, progress)));

  return (
    <div
      className="card"
      style={{
        gap: 0,
        backdropFilter: "var(--glass-blur)",
        WebkitBackdropFilter: "var(--glass-blur)",
        boxShadow: "var(--shadow-sm), inset 0 1px 0 var(--glass-highlight)",
      }}
    >
      {/* Top row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
        <span className="truncate" style={{ maxWidth: "70%", fontSize: "12px", color: "var(--text-sub)", fontWeight: 500 }}>
          {currentFile ?? currentTime ?? "—"}
        </span>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexShrink: 0 }}>
          {speed && (
            <span className="glass-badge" style={{ fontSize: "11px", color: "var(--text-sub)" }}>
              {speed}
            </span>
          )}
          <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--accent)" }}>{pct}%</span>
        </div>
      </div>

      {/* Track */}
      <div
        style={{
          height: "8px",
          borderRadius: "999px",
          background: "var(--surface2)",
          border: "1px solid var(--border)",
          overflow: "hidden",
        }}
      >
        <div
          className="animate-progress-glow"
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "linear-gradient(90deg, var(--accent), #a89cff, var(--accent-hover))",
            boxShadow: "0 0 12px var(--accent-glow)",
            borderRadius: "999px",
            transition: "width 0.2s ease",
          }}
        />
      </div>

      {onCancel && (
        <button className="btn-ghost" onClick={onCancel} style={{ marginTop: "12px", width: "fit-content" }}>
          {t("converter.cancel")}
        </button>
      )}
    </div>
  );
}
