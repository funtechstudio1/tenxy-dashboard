/// <reference lib="webworker" />
/**
 * fireInference.worker.ts — YOLO11 fire detection running off the main thread.
 *
 * All heavy work (model loading, letterbox, ONNX session.run, NMS) happens
 * here so the main thread / React UI is never blocked.
 */

import * as ort from 'onnxruntime-web'

ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/'

interface Detection {
  x1Norm: number; y1Norm: number
  x2Norm: number; y2Norm: number
  confidence: number
}

let session: ort.InferenceSession | null = null

// ── Model loading ─────────────────────────────────────────────────────────────

async function initModel(modelUrl: string): Promise<void> {
  session = await ort.InferenceSession.create(modelUrl, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  })
}

// ── Preprocessing ─────────────────────────────────────────────────────────────

function letterbox(pixels: Uint8ClampedArray, srcW: number, srcH: number, target = 640) {
  const scale = Math.min(target / srcW, target / srcH)
  const newW  = Math.round(srcW * scale)
  const newH  = Math.round(srcH * scale)
  const padL  = Math.floor((target - newW) / 2)
  const padT  = Math.floor((target - newH) / 2)

  const dst = new OffscreenCanvas(target, target)
  const dstCtx = dst.getContext('2d')!
  dstCtx.fillStyle = 'rgb(114,114,114)'
  dstCtx.fillRect(0, 0, target, target)

  const src = new OffscreenCanvas(srcW, srcH)
  src.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels), srcW, srcH), 0, 0)
  dstCtx.drawImage(src, padL, padT, newW, newH)

  const out = dstCtx.getImageData(0, 0, target, target).data
  const n   = target * target
  const tensor = new Float32Array(3 * n)
  for (let i = 0; i < n; i++) {
    tensor[i]         = out[i * 4]     / 255
    tensor[n + i]     = out[i * 4 + 1] / 255
    tensor[n * 2 + i] = out[i * 4 + 2] / 255
  }
  return { tensor, padL, padT, scale, srcW, srcH }
}

// ── NMS ───────────────────────────────────────────────────────────────────────

function iou(a: Detection, b: Detection): number {
  const ix1 = Math.max(a.x1Norm, b.x1Norm), iy1 = Math.max(a.y1Norm, b.y1Norm)
  const ix2 = Math.min(a.x2Norm, b.x2Norm), iy2 = Math.min(a.y2Norm, b.y2Norm)
  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1)
  const aA = (a.x2Norm - a.x1Norm) * (a.y2Norm - a.y1Norm)
  const bA = (b.x2Norm - b.x1Norm) * (b.y2Norm - b.y1Norm)
  return inter / (aA + bA - inter + 1e-6)
}

function nms(dets: Detection[], iouThr: number): Detection[] {
  dets.sort((a, b) => b.confidence - a.confidence)
  const keep: Detection[] = []
  const sup = new Uint8Array(dets.length)
  for (let i = 0; i < dets.length; i++) {
    if (sup[i]) continue
    keep.push(dets[i])
    for (let j = i + 1; j < dets.length; j++)
      if (!sup[j] && iou(dets[i], dets[j]) > iouThr) sup[j] = 1
  }
  return keep
}

// ── Inference ─────────────────────────────────────────────────────────────────

async function runInference(
  pixels: Uint8ClampedArray,
  w: number, h: number,
  confThr: number,
  iouThr: number,
): Promise<Detection[]> {
  if (!session) return []

  const { tensor, padL, padT, scale, srcW, srcH } = letterbox(pixels, w, h)
  const input = new ort.Tensor('float32', tensor, [1, 3, 640, 640])
  const results = await session.run({ [session.inputNames[0]]: input })
  const raw = results[session.outputNames[0]].data as Float32Array

  const N = 8400
  const C = raw.length / N
  const candidates: Detection[] = []

  for (let i = 0; i < N; i++) {
    let conf = 0
    for (let c = 4; c < C; c++) { const v = raw[c * N + i]; if (v > conf) conf = v }
    if (conf < confThr) continue

    const cx = raw[0 * N + i], cy = raw[1 * N + i]
    const ww = raw[2 * N + i], hh = raw[3 * N + i]
    const x1 = ((cx - ww / 2) - padL) / scale
    const y1 = ((cy - hh / 2) - padT) / scale
    const x2 = ((cx + ww / 2) - padL) / scale
    const y2 = ((cy + hh / 2) - padT) / scale

    candidates.push({
      x1Norm: Math.max(0, x1 / srcW), y1Norm: Math.max(0, y1 / srcH),
      x2Norm: Math.min(1, x2 / srcW), y2Norm: Math.min(1, y2 / srcH),
      confidence: conf,
    })
  }

  return nms(candidates, iouThr)
}

// ── Message handler ───────────────────────────────────────────────────────────

self.addEventListener('message', async (e: MessageEvent) => {
  const { id, type } = e.data as { id: string; type: string }

  if (type === 'load') {
    try {
      await initModel(e.data.modelUrl as string)
      self.postMessage({ id, type: 'loaded' })
    } catch (err) {
      self.postMessage({ id, type: 'error', error: String(err) })
    }

  } else if (type === 'infer') {
    try {
      const pixels = new Uint8ClampedArray(e.data.pixels as ArrayBuffer)
      const dets = await runInference(
        pixels,
        e.data.width  as number,
        e.data.height as number,
        (e.data.confThreshold as number) ?? 0.25,
        (e.data.iouThreshold  as number) ?? 0.45,
      )
      self.postMessage({ id, type: 'result', detections: dets })
    } catch {
      self.postMessage({ id, type: 'result', detections: [] })
    }
  }
})
