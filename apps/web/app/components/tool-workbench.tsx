"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import piexif from "piexifjs";
import { apiFetch, getApiBaseUrl } from "../lib/api-client";
import { JOB_HISTORY_KEY } from "../lib/storage-keys";
import { ensureViewerSubjectId } from "../lib/viewer-subject";
import { getViewerSession } from "../lib/session";

type ToolSlug = "resize" | "compress" | "convert" | "background-remove";
type ResizeFit = "cover" | "contain" | "inside" | "outside" | "fill";
type OutputFormat = "jpeg" | "png" | "webp";

type UploadInitResponse = {
  objectKey: string;
  uploadUrl: string;
  uploadFields: Record<string, string>;
};

type UploadCompleteResponse = {
  objectKey: string;
};

type JobCreateResponse = {
  id: string;
  status: "queued" | "running" | "done" | "failed";
};

type JobStatusResponse = {
  id: string;
  status: "queued" | "running" | "done" | "failed";
  outputObjectKey: string | null;
  outputMime: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  downloadUrl: string | null;
};

type WorkbenchProps = {
  tool: string;
  title?: string;
  intro?: string;
};

type LocalJobHistoryEntry = {
  id: string;
  tool: string;
  status: "done" | "failed";
  createdAt: string;
  outputObjectKey?: string | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanupIdempotencyKey(subjectId: string): string {
  return `web-cleanup-${subjectId}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

async function sha256Hex(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const chunks = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0"));
  return chunks.join("");
}

function readErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }
  const data = payload as { message?: string; error?: string };
  return data.message || data.error || fallback;
}

async function stripExif(rawFile: File): Promise<File> {
  if (rawFile.type !== "image/jpeg") {
    return rawFile;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const dataUrl = String(event.target?.result || "");
        const stripped = piexif.remove(dataUrl);
        const base64 = stripped.split(",")[1] || "";
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index);
        }
        resolve(new File([bytes], rawFile.name, { type: rawFile.type }));
      } catch {
        resolve(rawFile);
      }
    };
    reader.onerror = () => resolve(rawFile);
    reader.readAsDataURL(rawFile);
  });
}

function persistJobHistory(entry: LocalJobHistoryEntry): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const raw = localStorage.getItem(JOB_HISTORY_KEY);
    const parsed = raw ? (JSON.parse(raw) as LocalJobHistoryEntry[]) : [];
    const next = [entry, ...parsed.filter((item) => item.id !== entry.id)].slice(0, 20);
    localStorage.setItem(JOB_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // Ignore local history persistence failures in restrictive environments.
  }
}

function toStatusChip(statusText: string, running: boolean, hasError: boolean, hasResult: boolean): {
  label: string;
  className: "pending" | "processing" | "completed" | "failed";
} {
  if (hasError) {
    return { label: "Failed", className: "failed" };
  }
  if (hasResult) {
    return { label: "Completed", className: "completed" };
  }
  if (running || statusText !== "Idle") {
    return { label: "Processing", className: "processing" };
  }
  return { label: "Pending", className: "pending" };
}

function progressFromStatus(statusText: string, hasResult: boolean, hasError: boolean): number {
  if (hasResult || hasError) {
    return 100;
  }
  if (statusText.includes("Initializing upload")) {
    return 14;
  }
  if (statusText.includes("Uploading binary")) {
    return 32;
  }
  if (statusText.includes("Finalizing upload")) {
    return 52;
  }
  if (statusText.includes("Creating job")) {
    return 68;
  }
  if (statusText.includes("queued") || statusText.includes("running") || statusText.includes("Job")) {
    return 86;
  }
  if (statusText === "Cleanup completed") {
    return 100;
  }
  return 0;
}

export function ToolWorkbench(props: WorkbenchProps): ReactNode {
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [subjectPlan, setSubjectPlan] = useState<"free" | "pro" | "team">("free");
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [statusText, setStatusText] = useState("Idle");
  const [errorText, setErrorText] = useState("");
  const [result, setResult] = useState<JobStatusResponse | null>(null);
  const [lastInputKey, setLastInputKey] = useState<string | null>(null);
  const [lastOutputKey, setLastOutputKey] = useState<string | null>(null);

  const [resizeWidth, setResizeWidth] = useState("1600");
  const [resizeHeight, setResizeHeight] = useState("1600");
  const [resizeFit, setResizeFit] = useState<ResizeFit>("inside");
  const [compressQuality, setCompressQuality] = useState("80");
  const [convertFormat, setConvertFormat] = useState<OutputFormat>("jpeg");
  const [convertQuality, setConvertQuality] = useState("85");
  const [bgOutputFormat, setBgOutputFormat] = useState<OutputFormat>("png");

  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const viewer = getViewerSession();
        if (viewer.plan) {
          setSubjectPlan(viewer.plan);
        }

        const id = await ensureViewerSubjectId(apiBaseUrl);
        if (!cancelled) {
          setSubjectId(id);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorText(`Failed to initialize viewer session: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  const buildOptions = (): Record<string, unknown> => {
    if (props.tool === "resize") {
      const width = Number.parseInt(resizeWidth, 10);
      const height = Number.parseInt(resizeHeight, 10);
      return {
        ...(Number.isFinite(width) && width > 0 ? { width } : {}),
        ...(Number.isFinite(height) && height > 0 ? { height } : {}),
        fit: resizeFit
      };
    }

    if (props.tool === "compress") {
      const quality = Number.parseInt(compressQuality, 10);
      return Number.isFinite(quality) && quality >= 1 && quality <= 100 ? { quality } : {};
    }

    if (props.tool === "convert") {
      const quality = Number.parseInt(convertQuality, 10);
      return {
        format: convertFormat,
        ...(Number.isFinite(quality) && quality >= 1 && quality <= 100 ? { quality } : {})
      };
    }

    return { outputFormat: bgOutputFormat };
  };

  const runPipeline = async () => {
    if (!["resize", "compress", "convert", "background-remove"].includes(props.tool)) {
      setErrorText("Unsupported tool.");
      return;
    }

    if (!file) {
      setErrorText("Choose an input file first.");
      return;
    }

    const mime = file.type.toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
      setErrorText("Only JPG, PNG, and WEBP files are supported.");
      return;
    }

    setRunning(true);
    setErrorText("");
    setResult(null);
    setLastInputKey(null);
    setLastOutputKey(null);

    try {
      const effectiveSubjectId = subjectId || (await ensureViewerSubjectId(apiBaseUrl));
      setSubjectId(effectiveSubjectId);

      setStatusText("Initializing upload");
      const uploadInitResponse = await apiFetch(`${apiBaseUrl}/api/uploads/init`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectId: effectiveSubjectId,
          tool: props.tool as ToolSlug,
          filename: file.name,
          mime,
          size: file.size
        })
      });

      if (!uploadInitResponse.ok) {
        const payload = await uploadInitResponse.json().catch(() => null);
        throw new Error(readErrorMessage(payload, `Upload init failed (${uploadInitResponse.status})`));
      }

      const uploadInit = (await uploadInitResponse.json()) as UploadInitResponse;
      setLastInputKey(uploadInit.objectKey);

      setStatusText("Uploading binary");
      const uploadFormData = new FormData();
      for (const [key, value] of Object.entries(uploadInit.uploadFields || {})) {
        uploadFormData.append(key, value);
      }
      if (!uploadInit.uploadFields?.["Content-Type"]) {
        uploadFormData.append("Content-Type", mime);
      }
      uploadFormData.append("file", file);

      const uploadPostResponse = await fetch(uploadInit.uploadUrl, {
        method: "POST",
        body: uploadFormData
      });

      if (!uploadPostResponse.ok) {
        throw new Error(`Upload POST failed (${uploadPostResponse.status}). Verify storage endpoint configuration.`);
      }

      setStatusText("Finalizing upload");
      const sha256 = await sha256Hex(file);
      const uploadCompleteResponse = await apiFetch(`${apiBaseUrl}/api/uploads/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectId: effectiveSubjectId,
          objectKey: uploadInit.objectKey,
          sha256
        })
      });

      if (!uploadCompleteResponse.ok) {
        const payload = await uploadCompleteResponse.json().catch(() => null);
        throw new Error(readErrorMessage(payload, `Upload complete failed (${uploadCompleteResponse.status})`));
      }

      const uploadComplete = (await uploadCompleteResponse.json()) as UploadCompleteResponse;

      setStatusText("Creating job");
      const jobCreateResponse = await apiFetch(`${apiBaseUrl}/api/jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subjectId: effectiveSubjectId,
          tool: props.tool as ToolSlug,
          inputObjectKey: uploadComplete.objectKey,
          options: buildOptions()
        })
      });

      if (!jobCreateResponse.ok) {
        const payload = await jobCreateResponse.json().catch(() => null);
        throw new Error(readErrorMessage(payload, `Job create failed (${jobCreateResponse.status})`));
      }

      const created = (await jobCreateResponse.json()) as JobCreateResponse;
      setStatusText(`Job ${created.id} queued`);

      const deadline = Date.now() + 90_000;
      let finalJob: JobStatusResponse | null = null;

      while (Date.now() < deadline) {
        const statusResponse = await apiFetch(`${apiBaseUrl}/api/jobs/${created.id}`, { method: "GET" });
        if (!statusResponse.ok) {
          throw new Error(`Job status check failed (${statusResponse.status})`);
        }

        const statusPayload = (await statusResponse.json()) as JobStatusResponse;
        setStatusText(`Job ${created.id}: ${statusPayload.status}`);

        if (statusPayload.status === "done" || statusPayload.status === "failed") {
          finalJob = statusPayload;
          break;
        }

        await sleep(1000);
      }

      if (!finalJob) {
        throw new Error("Job did not complete before timeout.");
      }

      if (finalJob.status === "failed") {
        persistJobHistory({
          id: finalJob.id,
          tool: props.tool,
          status: "failed",
          createdAt: new Date().toISOString(),
          outputObjectKey: finalJob.outputObjectKey
        });
        throw new Error(finalJob.errorMessage || finalJob.errorCode || "Job failed.");
      }

      setStatusText("Completed");
      setResult(finalJob);
      setLastOutputKey(finalJob.outputObjectKey);
      persistJobHistory({
        id: finalJob.id,
        tool: props.tool,
        status: "done",
        createdAt: new Date().toISOString(),
        outputObjectKey: finalJob.outputObjectKey
      });
    } catch (error) {
      setStatusText("Failed");
      setErrorText(error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
    }
  };

  const cleanupRun = async (includeOutput: boolean) => {
    if (!subjectId || !lastInputKey) {
      return;
    }

    const keys = includeOutput && lastOutputKey ? [lastInputKey, lastOutputKey] : [lastInputKey];
    if (keys.length === 0) {
      return;
    }

    setErrorText("");
    setStatusText("Cleaning temporary objects");
    const response = await apiFetch(`${apiBaseUrl}/api/cleanup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": cleanupIdempotencyKey(subjectId)
      },
      body: JSON.stringify({
        objectKeys: keys,
        reason: "manual"
      })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setErrorText(readErrorMessage(payload, `Cleanup failed (${response.status})`));
      return;
    }

    setStatusText("Cleanup completed");
  };

  const chip = toStatusChip(statusText, running, Boolean(errorText), Boolean(result));
  const progress = progressFromStatus(statusText, Boolean(result), Boolean(errorText));
  const progressStyle = { "--progress": `${progress}%` } as CSSProperties;
  const workflowStep = running
    ? "processing"
    : result
      ? "done"
      : errorText
        ? "failed"
        : file
          ? "tool-select"
          : "upload";

  return (
    <section className="workbench">
      <div className="workbench-inner">
        <div className="workbench-head">
          <div>
            <span className="section-label">Live Processing</span>
            <h2>{props.title || "Run this tool now"}</h2>
            <p className="section-lead">
              {props.intro ||
                "Upload an image, create a job, poll completion, download output, and clean temporary objects in one sequence."}
            </p>
          </div>
          <p className="workbench-meta">
            Subject {subjectId || "initializing"} · Plan {subjectPlan.toUpperCase()}
          </p>
        </div>

        <div className="progress-line" style={progressStyle}>
          <span />
        </div>

        <div className="workbench-grid">
          <div className="workbench-form">
            <div className="drop-zone">
              <p>Drop a file or choose one below.</p>
              <input
                id="tool-input-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  if (!selected) {
                    setFile(null);
                    return;
                  }
                  void (async () => {
                    const cleanFile = await stripExif(selected);
                    setFile(cleanFile);
                  })();
                }}
              />
            </div>

            {props.tool === "resize" ? (
              <div className="field-grid" style={{ marginTop: "1rem" }}>
                <div className="field">
                  <label htmlFor="resize-width">Width</label>
                  <input
                    id="resize-width"
                    value={resizeWidth}
                    onChange={(event) => setResizeWidth(event.target.value)}
                    placeholder="1600"
                  />
                </div>
                <div className="field">
                  <label htmlFor="resize-height">Height</label>
                  <input
                    id="resize-height"
                    value={resizeHeight}
                    onChange={(event) => setResizeHeight(event.target.value)}
                    placeholder="1600"
                  />
                </div>
                <div className="field">
                  <label htmlFor="resize-fit">Fit</label>
                  <select id="resize-fit" value={resizeFit} onChange={(event) => setResizeFit(event.target.value as ResizeFit)}>
                    <option value="inside">inside</option>
                    <option value="contain">contain</option>
                    <option value="cover">cover</option>
                    <option value="outside">outside</option>
                    <option value="fill">fill</option>
                  </select>
                </div>
              </div>
            ) : null}

            {props.tool === "compress" ? (
              <div className="field-grid" style={{ marginTop: "1rem" }}>
                <div className="field">
                  <label htmlFor="compress-quality">Quality (1-100)</label>
                  <input
                    id="compress-quality"
                    value={compressQuality}
                    onChange={(event) => setCompressQuality(event.target.value)}
                    placeholder="80"
                  />
                </div>
              </div>
            ) : null}

            {props.tool === "convert" ? (
              <div className="field-grid" style={{ marginTop: "1rem" }}>
                <div className="field">
                  <label htmlFor="convert-format">Output format</label>
                  <select
                    id="convert-format"
                    value={convertFormat}
                    onChange={(event) => setConvertFormat(event.target.value as OutputFormat)}
                  >
                    <option value="jpeg">jpeg</option>
                    <option value="png">png</option>
                    <option value="webp">webp</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="convert-quality">Quality (1-100)</label>
                  <input
                    id="convert-quality"
                    value={convertQuality}
                    onChange={(event) => setConvertQuality(event.target.value)}
                    placeholder="85"
                  />
                </div>
              </div>
            ) : null}

            {props.tool === "background-remove" ? (
              <div className="field-grid" style={{ marginTop: "1rem" }}>
                <div className="field">
                  <label htmlFor="bg-output-format">Output format</label>
                  <select
                    id="bg-output-format"
                    value={bgOutputFormat}
                    onChange={(event) => setBgOutputFormat(event.target.value as OutputFormat)}
                  >
                    <option value="png">png</option>
                    <option value="jpeg">jpeg</option>
                    <option value="webp">webp</option>
                  </select>
                </div>
              </div>
            ) : null}

            <div className="workbench-actions">
              <button type="button" className="editorial-button accent btn-primary" disabled={running || !file || !subjectId} onClick={() => void runPipeline()}>
                <span>{running ? "Processing..." : "Run Tool"}</span>
              </button>
              <button
                type="button"
                className="editorial-button ghost btn-cream"
                disabled={running || !lastInputKey}
                onClick={() => void cleanupRun(false)}
              >
                <span>Cleanup Input</span>
              </button>
              <button
                type="button"
                className="editorial-button ghost btn-cream"
                disabled={running || !lastInputKey || !lastOutputKey}
                onClick={() => void cleanupRun(true)}
              >
                <span>Cleanup Input + Output</span>
              </button>
            </div>
          </div>

          <aside className="workbench-output">
            <AnimatePresence mode="wait">
              <motion.div
                key={workflowStep}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className={`status-chip ${chip.className} status-${chip.className}`}>{chip.label}</span>
                <p style={{ marginTop: "0.7rem" }}>{statusText}</p>

                {errorText ? (
                  <p style={{ marginTop: "0.7rem", color: "var(--terra-dark)" }}>{errorText}</p>
                ) : null}

                <div className="editorial-card" style={{ marginTop: "1rem" }}>
                  <p className="workbench-meta">Input Key</p>
                  <p>{lastInputKey || "-"}</p>
                </div>
                <div className="editorial-card" style={{ marginTop: "0.7rem" }}>
                  <p className="workbench-meta">Output Key</p>
                  <p>{lastOutputKey || "-"}</p>
                </div>

                {result?.downloadUrl ? (
                  <div className="tool-result" style={{ marginTop: "1rem" }}>
                    <a href={result.downloadUrl} target="_blank" rel="noreferrer" className="editorial-button primary btn-primary">
                      <span>Download Output</span>
                    </a>
                    {result.outputMime?.startsWith("image/") ? (
                      <img src={result.downloadUrl} alt="Processed output preview" />
                    ) : null}
                  </div>
                ) : null}
              </motion.div>
            </AnimatePresence>
          </aside>
        </div>
      </div>
    </section>
  );
}
