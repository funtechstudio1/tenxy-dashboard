/**
 * CesiumDroneCamera — Live nadir (straight-down) satellite view from the drone's position.
 *
 * - Disaster markers (fire/flood) placed by the operator are rendered as
 *   Cesium billboard entities so they appear in the correct geographic
 *   position within the live feed.
 * - Coordinates: normalized 0–1 relative to mission center (read from
 *   sessionStorage so it matches DisasterZoneMap exactly).
 *
 * Includes FireDetectionOverlay: captures the Cesium WebGL canvas frame every 500ms
 * and runs YOLO11 fire detection via ONNX Runtime Web (WebAssembly).
 * requestRenderMode is disabled so the WebGL buffer always holds the current frame.
 */

import { useRef, useEffect } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import type { Drone, DisasterMarker } from '../../hooks/useSimulation'
import FireDetectionOverlay, { type CameraHandle } from '../detection/FireDetectionOverlay'

const FALLBACK_CENTER_LON = 125.0062
const FALLBACK_CENTER_LAT = 11.2435
const GRID_SCALE = 0.04
const CAMERA_HEIGHT_M = 120

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

export default function CesiumDroneCamera({ drone, disasters = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  // Map disasterId → Cesium entity so we can remove stale ones
  const disasterEntities = useRef<Map<string, Cesium.Entity>>(new Map())

  // Internal handle for FireDetectionOverlay — captures Cesium WebGL canvas frame
  const cameraHandleRef = useRef<CameraHandle>({
    getFrame(): ImageData | null {
      const container = containerRef.current
      if (!container) return null
      const glCanvas = container.querySelector('canvas') as HTMLCanvasElement | null
      if (!glCanvas) return null
      try {
        // Cesium canvas is WebGL — copy via intermediate 2D canvas.
        // Pre-downsample to ≤640px to reduce inference overhead.
        const scale = Math.min(640 / glCanvas.width, 640 / glCanvas.height, 1)
        const tw = Math.round(glCanvas.width * scale)
        const th = Math.round(glCanvas.height * scale)
        const tmp = document.createElement('canvas')
        tmp.width = tw
        tmp.height = th
        tmp.getContext('2d')!.drawImage(glCanvas, 0, 0, tw, th)
        return tmp.getContext('2d')!.getImageData(0, 0, tw, th)
      } catch {
        return null
      }
    },
  })

  // Initialise Cesium viewer once
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return

    const token = sessionStorage.getItem('tenxy_cesium_token') ?? ''
    if (token) Cesium.Ion.defaultAccessToken = token

    const baseLayer = token
      ? undefined
      : Cesium.ImageryLayer.fromProviderAsync(
          Promise.resolve(
            new Cesium.UrlTemplateImageryProvider({
              url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              credit: '© OpenStreetMap contributors',
              maximumLevel: 19,
            })
          )
        )

    const viewer = new Cesium.Viewer(containerRef.current, {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      navigationHelpButton: false,
      // requestRenderMode: true — only renders when explicitly requested.
      // A 10fps interval below keeps the canvas fresh for frame capture
      // while avoiding continuous full-rate GPU rendering.
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
      creditContainer: Object.assign(document.createElement('div'), { style: 'display:none' }),
      ...(baseLayer ? { baseLayer } : {}),
    })

    viewer.scene.screenSpaceCameraController.enableRotate = false
    viewer.scene.screenSpaceCameraController.enableTranslate = false
    viewer.scene.screenSpaceCameraController.enableZoom = false
    viewer.scene.screenSpaceCameraController.enableTilt = false
    viewer.scene.screenSpaceCameraController.enableLook = false

    viewerRef.current = viewer

    // Render at 10fps — keeps the WebGL canvas fresh for frame capture
    // without continuous full-rate GPU usage
    const renderInterval = setInterval(() => {
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.scene.requestRender()
      }
    }, 100)

    return () => {
      clearInterval(renderInterval)
      disasterEntities.current.clear()
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy()
        viewerRef.current = null
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Move camera when drone position changes
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return

    const [lon, lat] = normToLngLat(drone.x, drone.y)
    if (!isFinite(lon) || !isFinite(lat)) return

    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, CAMERA_HEIGHT_M),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-90),
        roll: 0,
      },
    })
  }, [drone.x, drone.y])

  // Sync disaster billboard entities whenever the disasters list changes
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || viewer.isDestroyed()) return

    const existing = disasterEntities.current

    // Add new disasters
    disasters.forEach(d => {
      if (existing.has(d.id)) return
      const [dLon, dLat] = normToLngLat(d.x, d.y)
      if (!isFinite(dLon) || !isFinite(dLat)) return

      const entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(dLon, dLat, 0),
        billboard: {
          image: `/tenxy-dashboard/${d.type}.gif`,
          width: 64,
          height: 64,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: d.type.toUpperCase(),
          font: '10px monospace',
          fillColor: d.type === 'fire' ? Cesium.Color.ORANGE : Cesium.Color.AQUA,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.TOP,
          pixelOffset: new Cesium.Cartesian2(0, 4),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })
      existing.set(d.id, entity)
    })

    // Remove stale disasters
    existing.forEach((entity, id) => {
      if (!disasters.find(d => d.id === id)) {
        viewer.entities.remove(entity)
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
