import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { useDragDrop } from "../../hooks/useDragDrop";
import { useSectionActive } from "../../context/SectionActiveContext";
import { IcnUpload } from "./Icons";

interface DropZoneProps {
  onFilesDropped: (files: string[]) => void;
  allowedExtensions: string[];
  multiple?: boolean;
  label?: string;
  disabled?: boolean;
  hasFile?: boolean;
  className?: string;
  children?: React.ReactNode;
  formats?: string;
}

export function DropZone({
  onFilesDropped,
  allowedExtensions,
  multiple = false,
  label,
  disabled = false,
  hasFile = false,
  className,
  children,
  formats,
}: DropZoneProps) {
  const { t } = useTranslation();
  const { isDragging, droppedFiles, bind, reset } = useDragDrop();
  const sectionActive = useSectionActive();

  useEffect(() => {
    bind(allowedExtensions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bind]);

  useEffect(() => {
    if (droppedFiles.length > 0) {
      // Hidden sections stay mounted; a drop belongs to the visible one only.
      if (sectionActive && !disabled) onFilesDropped(multiple ? droppedFiles : [droppedFiles[0]]);
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [droppedFiles]);

  const handleClick = async () => {
    if (disabled) return;
    const selected = await open({
      multiple,
      filters: [{ name: label ?? "Files", extensions: allowedExtensions }],
    });
    if (!selected) return;
    const files = Array.isArray(selected) ? selected : [selected];
    if (files.length > 0) onFilesDropped(files);
  };

  const isHighlighted = isDragging || hasFile;

  return (
    <div
      onClick={!disabled ? handleClick : undefined}
      style={{
        backdropFilter: "var(--glass-blur)",
        WebkitBackdropFilter: "var(--glass-blur)",
        background: isHighlighted ? "var(--accent-dim)" : "var(--surface)",
        border: isHighlighted ? "1.5px solid var(--accent)" : "1.5px dashed var(--border2)",
        borderRadius: "16px",
        boxShadow: isHighlighted
          ? "0 8px 32px var(--accent-dim), inset 0 1px 0 var(--glass-highlight)"
          : "var(--shadow-sm)",
        padding: "clamp(18px, 3.5vh, 32px) clamp(14px, 3vw, 24px)",
        width: "100%",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "12px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      className={className}
      onMouseEnter={(e) => {
        if (!disabled && !isHighlighted) {
          (e.currentTarget as HTMLDivElement).style.borderColor = "var(--accent)";
          (e.currentTarget as HTMLDivElement).style.background = "var(--accent-dim)";
          (e.currentTarget as HTMLDivElement).style.boxShadow =
            "0 8px 32px var(--accent-dim), inset 0 1px 0 var(--glass-highlight)";
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && !isHighlighted) {
          (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border2)";
          (e.currentTarget as HTMLDivElement).style.background = "var(--surface)";
          (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-sm)";
        }
      }}
    >
      {children ?? (
        <>
          <div
            style={{
              width: "60px",
              height: "60px",
              borderRadius: "16px",
              background: "var(--accent-dim)",
              border: "1px solid rgba(139, 122, 255, 0.25)",
              boxShadow: "inset 0 1px 0 var(--glass-highlight)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--accent)",
              flexShrink: 0,
            }}
          >
            <IcnUpload size={28} strokeWidth={1.5} />
          </div>

          <div style={{ textAlign: "center", maxWidth: "100%", minWidth: 0 }}>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)", marginBottom: "4px" }}>
              {label ?? t("dropzone.label")}
            </p>
            <p style={{ fontSize: "12px", color: "var(--muted)" }}>
              {t("dropzone.or")}{" "}
              <span style={{ color: "var(--accent)", textDecoration: "underline", fontWeight: 500 }}>
                {t("dropzone.browse")}
              </span>
            </p>
          </div>

          {formats && (
            <span
              className="glass-badge"
              style={{
                fontSize: "10px",
                color: "var(--muted)",
                letterSpacing: "0.06em",
                textAlign: "center",
                maxWidth: "100%",
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              {formats}
            </span>
          )}
        </>
      )}
    </div>
  );
}
