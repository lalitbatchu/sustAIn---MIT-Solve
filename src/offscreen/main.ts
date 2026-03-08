import type { CompressionJob } from "../compression/runtime.js";

type OffscreenRequest =
  | {
      target: "compression-offscreen";
      type: "warmup";
      requestId: number;
    }
  | {
      target: "compression-offscreen";
      type: "compress";
      requestId: number;
      payload?: CompressionJob;
    };

type WorkerRequest =
  | {
      type: "warmup";
      requestId: number;
    }
  | (CompressionJob & {
      type: "compress";
      requestId: number;
    });

type WorkerResponse = {
  status?: "progress" | "complete" | "error" | "ready";
  requestId?: number;
  phase?: "init" | "compress";
  output?: string;
  message?: string;
};

type ActiveRequest = {
  kind: "warmup" | "compress";
};

const BACKGROUND_TARGET = "compression-background";

let modelWorker: Worker | null = null;
const activeRequests = new Map<number, ActiveRequest>();

function postToBackground(message: Record<string, unknown>) {
  void chrome.runtime.sendMessage({
    target: BACKGROUND_TARGET,
    ...message
  });
}

function failActiveRequests(errorMessage: string) {
  for (const requestId of activeRequests.keys()) {
    postToBackground({
      type: "compression-error",
      requestId,
      message: errorMessage
    });
  }
  activeRequests.clear();
}

function ensureModelWorker() {
  if (modelWorker) {
    return modelWorker;
  }

  const worker = new Worker(new URL("../modelWorker.ts", import.meta.url), {
    type: "module"
  });

  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    const requestId = message.requestId;
    if (typeof requestId !== "number") return;

    if (message.status === "progress") {
      postToBackground({
        type: "compression-progress",
        requestId,
        phase: message.phase ?? "init",
        message: message.message ?? ""
      });
      return;
    }

    if (message.status === "ready") {
      activeRequests.delete(requestId);
      postToBackground({
        type: "compression-ready",
        requestId
      });
      return;
    }

    if (message.status === "complete") {
      activeRequests.delete(requestId);
      postToBackground({
        type: "compression-complete",
        requestId,
        output: message.output ?? ""
      });
      return;
    }

    if (message.status === "error") {
      activeRequests.delete(requestId);
      postToBackground({
        type: "compression-error",
        requestId,
        message: message.message ?? "Compression failed."
      });
    }
  };

  worker.onerror = (event) => {
    console.error("sustAIn: model worker failed", event);
    failActiveRequests(event.message || "Compression worker crashed");
    worker.terminate();
    if (modelWorker === worker) {
      modelWorker = null;
    }
  };

  modelWorker = worker;
  return worker;
}

chrome.runtime.onMessage.addListener(
  (message: OffscreenRequest, _sender, sendResponse) => {
    if (message?.target !== "compression-offscreen") {
      return false;
    }

    const worker = ensureModelWorker();

    if (message.type === "warmup") {
      activeRequests.set(message.requestId, { kind: "warmup" });
      worker.postMessage({
        type: "warmup",
        requestId: message.requestId
      } satisfies WorkerRequest);
      sendResponse({ accepted: true });
      return false;
    }

    if (message.type === "compress") {
      const payload = message.payload;
      if (!payload || typeof payload.text !== "string") {
        sendResponse({ accepted: false, error: "Invalid compression payload" });
        return false;
      }

      activeRequests.set(message.requestId, { kind: "compress" });
      worker.postMessage({
        ...payload,
        type: "compress",
        requestId: message.requestId
      } satisfies WorkerRequest);
      sendResponse({ accepted: true });
      return false;
    }

    sendResponse({ accepted: false, error: "Unsupported offscreen request" });
    return false;
  }
);

console.log("sustAIn: offscreen document loaded");
