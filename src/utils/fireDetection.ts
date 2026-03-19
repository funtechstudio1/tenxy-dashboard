/**
 * fireDetection.ts — Worker proxy for YOLO11 fire detection.
 *
 * All ONNX inference runs inside a Web Worker so the main thread / React UI
 * is never blocked. API is identical to before: loadModel() + runInference().
 */

export interface Detection {
  x1Norm: number
  y1Norm: number
  x2Norm: number
  y2Norm: number
  confidence: number
}

// ── Worker singleton ──────────────────────────────────────────────────────────

let worker: Worker | null = null
let msgId = 0
let workerReady = false
let workerError: string | null = null
let loadPromise: Promise<void> | null = null

// Pending message callbacks keyed by message id
const pending = new Map<string, (data: Record<string, unknown>) => void>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      new URL('../workers/fireInference.worker.ts', import.meta.url),
      { type: 'module' },
    )
    worker.addEventListener('message', (e: MessageEvent) => {
      const cb = pending.get(e.data.id)
      if (cb) {
        pending.delete(e.data.id)
        cb(e.data as Record<string, unknown>)
      }
    })
  }
  return worker
}

function send(msg: Record<string, unknown>, transfer?: Transferable[]): Promise<Record<string, unknown>> {
  const id = String(msgId++)
  return new Promise(resolve => {
    pending.set(id, resolve)
    getWorker().postMessage({ ...msg, id }, transfer ?? [])
  })
}

// ── Public API ────────────────────────────────────────────────────────────────

export function isModelReady(): boolean { return workerReady }
export function getModelError(): string | null { return workerError }

export async function loadModel(): Promise<void> {
  if (workerReady) return
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    const result = await send({
      type: 'load',
      modelUrl: import.meta.env.BASE_URL + 'fire.onnx',
    })
    if (result.type === 'error') {
      workerError = result.error as string
      loadPromise = null
      throw new Error(workerError ?? 'Model load failed')
    }
    workerReady = true
    workerError = null
  })()

  return loadPromise
}

// Busy flag — skip frame if previous inference hasn't returned yet
let inferBusy = false

export async function runInference(
  frame: ImageData,
  confThreshold = 0.25,
  iouThreshold  = 0.45,
): Promise<Detection[]> {
  if (!workerReady || inferBusy) return []
  inferBusy = true

  // Copy pixel buffer — transfer to worker (zero-copy, avoids 1-3ms copy on main thread)
  const buffer = frame.data.buffer.slice(0)

  try {
    const result = await send(
      { type: 'infer', pixels: buffer, width: frame.width, height: frame.height, confThreshold, iouThreshold },
      [buffer],
    )
    return (result.detections as Detection[]) ?? []
  } finally {
    inferBusy = false
  }
}
