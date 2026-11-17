import { useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useHistory } from "../../hooks/useHistory";
import type { HistoryItem } from "../../hooks/useHistory";
import {
  IcnImage,
  IcnVideo,
  IcnAudio,
  IcnCheck,
  IcnFolder,
  IcnHistory,
  IcnSearch,
  IcnX,
  IcnTrash,
  IcnExternalLink,
} from "../ui/Icons";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function MediaIcon({ type }: { type: HistoryItem["media_type"] }) {
  const props = { size: 15, strokeWidth: 2 };
  if (type === "video") return <IcnVideo {...props} />;
  if (type === "audio") return <IcnAudio {...props} />;
  return <IcnImage {...props} />;
}

const TYPE_COLOR: Record<HistoryItem["media_type"], string> = {
  video: "#7c6aff",
  audio: "#a78bfa",
  image: "#60a5fa",
};

function formatDate(ts: number, t: TFunction): string {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, now)) return t("history.dateFormat.today", { time });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return t("history.dateFormat.yesterday", { time });
  return d.toLocaleDateString();
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function HistoryRow({
  item,
  t,
  onRemove,
}: {
  item: HistoryItem;
  t: TFunction;
  onRemove: (id: string) => void;
}) {
  const handleOpenFile = () =>
    invoke("open_file", { path: item.output_path } as unknown as Record<string, unknown>).catch(() => {});
  const handleOpenFolder = () =>
    invoke("open_folder", { file_path: item.output_path } as unknown as Record<string, unknown>).catch(() => {});

  return (
    <div
      className="slide-in glass-card history-row-grid"
      style={{
        alignItems: "center",
        gap: "14px",
        background: "var(--surface)",
        backdropFilter: "var(--glass-blur)",
        WebkitBackdropFilter: "var(--glass-blur)",
        border: "1px solid var(--border)",
        borderRadius: "14px",
        padding: "12px 16px",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {/* Type badge */}
      <div
        className="glass-badge"
        style={{
          width: "36px",
          height: "36px",
          borderRadius: "10px",
          background: "var(--surface2)",
          backdropFilter: "var(--glass-blur)",
          WebkitBackdropFilter: "var(--glass-blur)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: TYPE_COLOR[item.media_type],
          flexShrink: 0,
          border: "1px solid var(--border)",
        }}
      >
        <MediaIcon type={item.media_type} />
      </div>

      {/* Info */}
      <div style={{ minWidth: 0 }}>
        <p
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={item.file_name}
        >
          {item.file_name}
        </p>
        <div
          style={{
            marginTop: "4px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            flexWrap: "wrap",
          }}
        >
          {item.output_path && (
            <span style={{ color: "var(--success)", display: "inline-flex", alignItems: "center" }}>
              <IcnCheck size={12} strokeWidth={2.5} />
            </span>
          )}
          <span
            style={{
              fontSize: "10px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "2px 7px",
              borderRadius: "6px",
              background: "var(--surface2)",
              border: "1px solid var(--border)",
              color: "var(--text-sub)",
            }}
          >
            {item.source_format}
          </span>
          <span style={{ fontSize: "11px", color: "var(--muted)" }}>→</span>
          <span
            style={{
              fontSize: "10px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "2px 7px",
              borderRadius: "6px",
              background: "var(--accent-dim)",
              border: "1px solid var(--border2)",
              color: "var(--accent)",
            }}
          >
            {item.target_format}
          </span>
          {item.file_size && (
            <span
              className="glass-badge"
              style={{
                fontSize: "10px",
                fontWeight: 500,
                color: "var(--text-sub)",
                padding: "2px 7px",
                borderRadius: "6px",
                background: "var(--surface2)",
                border: "1px solid var(--border)",
              }}
            >
              {item.file_size}
            </span>
          )}
        </div>
      </div>

      <div className="history-row-meta">
        {/* Date — aligned in its own column */}
        <span style={{ fontSize: "11px", color: "var(--muted)", whiteSpace: "nowrap", textAlign: "right" }}>
          {formatDate(item.timestamp, t)}
        </span>

        {/* Actions */}
        <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
          <button
            className="btn-ghost"
            onClick={handleOpenFile}
            title={t("history.openFile")}
            style={{ padding: "6px 10px", fontSize: "11px", gap: "5px" }}
          >
            <IcnExternalLink size={12} />
            <span>{t("history.openFile")}</span>
          </button>
          <button
            className="btn-ghost"
            onClick={handleOpenFolder}
            title={t("history.openFolder")}
            style={{ padding: "6px 8px", fontSize: "11px" }}
          >
            <IcnFolder size={13} />
          </button>
          <button
            className="btn-ghost"
            onClick={() => onRemove(item.id)}
            title={t("history.deleteItem")}
            style={{ padding: "6px 8px", fontSize: "11px" }}
          >
            <IcnTrash size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function History() {
  const { t } = useTranslation();
  const { history, isLoading, clearHistory, removeHistoryItem } = useHistory();
  const [confirmClear, setConfirmClear] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mediaFilter, setMediaFilter] = useState<"all" | HistoryItem["media_type"]>("all");

  const handleClear = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    await clearHistory();
    setConfirmClear(false);
  };

  const filteredHistory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return history.filter((item) => {
      if (mediaFilter !== "all" && item.media_type !== mediaFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.file_name.toLowerCase().includes(q) ||
        item.source_format.toLowerCase().includes(q) ||
        item.target_format.toLowerCase().includes(q)
      );
    });
  }, [history, searchQuery, mediaFilter]);

  return (
    <div className="page-container" style={{ minHeight: "100%" }}>
      {/* Header */}
      <div className="page-header">
        <h2 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text)", lineHeight: 1.2 }}>
          {t("history.title")}
        </h2>
        {history.length > 0 && (
          <button
            className={confirmClear ? "btn-danger" : "btn-ghost"}
            onClick={handleClear}
            style={{ fontSize: "12px", gap: "6px" }}
          >
            <IcnTrash size={13} />
            <span>{confirmClear ? t("history.clearConfirm") : t("history.clear")}</span>
          </button>
        )}
      </div>

      {/* Filter & Search Toolbar */}
      {history.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            alignItems: "center",
          }}
        >
          {/* Search input */}
          <div
            className="glass-input"
            style={{
              position: "relative",
              flex: "1 1 200px",
              minWidth: "160px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "var(--surface)",
              backdropFilter: "var(--glass-blur)",
              WebkitBackdropFilter: "var(--glass-blur)",
              border: "1px solid var(--border2)",
              borderRadius: "10px",
              padding: "7px 12px",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <IcnSearch size={14} color="var(--muted)" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("history.searchPlaceholder")}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--text)",
                fontSize: "12px",
                minWidth: 0,
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--muted)",
                  padding: "2px",
                  borderRadius: "4px",
                }}
              >
                <IcnX size={12} />
              </button>
            )}
          </div>

          {/* Media type segmented filter */}
          <div className="seg-ctrl" style={{ flexWrap: "wrap", overflowX: "auto", maxWidth: "100%" }}>
            <button
              className={mediaFilter === "all" ? "active" : ""}
              onClick={() => setMediaFilter("all")}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <span>{t("history.filterAll")}</span>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: "999px",
                  background: mediaFilter === "all" ? "var(--accent-dim)" : "var(--surface)",
                  color: mediaFilter === "all" ? "var(--accent)" : "var(--muted)",
                }}
              >
                {history.length}
              </span>
            </button>
            <button
              className={mediaFilter === "image" ? "active" : ""}
              onClick={() => setMediaFilter("image")}
              style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
            >
              <IcnImage size={12} />
              <span>{t("history.mediaType.image")}</span>
            </button>
            <button
              className={mediaFilter === "video" ? "active" : ""}
              onClick={() => setMediaFilter("video")}
              style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
            >
              <IcnVideo size={12} />
              <span>{t("history.mediaType.video")}</span>
            </button>
            <button
              className={mediaFilter === "audio" ? "active" : ""}
              onClick={() => setMediaFilter("audio")}
              style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}
            >
              <IcnAudio size={12} />
              <span>{t("history.mediaType.audio")}</span>
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              width: "24px",
              height: "24px",
              border: "2px solid var(--border2)",
              borderTopColor: "var(--accent)",
              borderRadius: "50%",
            }}
            className="animate-spin"
          />
        </div>
      ) : history.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
          }}
        >
          <IcnHistory size={40} strokeWidth={1.25} color="var(--border2)" />
          <p style={{ fontSize: "13px", color: "var(--muted)" }}>{t("history.empty")}</p>
        </div>
      ) : filteredHistory.length === 0 ? (
        <div
          className="glass-card"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            background: "var(--surface)",
            backdropFilter: "var(--glass-blur)",
            WebkitBackdropFilter: "var(--glass-blur)",
            border: "1px solid var(--border)",
            borderRadius: "16px",
            padding: "32px",
          }}
        >
          <IcnSearch size={32} strokeWidth={1.5} color="var(--border2)" />
          <p style={{ fontSize: "13px", color: "var(--muted)" }}>{t("history.noResults")}</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {filteredHistory.map((item) => (
            <HistoryRow key={item.id} item={item} t={t} onRemove={removeHistoryItem} />
          ))}
        </div>
      )}
    </div>
  );
}
