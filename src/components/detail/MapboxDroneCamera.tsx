/**
 * MapboxDroneCamera — Live nadir (straight-down) satellite view from the drone's position.
 * Replaces CesiumDroneCamera using Mapbox GL JS, which is already loaded in the app.
 *
 * Includes FireDetectionOverlay: captures the WebGL canvas frame every 500ms and runs
 * YOLO11 fire detection via ONNX Runtime Web (WebAssembly).
 */

import { useRef, useEffect } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Drone, DisasterMarker } from '../../hooks/useSimulation'
import FireDetectionOverlay, { type CameraHandle } from '../detection/FireDetectionOverlay'

const FALLBACK_CENTER_LON = 125.0062
const FALLBACK_CENTER_LAT = 11.2435
const GRID_SCALE = 0.04

function getCenterCoords(): [number, number] {
  const lat = parseFloat(sessionStorage.getItem('tenxy_center_lat') || '')
  const lon = parseFloat(sessionStorage.getItem('tenxy_center_lon') || '')
  return [
    isFinite(lon) ? lon : FALLBACK_CENTER_LON,
    isFinite(lat) ? lat : FALLBACK_CENTER_LAT,
  ]
}

function normToLngLat(x: number, y: number): [number, number] {
  const [cLon, cLat] = getCenterCoords()
  return [cLon + (x - 0.5) * GRID_SCALE, cLat - (y - 0.5) * GRID_SCALE]
}

interface Props {
  drone: Drone
  disasters?: DisasterMarker[]
}

export default function MapboxDroneCamera({ drone, disasters = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())

  // Internal handle for FireDetectionOverlay — provides WebGL canvas frame capture
  const cameraHandleRef = useRef<CameraHandle>({
    getFrame(): ImageData | null {
      const map = mapRef.current
      if (!map) return null
      const glCanvas = map.getCanvas()
      if (!glCanvas) return null
      try {
        // Mapbox canvas is WebGL — must copy via an intermediate 2D canvas.
        // preserveDrawingBuffer: true keeps the last frame in the WebGL buffer.
        // Pre-downsample to ≤640px to reduce NCHW conversion cost in fireDetection.ts.
        const scale = Math.min(640 / glCanvas.width, 640 / glCanvas.height, 1)
        const tw = Math.round(glCanvas.width * scale)
        const th = Math.round(glCanvas.height * scale)
        const tmp = document.createElement('canvas')
        tmp.width = tw
        tmp.height = th
        const ctx = tmp.getContext('2d')!
        ctx.drawImage(glCanvas, 0, 0, tw, th)
        return ctx.getImageData(0, 0, tw, th)
      } catch {
        return null
      }
    },
  })

  // Initialise Mapbox map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const token = sessionStorage.getItem('tenxy_mapbox_token') ?? ''
    if (token) mapboxgl.accessToken = token

    const [initLon, initLat] = normToLngLat(drone.x, drone.y)

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/satellite-v9',
      center: [initLon, initLat],
      zoom: 17,
      pitch: 0,
      bearing: 0,
      interactive: false,
      attributionControl: false,
      preserveDrawingBuffer: true,  // required for canvas frame capture by FireDetectionOverlay
    })

    mapRef.current = map

    return () => {
      markersRef.current.forEach(m => m.remove())
      markersRef.current.clear()
      map.remove()
      mapRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fly to drone position when it moves
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const [lon, lat] = normToLngLat(drone.x, drone.y)
    if (!isFinite(lon) || !isFinite(lat)) return
    map.setCenter([lon, lat])
  }, [drone.x, drone.y])

  // Sync disaster markers
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const existing = markersRef.current

    // Add new ones
    disasters.forEach(d => {
      if (existing.has(d.id)) return
      const [dLon, dLat] = normToLngLat(d.x, d.y)
      if (!isFinite(dLon) || !isFinite(dLat)) return
      const el = document.createElement('div')
      el.style.cssText = 'width:56px;height:56px;pointer-events:none'
      const img = document.createElement('img')
      img.src = `${import.meta.env.BASE_URL}${d.type}.gif`
      img.style.cssText = 'width:100%;height:100%;object-fit:contain'
      el.appendChild(img)
      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat([dLon, dLat]).addTo(map)
      existing.set(d.id, marker)
    })

    // Remove stale ones
    existing.forEach((marker, id) => {
      if (!disasters.find(d => d.id === id)) {
        marker.remove()
        existing.delete(id)
      }
    })
  }, [disasters])

  const [droneLon, droneLat] = normToLngLat(drone.x, drone.y)

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '200px', overflow: 'hidden', borderRadius: '2px' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Fire detection canvas overlay + toggle button */}
      <FireDetectionOverlay cameraRef={cameraHandleRef} />

      {/* Tactical HUD overlay — sits above detection canvas */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        border: '1px solid rgba(0,212,255,0.3)',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: '6px 8px',
        fontFamily: 'monospace', fontSize: '9px', color: '#00d4ff',
        textShadow: '0 0 4px #00d4ff',
        zIndex: 12,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>NADIR CAM: {drone.name}</span>
          <span>ALT: {drone.altitude.toFixed(0)}m</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{drone.status}</span>
          <span>{isFinite(droneLat) ? droneLat.toFixed(4) : '—'}°N {isFinite(droneLon) ? droneLon.toFixed(4) : '—'}°E</span>
        </div>
      </div>
    </div>
  )
}
