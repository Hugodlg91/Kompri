import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useState, useEffect, useRef, useCallback } from "react";
import type { HistoryItem } from "./useHistory";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MediaInfo {
  duration: number;
  width?: number;
  height?: number;
  video_codec?: string;
  audio_codec?: string;
  file_size: number;
  bitrate?: string;
  fps?: number;
  audio_bitrate_kbps?: number;
  has_audio?: boolean;
}

export interface TargetSizeEstimate {
  already_under_target: boolean;
  source_size_bytes: number;
  target_bytes: number;
  budget_bytes: number;
  video_kbps: number;
  audio_kbps: number;
  target_width: number;
  target_height: number;
  target_fps: number;
  downscaled: boolean;
  fps_reduced: boolean;
}

export interface CompressVideoToSizeParams {
  input_path: string;
  output_path: string;
  target_mb: number;
  codec?: string;
  copy_if_under?: boolean;
}

export interface CompressVideoBatchParams {
  files: BatchMediaItem[];
  target_mb: number;
  codec?: string;
  copy_if_under?: boolean;
}

export interface VideoConvertParams {
  input_path: string;
  output_path: string;
  resolution?: string;
  codec?: string;
  bitrate?: string;
}

export interface AudioConvertParams {
  input_path: string;
  output_path: string;
  bitrate?: string;
  sample_rate?: string;
  normalize?: boolean;
}

export interface BatchMediaItem {
  input_path: string;
  output_path: string;
}

export interface BatchResult {
  input: string;
  output: string;
  success: boolean;
  error?: string;
}

export interface BatchVideoParams {
  files: BatchMediaItem[];
  resolution?: string;
  codec?: string;
  bitrate?: string;
}

export interface BatchAudioParams {
  files: BatchMediaItem[];
  bitrate?: string;
  sample_rate?: string;
  normalize?: boolean;
}

interface ProgressPayload {
  percentage: number;
  current_time: string;
  speed: string;
  pass?: number;
  total_passes?: number;
}

interface BatchProgressPayload {
  index: number;
  total: number;
  current_file: string;
  percentage: number;
}

export type ConversionStatus = "idle" | "converting" | "done" | "error";

/** Same code as the backend's refusal of a second simultaneous job. */
export const BUSY_ERROR = "busy";

// ─── History helper ───────────────────────────────────────────────────────────

function recordHistory(item: HistoryItem) {
  // Fire-and-forget: never block the UI on history persistence
  invoke("add_history_item", { item } as unknown as Record<string, unknown>).catch(
    () => { /* ignore */ }
  );
}

function fileNameFromPath(p: string): string {
  return p.replace(/\\/g, "/").split("/").pop() ?? p;
}

function extFromPath(p: string): string {
  const parts = fileNameFromPath(p).split(".");
  return parts.length > 1 ? parts.pop()! : "";
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useConversion() {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<ConversionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState("");
  const [currentTime, setCurrentTime] = useState("");
  const [pass, setPass] = useState<number | null>(null);
  const [totalPasses, setTotalPasses] = useState<number | null>(null);

  // Batch-specific state
  const [results, setResults] = useState<BatchResult[] | null>(null);
  const [batchIndex, setBatchIndex] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [currentFile, setCurrentFile] = useState<string | null>(null);

  // Prevents single-file "conversion_progress" from overwriting batch progress
  const isBatchRef = useRef(false);
  // Video and audio converters stay mounted together and hear the same
  // events; only the instance that launched the running job applies them.
  const ownsJobRef = useRef(false);

  const unsubRef = useRef<(() => void) | null>(null);
  const batchUnsubRef = useRef<(() => void) | null>(null);

  // Listen to single-file FFmpeg progress (also updates speed/time/pass in batch mode)
  useEffect(() => {
    let cancel = false;
    listen<ProgressPayload>("conversion_progress", (event) => {
      if (cancel || !ownsJobRef.current) return;
      const { percentage, speed, current_time, pass: p, total_passes } = event.payload;
      if (!isBatchRef.current) {
        setProgress(percentage);
      }
      if (speed) setSpeed(speed);
      if (current_time) setCurrentTime(current_time);
      setPass(p ?? null);
      setTotalPasses(total_passes ?? null);
    }).then((unlisten) => {
      if (cancel) unlisten();
      else unsubRef.current = unlisten;
    });
    return () => {
      cancel = true;
      unsubRef.current?.();
    };
  }, []);

  // Listen to batch progress
  useEffect(() => {
    let cancel = false;
    listen<BatchProgressPayload>("batch_progress", (event) => {
      if (cancel || !ownsJobRef.current || !isBatchRef.current) return;
      const { percentage, current_file, index, total } = event.payload;
      setProgress(percentage);
      setCurrentFile(current_file || null);
      setBatchIndex(index);
      setBatchTotal(total);
    }).then((unlisten) => {
      if (cancel) unlisten();
      else batchUnsubRef.current = unlisten;
    });
    return () => {
      cancel = true;
      batchUnsubRef.current?.();
    };
  }, []);

  const beginJob = useCallback((batchTotalCount?: number) => {
    setStatus("converting");
    setProgress(0);
    setError(null);
    setSpeed("");
    setCurrentTime("");
    setPass(null);
    setTotalPasses(null);
    if (batchTotalCount !== undefined) {
      setResults(null);
      setBatchIndex(0);
      setBatchTotal(batchTotalCount);
      setCurrentFile(null);
      isBatchRef.current = true;
    }
    ownsJobRef.current = true;
  }, []);

  const handleJobError = useCallback((e: unknown): never => {
    const msg = String(e);
    if (msg !== "cancelled") {
      setError(msg);
      setStatus("error");
    } else {
      setStatus("idle");
      setProgress(0);
      setSpeed("");
      setCurrentTime("");
      setPass(null);
      setTotalPasses(null);
    }
    throw e;
  }, []);

  // ── Single-file commands ───────────────────────────────────────────────────

  const convertVideo = useCallback(async (params: VideoConvertParams): Promise<string> => {
    // Refuse before touching the state of the job already running here.
    if (ownsJobRef.current) throw BUSY_ERROR;
    beginJob();
    try {
      const result = await invoke<string>("convert_video", params as unknown as Record<string, unknown>);
      setStatus("done");
      recordHistory({
        id: crypto.randomUUID(),
        file_name: fileNameFromPath(params.input_path),
        media_type: "video",
        source_format: extFromPath(params.input_path),
        target_format: extFromPath(params.output_path),
        output_path: params.output_path,
        timestamp: Date.now(),
        status: "success",
      });
      return result;
    } catch (e) {
      return handleJobError(e);
    } finally {
      ownsJobRef.current = false;
    }
  }, [beginJob, handleJobError]);

  const convertAudio = useCallback(async (params: AudioConvertParams): Promise<string> => {
    // Refuse before touching the state of the job already running here.
    if (ownsJobRef.current) throw BUSY_ERROR;
    beginJob();
    try {
      const result = await invoke<string>("convert_audio", params as unknown as Record<string, unknown>);
      setStatus("done");
      recordHistory({
        id: crypto.randomUUID(),
        file_name: fileNameFromPath(params.input_path),
        media_type: "audio",
        source_format: extFromPath(params.input_path),
        target_format: extFromPath(params.output_path),
        output_path: params.output_path,
        timestamp: Date.now(),
        status: "success",
      });
      return result;
    } catch (e) {
      return handleJobError(e);
    } finally {
      ownsJobRef.current = false;
    }
  }, [beginJob, handleJobError]);

  const compressVideoToSize = useCallback(async (params: CompressVideoToSizeParams): Promise<string> => {
    if (ownsJobRef.current) throw BUSY_ERROR;
    beginJob();
    try {
      const result = await invoke<string>(
        "compress_video_to_size",
        params as unknown as Record<string, unknown>
      );
      setStatus("done");
      recordHistory({
        id: crypto.randomUUID(),
        file_name: fileNameFromPath(params.input_path),
        media_type: "video",
        source_format: extFromPath(params.input_path),
        target_format: "mp4",
        output_path: typeof result === "string" && result.length > 0 ? result : params.output_path,
        timestamp: Date.now(),
        status: "success",
      });
      return result;
    } catch (e) {
      return handleJobError(e);
    } finally {
      ownsJobRef.current = false;
    }
  }, [beginJob, handleJobError]);

  // ── Batch commands ─────────────────────────────────────────────────────────

  const convertVideoBatch = useCallback(async (params: BatchVideoParams): Promise<BatchResult[]> => {
    // Refuse before touching the state of the job already running here.
    if (ownsJobRef.current) throw BUSY_ERROR;
    beginJob(params.files.length);
    try {
      const res = await invoke<BatchResult[]>(
        "convert_video_batch",
        params as unknown as Record<string, unknown>
      );
      setResults(res);
      setStatus("done");
      res.filter((r) => r.success).forEach((r) =>
        recordHistory({
          id: crypto.randomUUID(),
          file_name: fileNameFromPath(r.input),
          media_type: "video",
          source_format: extFromPath(r.input),
          target_format: extFromPath(r.output),
          output_path: r.output,
          timestamp: Date.now(),
          status: "success",
        })
      );
      return res;
    } catch (e) {
      return handleJobError(e);
    } finally {
      isBatchRef.current = false;
      ownsJobRef.current = false;
    }
  }, [beginJob, handleJobError]);

  const convertAudioBatch = useCallback(async (params: BatchAudioParams): Promise<BatchResult[]> => {
    // Refuse before touching the state of the job already running here.
    if (ownsJobRef.current) throw BUSY_ERROR;
    beginJob(params.files.length);
    try {
      const res = await invoke<BatchResult[]>(
        "convert_audio_batch",
        params as unknown as Record<string, unknown>
      );
      setResults(res);
      setStatus("done");
      res.filter((r) => r.success).forEach((r) =>
        recordHistory({
          id: crypto.randomUUID(),
          file_name: fileNameFromPath(r.input),
          media_type: "audio",
          source_format: extFromPath(r.input),
          target_format: extFromPath(r.output),
          output_path: r.output,
          timestamp: Date.now(),
          status: "success",
        })
      );
      return res;
    } catch (e) {
      return handleJobError(e);
    } finally {
      isBatchRef.current = false;
      ownsJobRef.current = false;
    }
  }, [beginJob, handleJobError]);

  const compressVideoBatchToSize = useCallback(
    async (params: CompressVideoBatchParams): Promise<BatchResult[]> => {
      if (ownsJobRef.current) throw BUSY_ERROR;
      beginJob(params.files.length);
      try {
        const res = await invoke<BatchResult[]>(
          "compress_video_batch_to_size",
          params as unknown as Record<string, unknown>
        );
        setResults(res);
        setStatus("done");
        res.filter((r) => r.success).forEach((r) =>
          recordHistory({
            id: crypto.randomUUID(),
            file_name: fileNameFromPath(r.input),
            media_type: "video",
            source_format: extFromPath(r.input),
            target_format: extFromPath(r.output) || "mp4",
            output_path: r.output,
            timestamp: Date.now(),
            status: "success",
          })
        );
        return res;
      } catch (e) {
        return handleJobError(e);
      } finally {
        isBatchRef.current = false;
        ownsJobRef.current = false;
      }
    },
    [beginJob, handleJobError]
  );

  // ── Shared utilities ───────────────────────────────────────────────────────

  const getMediaInfo = useCallback(
    (path: string): Promise<MediaInfo> =>
      invoke<MediaInfo>("get_media_info", { input_path: path }),
    []
  );

  const estimateTargetSize = useCallback(
    (input_path: string, target_mb: number, codec?: string): Promise<TargetSizeEstimate> =>
      invoke<TargetSizeEstimate>("estimate_target_size", { input_path, target_mb, codec }),
    []
  );

  // The pending conversion promise rejects with "cancelled" and resets the
  // state; resetting here would allow a relaunch before the job is released.
  const cancel = useCallback(async () => {
    await invoke("cancel_conversion");
  }, []);

  const reset = useCallback(() => {
    if (ownsJobRef.current) return;
    setStatus("idle");
    setProgress(0);
    setError(null);
    setSpeed("");
    setCurrentTime("");
    setPass(null);
    setTotalPasses(null);
    setResults(null);
    setBatchIndex(0);
    setBatchTotal(0);
    setCurrentFile(null);
    isBatchRef.current = false;
  }, []);

  return {
    progress,
    status,
    error,
    speed,
    currentTime,
    pass,
    totalPasses,
    results,
    batchIndex,
    batchTotal,
    currentFile,
    convertVideo,
    convertAudio,
    compressVideoToSize,
    convertVideoBatch,
    convertAudioBatch,
    compressVideoBatchToSize,
    getMediaInfo,
    estimateTargetSize,
    cancel,
    reset,
  };
}
