import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import {
  useConversion,
  MediaInfo,
  BatchMediaItem,
  BatchResult,
} from "../../hooks/useConversion";
import { buildOutputPath, formatFileSize, formatDuration } from "../../utils/path";
import { useSettingsContext } from "../../context/SettingsContext";
import { ProgressBar } from "./ProgressBar";
import { DropZone } from "../ui/DropZone";
import { ConversionResult } from "../ui/ConversionResult";
import {
  IcnCheck,
  IcnX,
  IcnFolder,
  IcnChevronRight,
  IcnTrash,
  IcnSliders,
  IcnExternalLink,
  IcnRefresh,
} from "../ui/Icons";

// ─── Constants ────────────────────────────────────────────────────────────────

const VIDEO_FORMATS = ["mp4", "mkv", "avi", "mov", "webm"] as const;
type VideoFormat = (typeof VIDEO_FORMATS)[number];

const RESOLUTIONS = [
  { label: "Original", value: undefined },
  { label: "720p",  value: "1280:720" },
  { label: "1080p", value: "1920:1080" },
  { label: "4K",    value: "3840:2160" },
];

const CODECS = [
  { label: "Auto",  value: undefined },
  { label: "H.264", value: "h264" },
  { label: "H.265", value: "h265" },
  { label: "VP9",   value: "vp9" },
];

const BITRATES = [
  { label: "Auto",    value: undefined },
  { label: "1 Mbps",  value: "1M" },
  { label: "2 Mbps",  value: "2M" },
  { label: "5 Mbps",  value: "5M" },
  { label: "10 Mbps", value: "10M" },
];

// ─── Batch file list ──────────────────────────────────────────────────────────

function MediaBatchFileList({
  files,
  results,
  onRemove,
}: {
  files: string[];
  results: BatchResult[] | null;
  onRemove?: (path: string) => void;
}) {
  const { t } = useTranslation();
  if (files.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "220px", overflowY: "auto" }}>
      {files.map((f) => {
        const name = f.split(/[\\/]/).pop() ?? f;
        const result = results?.find((r) => r.input === f);
        const outName = result?.output ? (result.output.split(/[\\/]/).pop() ?? result.output) : null;
        return (
          <div
            key={f}
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "10px",
              minWidth: 0,
              background: "var(--surface)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              padding: "9px 12px",
            }}
          >
            {/* Status / remove */}
            <div style={{ flexShrink: 0, width: "18px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {result ? (
                result.success ? (
                  <span style={{ color: "var(--success)", display: "flex" }}><IcnCheck size={15} strokeWidth={2.5} /></span>
                ) : (
                  <span style={{ color: "var(--error)", display: "flex" }} title={result.error ?? t("converter.error")}>
                    <IcnX size={14} strokeWidth={2.5} />
                  </span>
                )
              ) : onRemove ? (
                <button
                  onClick={() => onRemove(f)}
                  style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer", display: "flex", padding: 0 }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--error)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--muted)"; }}
                >
                  <IcnX size={14} strokeWidth={2} />
                </button>
              ) : (
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--border2)", display: "inline-block" }} />
              )}
            </div>
            <span
              style={{
                fontSize: "12px",
                color: "var(--text-sub)",
                flex: "1 1 120px",
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={name}
            >
              {name}
            </span>
            {result && result.success && outName && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  flex: "0 1 auto",
                  minWidth: 0,
                  maxWidth: "100%",
                }}
              >
                <span
                  className="glass-badge"
                  style={{
                    fontSize: "11px",
                    color: "var(--success)",
                    minWidth: 0,
                    maxWidth: "100%",
                    overflow: "hidden",
                  }}
                  title={result.output ?? outName}
                >
                  <span className="truncate" style={{ minWidth: 0 }}>→ {outName}</span>
                </span>
                <button
                  className="btn-ghost"
                  style={{ padding: "4px 8px", fontSize: "11px", flexShrink: 0 }}
                  title={t("result.openFile")}
                  onClick={() => invoke("open_file", { path: result.output })}
                >
                  <IcnExternalLink size={12} />
                </button>
                <button
                  className="btn-ghost"
                  style={{ padding: "4px 8px", fontSize: "11px", flexShrink: 0 }}
                  title={t("result.openFolder")}
                  onClick={() => invoke("open_folder", { file_path: result.output })}
                >
                  <IcnFolder size={12} />
                </button>
              </div>
            )}
            {result && !result.success && (
              <span
                className="glass-badge"
                style={{
                  fontSize: "11px",
                  color: "var(--error)",
                  borderColor: "rgba(248, 113, 113, 0.3)",
                  background: "rgba(248, 113, 113, 0.08)",
                  maxWidth: "100%",
                  minWidth: 0,
                  overflow: "hidden",
                }}
                title={result.error ?? t("converter.error")}
              >
                <span className="truncate" style={{ minWidth: 0 }}>
                  {result.error ?? t("converter.error")}
                </span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function VideoConverter() {
  const { t } = useTranslation();
  const { settings } = useSettingsContext();
  const {
    progress, status, error, speed, currentTime,
    results, batchIndex, batchTotal, currentFile,
    convertVideo, convertVideoBatch, getMediaInfo, cancel, reset,
  } = useConversion();

  const [mode, setMode] = useState<"single" | "batch">("single");
  const [inputPath, setInputPath] = useState<string | null>(null);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [batchFiles, setBatchFiles] = useState<string[]>([]);

  const [outputFormat, setOutputFormat] = useState<VideoFormat>(
    (settings.default_video_format as VideoFormat) ?? "mp4"
  );
  const [resolution, setResolution] = useState<string | undefined>(undefined);
  const [codec, setCodec] = useState<string | undefined>(undefined);
  const [bitrate, setBitrate] = useState<string | undefined>(undefined);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isConverting = status === "converting";
  const isDone = status === "done";

  const handleFileSelected = useCallback(
    async (path: string) => {
      setInputPath(path);
      setOutputPath(buildOutputPath(path, outputFormat, settings.output_dir ?? undefined));
      reset();
      setMediaInfo(null);
      try { const info = await getMediaInfo(path); setMediaInfo(info); } catch { /* non-blocking */ }
    },
    [outputFormat, settings.output_dir, getMediaInfo, reset]
  );

  const handleConvert = useCallback(async () => {
    if (!inputPath || !outputPath) return;
    await convertVideo({ input_path: inputPath, output_path: outputPath, resolution, codec, bitrate });
  }, [inputPath, outputPath, resolution, codec, bitrate, convertVideo]);

  const handleFormatChange = (fmt: VideoFormat) => {
    setOutputFormat(fmt);
    if (inputPath) setOutputPath(buildOutputPath(inputPath, fmt, settings.output_dir ?? undefined));
  };

  const handleBatchFilesAdded = useCallback(
    (paths: string[]) => {
      setBatchFiles((prev) => { const s = new Set(prev); paths.forEach((p) => s.add(p)); return Array.from(s); });
      reset();
    },
    [reset]
  );

  const handleConvertBatch = useCallback(async () => {
    if (batchFiles.length === 0) return;
    const files: BatchMediaItem[] = batchFiles.map((p) => ({
      input_path: p,
      output_path: buildOutputPath(p, outputFormat, settings.output_dir ?? undefined),
    }));
    await convertVideoBatch({ files, resolution, codec, bitrate });
  }, [batchFiles, outputFormat, settings.output_dir, resolution, codec, bitrate, convertVideoBatch]);

  const batchProgressLabel =
    batchTotal > 0
      ? `${t("batch.progress", { index: Math.min(batchIndex + 1, batchTotal), total: batchTotal })}${currentFile ? ` — ${currentFile}` : ""}`
      : undefined;

  const selectCls: React.CSSProperties = {
    width: "100%",
    cursor: "pointer",
  };

  const optionsPanel = (
    <>
      {/* Format pills */}
      <div className="card" style={{ padding: "14px 16px" }}>
        <p className="section-label">{t("converter.output_format")}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {VIDEO_FORMATS.map((f) => (
            <button
              key={f}
              onClick={() => handleFormatChange(f)}
              className={`fmt-pill ${outputFormat === f ? "active" : ""}`}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced toggle */}
      <button
        onClick={() => setShowAdvanced((v) => !v)}
        className="glass-badge"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "7px",
          color: "var(--accent)",
          fontSize: "12px",
          cursor: "pointer",
          fontWeight: 600,
          padding: "7px 14px",
          borderRadius: "10px",
          width: "fit-content",
        }}
      >
        <IcnSliders size={13} />
        <span>{t("converter.advancedOptions")}</span>
        <span style={{ display: "flex", transition: "transform 0.15s", transform: showAdvanced ? "rotate(90deg)" : "rotate(0)" }}>
          <IcnChevronRight size={12} />
        </span>
      </button>

      {showAdvanced && (
        <div className="card" style={{ padding: "14px 16px" }}>
          <div className="responsive-grid-3">
            {[
              { label: t("converter.resolution"), value: resolution, setter: setResolution, opts: RESOLUTIONS },
              { label: t("converter.codec"),      value: codec,      setter: setCodec,      opts: CODECS },
              { label: t("converter.bitrate"),    value: bitrate,    setter: setBitrate,    opts: BITRATES },
            ].map(({ label, value, setter, opts }) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", gap: "5px", minWidth: 0 }}>
                <label style={{ fontSize: "10px", fontWeight: 600, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</label>
                <select value={value ?? ""} onChange={(e) => setter(e.target.value || undefined)} className="glass-select" style={selectCls}>
                  {opts.map((o) => <option key={o.label} value={o.value ?? ""}>{o.label}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text)", lineHeight: 1.2 }}>{t("nav.video")}</h2>
          <p style={{ fontSize: "11px", color: "var(--muted)", marginTop: "3px", letterSpacing: "0.04em" }}>
            {t("converter.localOnly") || "100% local"}
          </p>
        </div>
        {/* Segmented control */}
        <div className="seg-ctrl">
          <button disabled={isConverting} className={mode === "single" ? "active" : ""} onClick={() => { setMode("single"); reset(); }}>
            {t("batch.single")}
          </button>
          <button disabled={isConverting} className={mode === "batch" ? "active" : ""} onClick={() => { setMode("batch"); reset(); }}>
            {t("batch.toggle")}
          </button>
        </div>
      </div>

      {/* ── Single mode ──────────────────────────────────────────────────── */}
      {mode === "single" && (
        <>
          <DropZone
            onFilesDropped={(files) => { const p = files[0]; if (p) handleFileSelected(p); }}
            allowedExtensions={[...VIDEO_FORMATS]}
            disabled={isConverting}
            hasFile={!!inputPath}
            formats={VIDEO_FORMATS.join(" · ").toUpperCase()}
          >
            {inputPath ? (
              <>
                <div style={{ width: "56px", height: "56px", borderRadius: "14px", background: "var(--accent-dim)", border: "1px solid rgba(139, 122, 255, 0.25)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", fontWeight: 700, fontSize: "10px", letterSpacing: "0.06em", flexShrink: 0 }}>VID</div>
                <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", width: "100%", minWidth: 0 }}>
                  <p
                    className="truncate"
                    style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)", maxWidth: "100%", minWidth: 0 }}
                    title={inputPath.split(/[\\/]/).pop()}
                  >
                    {inputPath.split(/[\\/]/).pop()}
                  </p>
                  {mediaInfo && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "center", fontSize: "11px" }}>
                      {mediaInfo.duration > 0 && <span className="glass-badge">{formatDuration(mediaInfo.duration)}</span>}
                      {mediaInfo.width && mediaInfo.height && <span className="glass-badge">{mediaInfo.width}×{mediaInfo.height}</span>}
                      {mediaInfo.video_codec && <span className="glass-badge">{mediaInfo.video_codec}</span>}
                      {mediaInfo.bitrate && <span className="glass-badge">{mediaInfo.bitrate}</span>}
                      <span className="glass-badge">{formatFileSize(mediaInfo.file_size)}</span>
                    </div>
                  )}
                  {outputPath && (
                    <span
                      className="glass-badge"
                      style={{
                        fontSize: "11px",
                        color: "var(--accent)",
                        background: "var(--accent-dim)",
                        borderColor: "rgba(139, 122, 255, 0.3)",
                        maxWidth: "100%",
                        minWidth: 0,
                        overflow: "hidden",
                      }}
                      title={outputPath}
                    >
                      <span className="truncate" style={{ minWidth: 0 }}>
                        → {t("converter.outputPreview", { name: outputPath.split(/[\\/]/).pop() })}
                      </span>
                    </span>
                  )}
                </div>
                {!isConverting && <span style={{ fontSize: "11px", color: "var(--accent)" }}>{t("dropzone.fileLoaded")}</span>}
              </>
            ) : undefined}
          </DropZone>

          {inputPath && !isConverting && !isDone && (
            <>
              {optionsPanel}
              <button className="btn-primary" onClick={handleConvert} style={{ width: "100%" }}>
                {t("converter.convert")}
              </button>
            </>
          )}

          {isConverting && <ProgressBar progress={progress} currentTime={currentTime} speed={speed} onCancel={cancel} />}
          {isDone && outputPath && (
            <ConversionResult outputPath={outputPath} onNewConversion={() => { reset(); setInputPath(null); setMediaInfo(null); }} />
          )}
        </>
      )}

      {/* ── Batch mode ──────────────────────────────────────────────────── */}
      {mode === "batch" && (
        <>
          {!isConverting && !isDone && (
            <DropZone
              onFilesDropped={handleBatchFilesAdded}
              allowedExtensions={[...VIDEO_FORMATS]}
              multiple={true}
              formats={VIDEO_FORMATS.join(" · ").toUpperCase()}
            />
          )}

          {batchFiles.length > 0 && !isDone && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                <span className="glass-badge" style={{ fontSize: "11px", fontWeight: 600 }}>
                  {t("batch.fileCount", { count: batchFiles.length })}
                </span>
                {!isConverting && !isDone && (
                  <button
                    className="btn-danger"
                    style={{ padding: "5px 10px", fontSize: "11px" }}
                    onClick={() => { setBatchFiles([]); reset(); }}
                  >
                    <IcnTrash size={13} />
                    {t("converter.clear")}
                  </button>
                )}
              </div>
              <MediaBatchFileList
                files={batchFiles}
                results={results}
                onRemove={!isConverting ? (p) => setBatchFiles((prev) => prev.filter((f) => f !== p)) : undefined}
              />
            </div>
          )}

          {batchFiles.length > 0 && !isConverting && !isDone && (
            <>
              {optionsPanel}
              <button className="btn-primary" onClick={handleConvertBatch} style={{ width: "100%" }}>
                {t("converter.convert")} ({batchFiles.length})
              </button>
            </>
          )}

          {isConverting && <ProgressBar progress={progress} currentFile={batchProgressLabel} onCancel={cancel} />}

          {isDone && results && (
            <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--success)", fontSize: "13px", fontWeight: 600 }}>
                  <IcnCheck size={15} strokeWidth={2.5} />
                  {t("batch.successCount", { count: results.filter((r) => r.success).length })}
                </span>
                {results.some((r) => !r.success) && (
                  <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--error)", fontSize: "13px" }}>
                    <IcnX size={14} strokeWidth={2.5} />
                    {t("batch.errorCount", { count: results.filter((r) => !r.success).length })}
                  </span>
                )}
              </div>
              <MediaBatchFileList files={batchFiles} results={results} />
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {results.some((r) => r.success) && (
                  <button className="btn-ghost" onClick={async () => {
                    const first = results.find((r) => r.success);
                    if (first) await invoke("open_folder", { file_path: first.output });
                  }}>
                    <IcnFolder size={14} />{t("result.openFolder")}
                  </button>
                )}
                <button className="btn-primary" onClick={() => { reset(); setBatchFiles([]); }}>
                  <IcnRefresh size={14} />
                  {t("result.newConversion")}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {status === "error" && error && (
        <div style={{ display: "flex", gap: "8px", color: "var(--error)", fontSize: "13px", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: "10px", padding: "12px 14px", minWidth: 0, overflowWrap: "anywhere" }}>
          <IcnX size={15} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: "1px" }} />
          <span>{t("converter.error")}: {error === "busy" ? t("converter.busy") : error}</span>
        </div>
      )}
    </div>
  );
}
