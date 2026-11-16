import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { IcnCheck, IcnFolder, IcnExternalLink, IcnRefresh } from "./Icons";

interface ConversionResultProps {
  outputPath: string;
  onNewConversion: () => void;
}

export function ConversionResult({ outputPath, onNewConversion }: ConversionResultProps) {
  const { t } = useTranslation();
  const fileName = outputPath.split(/[\\/]/).pop() ?? outputPath;

  const handleOpenFile = useCallback(async () => {
    try {
      await invoke("open_file", { path: outputPath });
    } catch (e) {
      console.error("open_file error:", e);
    }
  }, [outputPath]);

  const handleOpenFolder = useCallback(async () => {
    try {
      await invoke("open_folder", { file_path: outputPath });
    } catch (e) {
      console.error("open_folder error:", e);
    }
  }, [outputPath]);

  return (
    <div className="flex flex-col gap-3 animate-fade-in">
      {/* Success card */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          background: "rgba(16, 185, 129, 0.08)",
          backdropFilter: "var(--glass-blur)",
          WebkitBackdropFilter: "var(--glass-blur)",
          border: "1px solid rgba(16, 185, 129, 0.32)",
          boxShadow: "0 8px 24px rgba(16, 185, 129, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
          borderRadius: "16px",
          padding: "16px 18px",
        }}
      >
        {/* Check icon */}
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "12px",
            background: "rgba(16, 185, 129, 0.15)",
            border: "1px solid rgba(16, 185, 129, 0.28)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            color: "var(--success)",
          }}
        >
          <IcnCheck size={16} strokeWidth={2.5} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: "11px", fontWeight: 700, color: "var(--success)", letterSpacing: "0.06em", marginBottom: "2px" }}>
            {t("result.success").toUpperCase()}
          </p>
          <p style={{ fontSize: "12px", color: "var(--text-sub)" }} className="truncate" title={outputPath}>
            {fileName}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          <button className="btn-ghost" onClick={handleOpenFile} style={{ flexShrink: 0, gap: "6px" }}>
            <IcnExternalLink size={14} />
            {t("result.openFile")}
          </button>
          <button className="btn-ghost" onClick={handleOpenFolder} style={{ flexShrink: 0, gap: "6px" }}>
            <IcnFolder size={14} />
            {t("result.openFolder")}
          </button>
        </div>
      </div>

      <button className="btn-primary" onClick={onNewConversion} style={{ width: "fit-content" }}>
        <IcnRefresh size={14} />
        {t("result.newConversion")}
      </button>
    </div>
  );
}
