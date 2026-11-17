import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import {
  useImageConversion,
  ImageInfo,
  BatchImageItem,
  ResizeOptions,
  BatchResult,
} from "../../hooks/useImageConversion";
import { buildOutputPath, formatFileSize } from "../../utils/path";
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

const IMAGE_FORMATS = ["png", "jpg", "webp", "bmp", "tiff"] as const;
type ImageFormat = (typeof IMAGE_FORMATS)[number];

const QUALITY_FORMATS: ImageFormat[] = ["jpg"];
const ACCEPTED_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "bmp", "tiff", "tif"];

// ─── Toggle switch ────────────────────────────────────────────────────────────

function ToggleSwitch({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <button
        role="checkbox"
        aria-checked={value}
        onClick={() => onChange(!value)}
        style={{
          width: "36px",
          height: "20px",
          borderRadius: "10px",
          background: value ? "var(--accent)" : "var(--border2)",
          border: "none",
          cursor: "pointer",
          position: "relative",
          transition: "background 0.15s",
          flexShrink: 0,
          padding: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "2px",
            left: value ? "18px" : "2px",
            width: "16px",
            height: "16px",
            borderRadius: "50%",
            background: "#fff",
            transition: "left 0.15s",
          }}
        />
      </button>
      <label
        onClick={() => onChange(!value)}
        style={{ fontSize: "12px", color: "var(--text-sub)", cursor: "pointer", fontWeight: 500 }}
      >
        {label}
      </label>
    </div>
  );
}

// ─── Batch file list ──────────────────────────────────────────────────────────

function BatchFileList({
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

export function ImageConverter() {
  const { t } = useTranslation();
  const { settings } = useSettingsContext();
  const {
    progress, status, error, currentFile, results,
    convertImage, convertImagesBatch, getImageInfo, reset,
  } = useImageConversion();

  const [mode, setMode] = useState<"single" | "batch">("single");
  const [inputPath, setInputPath] = useState<string | null>(null);
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [batchFiles, setBatchFiles] = useState<string[]>([]);

  const [outputFormat, setOutputFormat] = useState<ImageFormat>(
    (settings.default_image_format as ImageFormat) ?? "png"
  );
  const [quality, setQuality] = useState(85);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [resizeEnabled, setResizeEnabled] = useState(false);
  const [resizeWidth, setResizeWidth] = useState("");
  const [resizeHeight, setResizeHeight] = useState("");
  const [keepAspectRatio, setKeepAspectRatio] = useState(true);

  const isConverting = status === "converting";
  const isDone = status === "done";

  // ── Helpers ──────────────────────────────────────────────────────────────

  const getResizeOptions = (): ResizeOptions | undefined => {
    if (!resizeEnabled) return undefined;
    const w = resizeWidth ? parseInt(resizeWidth, 10) : undefined;
    const h = resizeHeight ? parseInt(resizeHeight, 10) : undefined;
    if (!w && !h) return undefined;
    return { width: w, height: h, keep_aspect_ratio: keepAspectRatio };
  };

  const applyPreset = (preset: string) => {
    if (!imageInfo) return;
    switch (preset) {
      case "50%":
        setResizeWidth(String(Math.round(imageInfo.width * 0.5)));
        setResizeHeight(String(Math.round(imageInfo.height * 0.5)));
        setKeepAspectRatio(false);
        break;
      case "25%":
        setResizeWidth(String(Math.round(imageInfo.width * 0.25)));
        setResizeHeight(String(Math.round(imageInfo.height * 0.25)));
        setKeepAspectRatio(false);
        break;
      case "720p":
        setResizeWidth(""); setResizeHeight("720"); setKeepAspectRatio(true);
        break;
      case "1080p":
        setResizeWidth(""); setResizeHeight("1080"); setKeepAspectRatio(true);
        break;
      default:
        setResizeWidth(""); setResizeHeight("");
    }
    setResizeEnabled(true);
  };

  const handleFormatChange = (fmt: ImageFormat) => {
    setOutputFormat(fmt);
    if (inputPath) setOutputPath(buildOutputPath(inputPath, fmt, settings.output_dir ?? undefined));
  };

  // ── File selection ────────────────────────────────────────────────────────

  const handleSingleFileSelected = useCallback(
    async (path: string) => {
      setInputPath(path);
      setOutputPath(buildOutputPath(path, outputFormat, settings.output_dir ?? undefined));
      setPreviewSrc(convertFileSrc(path));
      reset();
      setImageInfo(null);
      try { const info = await getImageInfo(path); setImageInfo(info); } catch { /* non-blocking */ }
    },
    [outputFormat, settings.output_dir, getImageInfo, reset]
  );

  const handleBatchFilesAdded = useCallback(
    (paths: string[]) => {
      setBatchFiles((prev) => { const s = new Set(prev); paths.forEach((p) => s.add(p)); return Array.from(s); });
      reset();
    },
    [reset]
  );

  // ── Conversion ────────────────────────────────────────────────────────────

  const handleConvertSingle = useCallback(async () => {
    if (!inputPath || !outputPath) return;
    await convertImage({
      input_path: inputPath,
      output_path: outputPath,
      format: outputFormat,
      quality: QUALITY_FORMATS.includes(outputFormat) ? quality : undefined,
      resize: getResizeOptions(),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputPath, outputPath, outputFormat, quality, resizeEnabled, resizeWidth, resizeHeight, keepAspectRatio, convertImage]);

  const handleConvertBatch = useCallback(async () => {
    if (batchFiles.length === 0) return;
    const files: BatchImageItem[] = batchFiles.map((p) => ({
      input_path: p,
      output_path: buildOutputPath(p, outputFormat, settings.output_dir ?? undefined),
    }));
    await convertImagesBatch({
      files,
      format: outputFormat,
      quality: QUALITY_FORMATS.includes(outputFormat) ? quality : undefined,
      resize: getResizeOptions(),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchFiles, outputFormat, quality, resizeEnabled, resizeWidth, resizeHeight, keepAspectRatio, convertImagesBatch]);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    minWidth: "76px",
  };

  const optionsPanel = (
    <>
      {/* Format pills */}
      <div className="card" style={{ padding: "14px 16px" }}>
        <p className="section-label">{t("converter.output_format")}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {IMAGE_FORMATS.map((f) => (
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
        <div className="card" style={{ padding: "14px 16px", gap: "16px", display: "flex", flexDirection: "column" }}>
          {/* Quality slider */}
          {QUALITY_FORMATS.includes(outputFormat) && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ fontSize: "10px", fontWeight: 600, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {t("image.quality")}
                </label>
                <span className="glass-badge" style={{ fontSize: "11px", color: "var(--accent)", fontWeight: 600 }}>{quality}%</span>
              </div>
              <input
                type="range" min={1} max={100} value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                style={{ width: "100%", accentColor: "var(--accent)" }}
              />
            </div>
          )}

          {/* Resize */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <ToggleSwitch
              value={resizeEnabled}
              onChange={setResizeEnabled}
              label={t("image.resize")}
            />
            {resizeEnabled && (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", paddingLeft: "clamp(0px, 2.5vw, 24px)" }}>
                {/* Presets */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {["Original", "50%", "25%", "720p", "1080p"].map((p) => (
                    <button
                      key={p}
                      onClick={() =>
                        p === "Original"
                          ? (setResizeWidth(""), setResizeHeight(""), setResizeEnabled(false))
                          : applyPreset(p)
                      }
                      className="fmt-pill"
                    >
                      {p}
                    </button>
                  ))}
                </div>
                {/* W × H inputs */}
                <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px", flex: "1 1 100px", maxWidth: "140px", minWidth: 0 }}>
                    <label style={{ fontSize: "10px", fontWeight: 600, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      {t("image.width")}
                    </label>
                    <input
                      type="number" min={1} value={resizeWidth}
                      onChange={(e) => setResizeWidth(e.target.value)}
                      placeholder="px"
                      className="glass-input"
                      style={inputStyle}
                    />
                  </div>
                  <span style={{ color: "var(--muted)", fontSize: "14px", paddingBottom: "8px", flexShrink: 0 }}>×</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "5px", flex: "1 1 100px", maxWidth: "140px", minWidth: 0 }}>
                    <label style={{ fontSize: "10px", fontWeight: 600, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      {t("image.height")}
                    </label>
                    <input
                      type="number" min={1} value={resizeHeight}
                      onChange={(e) => setResizeHeight(e.target.value)}
                      placeholder="px"
                      className="glass-input"
                      style={inputStyle}
                    />
                  </div>
                </div>
                <ToggleSwitch
                  value={keepAspectRatio}
                  onChange={setKeepAspectRatio}
                  label={t("image.keepAspectRatio")}
                />
              </div>
            )}
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
          <h2 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text)", lineHeight: 1.2 }}>{t("nav.image")}</h2>
          <p style={{ fontSize: "11px", color: "var(--muted)", marginTop: "3px", letterSpacing: "0.04em" }}>
            {t("converter.localOnly") || "100% local"}
          </p>
        </div>
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
            onFilesDropped={(files) => { const p = files[0]; if (p) handleSingleFileSelected(p); }}
            allowedExtensions={ACCEPTED_EXTENSIONS}
            disabled={isConverting}
            hasFile={!!inputPath}
            formats={IMAGE_FORMATS.join(" · ").toUpperCase()}
          >
            {inputPath ? (
              <>
                {previewSrc ? (
                  <div style={{ width: "68px", height: "68px", borderRadius: "14px", overflow: "hidden", background: "var(--surface2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <img src={previewSrc} alt="preview" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                  </div>
                ) : (
                  <div style={{ width: "56px", height: "56px", borderRadius: "14px", background: "var(--accent-dim)", border: "1px solid rgba(139, 122, 255, 0.25)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", fontWeight: 700, fontSize: "10px", letterSpacing: "0.06em", flexShrink: 0 }}>IMG</div>
                )}
                <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", width: "100%", minWidth: 0 }}>
                  <p
                    className="truncate"
                    style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)", maxWidth: "100%", minWidth: 0 }}
                    title={inputPath.split(/[\\/]/).pop()}
                  >
                    {inputPath.split(/[\\/]/).pop()}
                  </p>
                  {imageInfo && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "center", fontSize: "11px" }}>
                      <span className="glass-badge">{imageInfo.width} × {imageInfo.height} px</span>
                      <span className="glass-badge">{imageInfo.format.toUpperCase()}</span>
                      <span className="glass-badge">{formatFileSize(imageInfo.file_size)}</span>
                      {imageInfo.has_alpha && <span className="glass-badge">{t("image.fileInfo.hasAlpha")}</span>}
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
              <button className="btn-primary" onClick={handleConvertSingle} style={{ width: "100%" }}>
                {t("converter.convert")}
              </button>
            </>
          )}

          {isConverting && <ProgressBar progress={progress} />}

          {isDone && outputPath && (
            <ConversionResult
              outputPath={outputPath}
              onNewConversion={() => { reset(); setInputPath(null); setImageInfo(null); setPreviewSrc(null); }}
            />
          )}
        </>
      )}

      {/* ── Batch mode ───────────────────────────────────────────────────── */}
      {mode === "batch" && (
        <>
          {!isConverting && !isDone && (
            <DropZone
              onFilesDropped={handleBatchFilesAdded}
              allowedExtensions={ACCEPTED_EXTENSIONS}
              multiple={true}
              formats={IMAGE_FORMATS.join(" · ").toUpperCase()}
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
              <BatchFileList
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

          {isConverting && <ProgressBar progress={progress} currentFile={currentFile ?? undefined} />}

          {isDone && results && (
            <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--success)", fontSize: "13px", fontWeight: 600 }}>
                  <IcnCheck size={15} strokeWidth={2.5} />
                  {t("image.batchSuccess", { count: results.filter((r) => r.success).length })}
                </span>
                {results.some((r) => !r.success) && (
                  <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--error)", fontSize: "13px" }}>
                    <IcnX size={14} strokeWidth={2.5} />
                    {t("image.batchErrors", { count: results.filter((r) => !r.success).length })}
                  </span>
                )}
              </div>
              <BatchFileList files={batchFiles} results={results} />
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

      {/* Error */}
      {status === "error" && error && (
        <div style={{ display: "flex", gap: "8px", color: "var(--error)", fontSize: "13px", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: "10px", padding: "12px 14px", minWidth: 0, overflowWrap: "anywhere" }}>
          <IcnX size={15} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: "1px" }} />
          <span>{t("converter.error")}: {error === "busy" ? t("converter.busy") : error}</span>
        </div>
      )}
    </div>
  );
}
