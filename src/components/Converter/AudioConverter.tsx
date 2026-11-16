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

const AUDIO_FORMATS = ["mp3", "flac", "wav", "ogg", "aac", "m4a"] as const;
type AudioFormat = (typeof AUDIO_FORMATS)[number];

const BITRATES = [
  { label: "Auto",     value: undefined },
  { label: "128 kbps", value: "128k" },
  { label: "192 kbps", value: "192k" },
  { label: "256 kbps", value: "256k" },
  { label: "320 kbps", value: "320k" },
];

const SAMPLE_RATES = [
  { label: "Original", value: undefined },
  { label: "22050 Hz", value: "22050" },
  { label: "44100 Hz", value: "44100" },
  { label: "48000 Hz", value: "48000" },
  { label: "96000 Hz", value: "96000" },
];

const ACCEPTED_EXTENSIONS = [...AUDIO_FORMATS, "mp4", "mkv", "avi", "mov", "webm"];

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
              gap: "10px",
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
            <span style={{ fontSize: "12px", color: "var(--text-sub)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {name}
            </span>
            {result && result.success && outName && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                <span className="glass-badge" style={{ fontSize: "11px", color: "var(--success)" }}>
                  → {outName}
                </span>
                <button
                  className="btn-ghost"
                  style={{ padding: "4px 8px", fontSize: "11px" }}
                  title={t("result.openFile")}
                  onClick={() => invoke("open_file", { path: result.output })}
                >
                  <IcnExternalLink size={12} />
                </button>
                <button
                  className="btn-ghost"
                  style={{ padding: "4px 8px", fontSize: "11px" }}
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
                  maxWidth: "220px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={result.error ?? t("converter.error")}
              >
                {result.error ?? t("converter.error")}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AudioConverter() {
  const { t } = useTranslation();
  const { settings } = useSettingsContext();
  const {
    progress, status, error, speed, currentTime,
    results, batchIndex, batchTotal, currentFile,
    convertAudio, convertAudioBatch, getMediaInfo, cancel, reset,
  } = useConversion();

  const [mode, setMode] = useState<"single" | "batch">("single");
  const [inputPath, setInputPath] = useState<string | null>(null);
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [batchFiles, setBatchFiles] = useState<string[]>([]);

  const [outputFormat, setOutputFormat] = useState<AudioFormat>(
    (settings.default_audio_format as AudioFormat) ?? "mp3"
  );
  const [bitrate, setBitrate] = useState<string | undefined>(undefined);
  const [sampleRate, setSampleRate] = useState<string | undefined>(undefined);
  const [normalize, setNormalize] = useState(false);
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
    await convertAudio({ input_path: inputPath, output_path: outputPath, bitrate, sample_rate: sampleRate, normalize });
  }, [inputPath, outputPath, bitrate, sampleRate, normalize, convertAudio]);

  const handleFormatChange = (fmt: AudioFormat) => {
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
    await convertAudioBatch({ files, bitrate, sample_rate: sampleRate, normalize });
  }, [batchFiles, outputFormat, settings.output_dir, bitrate, sampleRate, normalize, convertAudioBatch]);

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
      <div className="card" style={{ padding: "14px 16px" }}>
        <p className="section-label">{t("converter.output_format")}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {AUDIO_FORMATS.map((f) => (
            <button key={f} onClick={() => handleFormatChange(f)} className={`fmt-pill ${outputFormat === f ? "active" : ""}`}>
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              <label style={{ fontSize: "10px", fontWeight: 600, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{t("converter.bitrate")}</label>
              <select value={bitrate ?? ""} onChange={(e) => setBitrate(e.target.value || undefined)} className="glass-select" style={selectCls}>
                {BITRATES.map((b) => <option key={b.label} value={b.value ?? ""}>{b.label}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              <label style={{ fontSize: "10px", fontWeight: 600, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>{t("converter.sampleRate")}</label>
              <select value={sampleRate ?? ""} onChange={(e) => setSampleRate(e.target.value || undefined)} className="glass-select" style={selectCls}>
                {SAMPLE_RATES.map((s) => <option key={s.label} value={s.value ?? ""}>{s.label}</option>)}
              </select>
            </div>
          </div>
          {/* Normalize toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "12px" }}>
            <button
              role="checkbox"
              aria-checked={normalize}
              onClick={() => setNormalize((v) => !v)}
              style={{
                width: "36px", height: "20px", borderRadius: "10px",
                background: normalize ? "var(--accent)" : "var(--border2)",
                border: "none", cursor: "pointer", transition: "background 0.15s",
                position: "relative", flexShrink: 0,
              }}
            >
              <span style={{
                position: "absolute", top: "3px",
                left: normalize ? "18px" : "3px",
                width: "14px", height: "14px", borderRadius: "50%", background: "#fff",
                transition: "left 0.15s",
              }} />
            </button>
            <span style={{ fontSize: "12px", color: "var(--text-sub)", cursor: "pointer" }} onClick={() => setNormalize((v) => !v)}>
              {t("converter.normalize")}
            </span>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "24px", height: "100%", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: "24px", fontWeight: 700, color: "var(--text)", lineHeight: 1.2 }}>{t("nav.audio")}</h2>
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

      {mode === "single" && (
        <>
          <DropZone
            onFilesDropped={(files) => { const p = files[0]; if (p) handleFileSelected(p); }}
            allowedExtensions={ACCEPTED_EXTENSIONS}
            disabled={isConverting}
            hasFile={!!inputPath}
            formats={AUDIO_FORMATS.join(" · ").toUpperCase()}
          >
            {inputPath ? (
              <>
                <div style={{ width: "56px", height: "56px", borderRadius: "14px", background: "var(--accent-dim)", border: "1px solid rgba(139, 122, 255, 0.25)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--accent)", fontWeight: 700, fontSize: "10px", letterSpacing: "0.06em", flexShrink: 0 }}>AUD</div>
                <div style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                  <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text)" }}>
                    {inputPath.split(/[\\/]/).pop()}
                  </p>
                  {mediaInfo && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "center", fontSize: "11px" }}>
                      {mediaInfo.duration > 0 && <span className="glass-badge">{formatDuration(mediaInfo.duration)}</span>}
                      {mediaInfo.audio_codec && <span className="glass-badge">{mediaInfo.audio_codec}</span>}
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
                      }}
                      title={outputPath}
                    >
                      → {t("converter.outputPreview", { name: outputPath.split(/[\\/]/).pop() })}
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

      {mode === "batch" && (
        <>
          {!isConverting && !isDone && (
            <DropZone
              onFilesDropped={handleBatchFilesAdded}
              allowedExtensions={ACCEPTED_EXTENSIONS}
              multiple={true}
              formats={AUDIO_FORMATS.join(" · ").toUpperCase()}
            />
          )}

          {batchFiles.length > 0 && !isDone && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
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
        <div style={{ display: "flex", gap: "8px", color: "var(--error)", fontSize: "13px", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: "10px", padding: "12px 14px" }}>
          <IcnX size={15} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: "1px" }} />
          <span>{t("converter.error")}: {error === "busy" ? t("converter.busy") : error}</span>
        </div>
      )}
    </div>
  );
}
