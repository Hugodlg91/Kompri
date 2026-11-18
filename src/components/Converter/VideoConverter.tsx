import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import {
  useConversion,
  MediaInfo,
  BatchMediaItem,
  BatchResult,
  TargetSizeEstimate,
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

type TargetPreset = "off" | "discord" | "whatsapp" | "gmail" | "custom";

export function VideoConverter({
  externalFiles,
}: {
  externalFiles?: { files: string[]; seq: number };
} = {}) {
  const { t } = useTranslation();
  const { settings } = useSettingsContext();
  const {
    progress, status, error, speed, currentTime, pass, totalPasses,
    results, batchIndex, batchTotal, currentFile,
    convertVideo, compressVideoToSize, convertVideoBatch, compressVideoBatchToSize,
    getMediaInfo, estimateTargetSize, cancel, reset,
  } = useConversion();

  const [mode, setMode] = useState<"single" | "batch">("single");
  const [inputPath, setInputPath] = useState<string | null>(null);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [finalOutputPath, setFinalOutputPath] = useState<string | null>(null);
  const [batchFiles, setBatchFiles] = useState<string[]>([]);

  const [outputFormat, setOutputFormat] = useState<VideoFormat>(
    (settings.default_video_format as VideoFormat) ?? "mp4"
  );
  const [resolution, setResolution] = useState<string | undefined>(undefined);
  const [codec, setCodec] = useState<string | undefined>(undefined);
  const [bitrate, setBitrate] = useState<string | undefined>(undefined);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [targetPreset, setTargetPreset] = useState<TargetPreset>("off");
  const [customTargetMb, setCustomTargetMb] = useState<string>("10");
  const [targetCodec, setTargetCodec] = useState<"h264" | "h265">("h264");
  const [maxQuality, setMaxQuality] = useState<boolean>(
    Boolean(settings.target_size_max_quality)
  );
  const [estimate, setEstimate] = useState<TargetSizeEstimate | null>(null);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  useEffect(() => {
    setMaxQuality(Boolean(settings.target_size_max_quality));
  }, [settings.target_size_max_quality]);

  const discordMb = settings.preset_discord_mb ?? 20;
  const whatsappMb = settings.preset_whatsapp_mb ?? 16;
  const gmailMb = settings.preset_gmail_mb ?? 25;
  const activeTargetMb =
    targetPreset === "discord"
      ? discordMb
      : targetPreset === "whatsapp"
        ? whatsappMb
        : targetPreset === "gmail"
          ? gmailMb
          : Math.max(1, parseFloat(customTargetMb) || 10);

  const effectiveFormat: VideoFormat = targetPreset !== "off" ? "mp4" : outputFormat;
  const outputPath = inputPath
    ? buildOutputPath(inputPath, effectiveFormat, settings.output_dir ?? undefined)
    : null;

  const isConverting = status === "converting";
  const isDone = status === "done";

  useEffect(() => {
    if (mode !== "single" || !inputPath || targetPreset === "off") {
      setEstimate(null);
      setEstimateError(null);
      return;
    }
    let cancelled = false;
    setEstimateError(null);
    estimateTargetSize(inputPath, activeTargetMb, targetCodec)
      .then((res) => {
        if (!cancelled) {
          setEstimate(res);
          setEstimateError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setEstimate(null);
          setEstimateError(String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mode, inputPath, targetPreset, activeTargetMb, targetCodec, estimateTargetSize]);

  const handleFileSelected = useCallback(
    async (path: string) => {
      setInputPath(path);
      setFinalOutputPath(null);
      reset();
      setMediaInfo(null);
      try { const info = await getMediaInfo(path); setMediaInfo(info); } catch { /* non-blocking */ }
    },
    [getMediaInfo, reset]
  );

  useEffect(() => {
    if (!externalFiles || externalFiles.seq === 0 || externalFiles.files.length === 0) return;
    if (externalFiles.files.length === 1) {
      setMode("single");
      handleFileSelected(externalFiles.files[0]);
    } else {
      setMode("batch");
      setBatchFiles(externalFiles.files);
      reset();
    }
  }, [externalFiles, handleFileSelected, reset]);

  const handleCopyAsIs = useCallback(async () => {
    if (!inputPath || !outputPath) return;
    const res = await compressVideoToSize({
      input_path: inputPath,
      output_path: outputPath,
      target_mb: activeTargetMb,
      codec: targetCodec,
      copy_if_under: true,
      max_quality: false,
    });
    if (typeof res === "string" && res.length > 0) setFinalOutputPath(res);
  }, [inputPath, outputPath, activeTargetMb, targetCodec, compressVideoToSize]);

  const handleConvert = useCallback(async () => {
    if (!inputPath || !outputPath) return;
    if (targetPreset !== "off") {
      const res = await compressVideoToSize({
        input_path: inputPath,
        output_path: outputPath,
        target_mb: activeTargetMb,
        codec: targetCodec,
        copy_if_under: false,
        max_quality: maxQuality,
      });
      if (typeof res === "string" && res.length > 0) setFinalOutputPath(res);
    } else {
      const res = await convertVideo({
        input_path: inputPath,
        output_path: outputPath,
        resolution,
        codec,
        bitrate,
      });
      if (typeof res === "string" && res.length > 0) setFinalOutputPath(res);
    }
  }, [
    inputPath,
    outputPath,
    targetPreset,
    activeTargetMb,
    targetCodec,
    maxQuality,
    compressVideoToSize,
    convertVideo,
    resolution,
    codec,
    bitrate,
  ]);

  const handleFormatChange = (fmt: VideoFormat) => {
    if (targetPreset !== "off") return;
    setOutputFormat(fmt);
    setFinalOutputPath(null);
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
      output_path: buildOutputPath(p, effectiveFormat, settings.output_dir ?? undefined),
    }));
    if (targetPreset !== "off") {
      await compressVideoBatchToSize({
        files,
        target_mb: activeTargetMb,
        codec: targetCodec,
        copy_if_under: true,
        max_quality: maxQuality,
      });
    } else {
      await convertVideoBatch({ files, resolution, codec, bitrate });
    }
  }, [
    batchFiles,
    effectiveFormat,
    settings.output_dir,
    targetPreset,
    activeTargetMb,
    targetCodec,
    maxQuality,
    compressVideoBatchToSize,
    convertVideoBatch,
    resolution,
    codec,
    bitrate,
  ]);

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
          {VIDEO_FORMATS.map((f) => {
            const locked = targetPreset !== "off" && f !== "mp4";
            return (
              <button
                key={f}
                type="button"
                disabled={locked}
                onClick={() => handleFormatChange(f)}
                className={`fmt-pill ${effectiveFormat === f ? "active" : ""}`}
                style={locked ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
              >
                {f.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Target size (1-click) */}
      <div className="card" style={{ padding: "14px 16px" }}>
        <p className="section-label">{t("targetSize.label")}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {[
            { id: "off" as const, label: t("targetSize.off") },
            { id: "discord" as const, label: `Discord (${discordMb} MB)` },
            { id: "whatsapp" as const, label: `WhatsApp (${whatsappMb} MB)` },
            { id: "gmail" as const, label: `Gmail (${gmailMb} MB)` },
            { id: "custom" as const, label: t("targetSize.custom") },
          ].map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setTargetPreset(preset.id)}
              className={`fmt-pill ${targetPreset === preset.id ? "active" : ""}`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {targetPreset === "custom" && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "12px" }}>
            <input
              type="number"
              min={1}
              step={1}
              aria-label={t("targetSize.custom")}
              value={customTargetMb}
              onChange={(e) => setCustomTargetMb(e.target.value)}
              className="glass-input"
              style={{ width: "110px" }}
            />
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-sub)" }}>MB</span>
          </div>
        )}

        {targetPreset !== "off" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 600,
                  color: "var(--muted)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {t("converter.codec")}
              </span>
              {(["h264", "h265"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setTargetCodec(c)}
                  className={`fmt-pill ${targetCodec === c ? "active" : ""}`}
                >
                  {c === "h264" ? "H.264" : "H.265"}
                </button>
              ))}
            </div>

            {targetCodec === "h265" && (
              <div
                role="note"
                style={{
                  fontSize: "11px",
                  lineHeight: 1.45,
                  color: "var(--text)",
                  background: "rgba(245, 158, 11, 0.1)",
                  border: "1px solid rgba(245, 158, 11, 0.35)",
                  borderRadius: "10px",
                  padding: "8px 12px",
                }}
              >
                {t("targetSize.h265Warning")}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                paddingTop: "4px",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                <label
                  htmlFor="target-size-max-quality-toggle"
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--text)",
                    cursor: "pointer",
                  }}
                >
                  {t("targetSize.maxQuality")}
                </label>
                <span style={{ fontSize: "11px", color: "var(--muted)", lineHeight: 1.35 }}>
                  {t("targetSize.maxQualityHint")}
                </span>
              </div>
              <button
                id="target-size-max-quality-toggle"
                type="button"
                role="switch"
                aria-checked={maxQuality}
                aria-label={t("targetSize.maxQuality")}
                onClick={() => setMaxQuality((v) => !v)}
                style={{
                  width: "40px",
                  height: "22px",
                  borderRadius: "999px",
                  background: maxQuality ? "var(--accent)" : "var(--border2)",
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                  position: "relative",
                  transition: "background 0.15s ease",
                  flexShrink: 0,
                  padding: 0,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "2px",
                    left: maxQuality ? "20px" : "2px",
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

            {mode === "single" && estimate?.already_under_target && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: "10px",
                  background: "var(--accent-dim)",
                  border: "1px solid rgba(139, 122, 255, 0.3)",
                  borderRadius: "12px",
                  padding: "10px 14px",
                }}
              >
                <span style={{ fontSize: "12px", color: "var(--text)", flex: "1 1 220px" }}>
                  {t("targetSize.alreadyUnder", {
                    size: formatFileSize(estimate.source_size_bytes),
                    target: activeTargetMb,
                  })}
                </span>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleCopyAsIs}
                  style={{ padding: "7px 14px", fontSize: "12px" }}
                >
                  {t("targetSize.copyAsIs")}
                </button>
              </div>
            )}

            {mode === "single" && estimate && !estimate.already_under_target && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                <span className="glass-badge">
                  {t("targetSize.estimatedResolution")}: {estimate.target_width}×{estimate.target_height}
                  {estimate.downscaled ? ` (${t("targetSize.downscaled")})` : ""}
                </span>
                <span className="glass-badge">{estimate.target_fps} fps</span>
                <span className="glass-badge">
                  ~{estimate.video_kbps} kbps · 2-pass {targetCodec.toUpperCase()}
                </span>
              </div>
            )}

            {mode === "single" && estimateError && (
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--error)",
                  background: "rgba(248, 113, 113, 0.08)",
                  border: "1px solid rgba(248, 113, 113, 0.25)",
                  borderRadius: "10px",
                  padding: "8px 12px",
                }}
              >
                {estimateError.toLowerCase().includes("small") || estimateError.toLowerCase().includes("faible")
                  ? t("targetSize.tooSmall")
                  : estimateError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Advanced toggle (standard format conversion only) */}
      {targetPreset === "off" && (
        <>
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
              <button
                className="btn-primary"
                onClick={handleConvert}
                disabled={targetPreset !== "off" && !!estimateError}
                style={{
                  width: "100%",
                  ...(targetPreset !== "off" && estimateError
                    ? { opacity: 0.5, cursor: "not-allowed" }
                    : {}),
                }}
              >
                {t("converter.convert")}
              </button>
            </>
          )}

          {isConverting && (
            <ProgressBar
              progress={progress}
              currentTime={currentTime}
              speed={speed}
              pass={pass}
              totalPasses={totalPasses}
              onCancel={cancel}
            />
          )}
          {isDone && (finalOutputPath ?? outputPath) && (
            <ConversionResult
              outputPath={(finalOutputPath ?? outputPath)!}
              onNewConversion={() => {
                reset();
                setInputPath(null);
                setFinalOutputPath(null);
                setMediaInfo(null);
                setEstimate(null);
                setEstimateError(null);
              }}
            />
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

          {isConverting && (
            <ProgressBar
              progress={progress}
              currentFile={batchProgressLabel}
              speed={speed}
              pass={pass}
              totalPasses={totalPasses}
              onCancel={cancel}
            />
          )}

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
