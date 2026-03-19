/**
 * FireDetectionOverlay — canvas overlay that runs YOLO11 fire detection
 * on the parent camera's WebGL frame at 2 FPS and draws bounding boxes.
 *
 * Usage: render inside any camera container that implements CameraHandle.
 * The canvas is absolutely positioned over the camera and pointer-events: none
 * so all map interactions pass through.
 */

import { useRef, useEffect, useState } from 'react'
import { loadModel, runInference, type Detection } from '../../utils/fireDetection'

export interface CameraHandle {
  getFrame(): ImageData | null
}

interface Props {
  cameraRef: React.RefObject<CameraHandle | null>
  enabled?: boolean
}

export default function FireDetectionOverlay({ cameraRef, enabled: initialEnabled = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [detections, setDetections] = useState<Detection[]>([])
  const [isEnabled, setIsEnabled] = useState(initialEnabled)
  // Canvas dimensions tracked via ResizeObserver — avoids per-draw offsetWidth reflow
  const canvasSizeRef = useRef({ w: 300, h: 200 })

  // Load ONNX model once on mount
  useEffect(() => {
    loadModel()
      .then(() => setModelStatus('ready'))
      .catch(() => setModelStatus('error'))
  }, [])

  // ResizeObserver — keeps canvas pixel size in sync without per-draw reflow
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const obs = new ResizeObserver(entries => {
      const e = entries[0]
      if (!e) return
      const { width, height } = e.contentRect
      canvasSizeRef.current = { w: Math.round(width), h: Math.round(height) }
      canvas.width  = canvasSizeRef.current.w
      canvas.height = canvasSizeRef.current.h
    })
    obs.observe(canvas)
    return () => obs.disconnect()
  }, [])

  // Inference loop — worker handles all heavy work off-thread, so no UI blocking.
  // 2000ms interval gives the worker plenty of time between calls.
  // Staggered start (0-600ms) so multiple open cameras don't fire simultaneously.
  useEffect(() => {
    if (!isEnabled || modelStatus !== 'ready') return

    let id: ReturnType<typeof setInterval>
    const startDelay = Math.random() * 600
    const timer = setTimeout(() => {
      id = setInterval(async () => {
        const frame = cameraRef.current?.getFrame()
        if (!frame || frame.width === 0 || frame.height === 0) return
        try {
          const dets = await runInference(frame)
          setDetections(dets)
        } catch {
          // non-fatal — skip frame
        }
      }, 2000)
    }, startDelay)

    return () => {
      clearTimeout(timer)
      clearInterval(id)
    }
  }, [isEnabled, modelStatus, cameraRef])

  // Clear detections when disabled
  useEffect(() => {
    if (!isEnabled) setDetections([])
  }, [isEnabled])

  // Draw bounding boxes on canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Use cached size from ResizeObserver — no layout reflow on every draw
    const W = canvasSizeRef.current.w || canvas.width || 300
    const H = canvasSizeRef.current.h || canvas.height || 200

    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, W, H)

    if (!isEnabled) return

    // ── Bounding boxes ────────────────────────────────────────────────
    detections.forEach(det => {
      const bx = det.x1Norm * W
      const by = det.y1Norm * H
      const bw = (det.x2Norm - det.x1Norm) * W
      const bh = (det.y2Norm - det.y1Norm) * H
      if (bw < 2 || bh < 2) return

      // Main box with red glow
      ctx.strokeStyle = '#ff3300'
      ctx.lineWidth = 2
      ctx.shadowColor = '#ff3300'
      ctx.shadowBlur = 8
      ctx.strokeRect(bx, by, bw, bh)
      ctx.shadowBlur = 0

      // L-shaped corner ticks (tactical HUD style)
      const tick = Math.min(bw, bh) * 0.15
      ctx.strokeStyle = '#ff6600'
      ctx.lineWidth = 2
      const corners: Array<[[number, number], [number, number], [number, number]]> = [
        [[bx + tick, by],      [bx, by],      [bx, by + tick]],
        [[bx+bw-tick, by],     [bx+bw, by],   [bx+bw, by+tick]],
        [[bx, by+bh-tick],     [bx, by+bh],   [bx+tick, by+bh]],
        [[bx+bw, by+bh-tick],  [bx+bw, by+bh],[bx+bw-tick, by+bh]],
      ]
      corners.forEach(([[x1,y1],[x2,y2],[x3,y3]]) => {
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.lineTo(x3, y3)
        ctx.stroke()
      })

      // Confidence badge above box
      const pct = Math.round(det.confidence * 100)
      const label = `FIRE ${pct}%`
      ctx.font = 'bold 10px monospace'
      const lw = ctx.measureText(label).width + 8
      const badgeY = Math.max(0, by - 18)
      ctx.fillStyle = 'rgba(180,20,0,0.9)'
      ctx.fillRect(bx, badgeY, lw, 16)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(label, bx + 4, badgeY + 12)
    })

    // ── Top banner when fire is detected ─────────────────────────────
    if (detections.length > 0) {
      const txt = `\u26a0 FIRE DETECTED \u2014 ${detections.length} SOURCE${detections.length > 1 ? 'S' : ''}`
      ctx.font = 'bold 11px monospace'
      const tw = ctx.measureText(txt).width + 16
      const tx = (W - tw) / 2
      ctx.fillStyle = 'rgba(180,20,0,0.9)'
      ctx.fillRect(tx, 8, tw, 20)
      ctx.strokeStyle = '#ff6600'
      ctx.lineWidth = 1
      ctx.strokeRect(tx, 8, tw, 20)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(txt, tx + 8, 22)
    }

    // ── Scanning indicator — top-left so it's not hidden behind HUD bottom text ──
    if (detections.length === 0 && modelStatus === 'ready') {
      ctx.font = '9px monospace'
      ctx.fillStyle = 'rgba(0,212,255,0.75)'
      ctx.fillText('FIRE-SCAN ACTIVE', 8, 36)
    }
  }, [detections, isEnabled, modelStatus])

  return (
    <>
      {/* Detection canvas — above the HUD overlay (zIndex > 12) */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 14,
        }}
      />

      {/* Toggle button — above everything */}
      <button
        onClick={() => setIsEnabled(e => !e)}
        style={{
          position: 'absolute',
          bottom: 6,
          right: 6,
          zIndex: 15,
          background: isEnabled ? 'rgba(180,20,0,0.88)' : 'rgba(5,10,20,0.82)',
          border: `1px solid ${isEnabled ? '#ff3300' : 'rgba(0,212,255,0.4)'}`,
          borderRadius: 3,
          color: isEnabled ? '#ffffff' : '#00d4ff',
          fontFamily: 'monospace',
          fontSize: 9,
          fontWeight: 700,
          padding: '3px 7px',
          cursor: 'pointer',
          letterSpacing: 1,
          pointerEvents: 'auto',
        }}
      >
        {isEnabled ? 'FIRE-DET: ON' : 'FIRE-DET: OFF'}
      </button>

      {/* Model status indicators — above HUD */}
      {modelStatus === 'loading' && (
        <div style={{
          position: 'absolute', bottom: 6, left: 6, zIndex: 15,
          fontFamily: 'monospace', fontSize: 9, color: '#ffaa00',
          pointerEvents: 'none',
          textShadow: '0 0 4px #ffaa00',
        }}>
          LOADING MODEL...
        </div>
      )}
      {modelStatus === 'error' && (
        <div style={{
          position: 'absolute', bottom: 6, left: 6, zIndex: 15,
          fontFamily: 'monospace', fontSize: 9, color: '#ff3b3b',
          pointerEvents: 'none',
        }}>
          MODEL LOAD FAILED
        </div>
      )}
    </>
  )
}
