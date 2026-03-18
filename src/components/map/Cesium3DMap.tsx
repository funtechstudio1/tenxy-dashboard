/**
 * Cesium3DMap — Full 3D tactical map using Cesium Ion (v1.139).
 * Shown when viewMode === '3D'. Mapbox stays mounted at opacity:0 behind it.
 *
 * Without an Ion token, falls back to OSM tile imagery on flat terrain.
 * With a valid Ion token, loads Cesium World Terrain for true 3D elevation.
 */

import { useRef, useEffect } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import type { Drone, Survivor, DisasterMarker, BoundaryZone } from '../../hooks/useSimulation'

const GRID_SCALE = 0.04
const FALLBACK_LON = 125.0062
const FALLBACK_LAT = 11.2435

function getCenter(cLon: number, cLat: number): [number, number] {
  return [isFinite(cLon) ? cLon : FALLBACK_LON, isFinite(cLat) ? cLat : FALLBACK_LAT]
}

function normToLngLat(x: number, y: number, cLon: number, cLat: number): [number, number] {
  return [cLon + (x - 0.5) * GRID_SCALE, cLat - (y - 0.5) * GRID_SCALE]
}

export interface Cesium3DMapHandle {
  flyToUser: (lon: number, lat: number) => void
}

interface Props {
  drones: Drone[]
  survivors: Survivor[]
  disasters: DisasterMarker[]
  boundaries: BoundaryZone[]
  selectedDroneId: string | null
  drawMode: 'fire' | 'flood' | 'boundary' | null
  centerLon: number
  centerLat: number
  userLon: number | null
  userLat: number | null
  mapHandleRef?: React.MutableRefObject<Cesium3DMapHandle | null>
  onSelectDrone: (id: string | null) => void
  onAddDisaster: (type: 'fire' | 'flood', x: number, y: number) => void
  onAddBoundaryPoint: (x: number, y: number) => void
}

export default function Cesium3DMap({
  drones, survivors, disasters, boundaries,
  selectedDroneId, drawMode,
  centerLon, centerLat, userLon, userLat,
  mapHandleRef,
  onSelectDrone, onAddDisaster, onAddBoundaryPoint,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Cesium.Viewer | null>(null)
  const droneEntities = useRef<Map<string, Cesium.Entity>>(new Map())
  const survivorEntities = useRef<Map<string, Cesium.Entity>>(new Map())
  const disasterEntities = useRef<Map<string, Cesium.Entity>>(new Map())
  const boundaryEntities = useRef<Map<string, Cesium.Entity>>(new Map())
  const helipadsRef = useRef<Cesium.Entity | null>(null)
  const userMarkerRef = useRef<Cesium.Entity | null>(null)
  const handlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null)

  // Keep latest values accessible inside Cesium click handler without re-registering
  const drawModeRef = useRef(drawMode)
  const centerRef = useRef({ lon: centerLon, lat: centerLat })
  drawModeRef.current = drawMode
  centerRef.current = { lon: centerLon, lat: centerLat }

  // ── Init Cesium viewer (once) ──────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return

    const token = sessionStorage.getItem('tenxy_cesium_token') ?? ''
    if (token) Cesium.Ion.defaultAccessToken = token

    // Build viewer options without fields that cause issues in v1.139
    const options: Cesium.Viewer.ConstructorOptions = {
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
      requestRenderMode: false,
      creditContainer: Object.assign(document.createElement('div'), { style: 'display:none' }),
    }

    // Without an Ion token, load OSM tiles (Cesium's default Bing/Ion imagery needs a token)
    if (!token) {
      options.baseLayer = Cesium.ImageryLayer.fromProviderAsync(
        Promise.resolve(
          new Cesium.UrlTemplateImageryProvider({
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            credit: '© OpenStreetMap contributors',
            maximumLevel: 19,
          })
        )
      )
    }

    let viewer: Cesium.Viewer
    try {
      viewer = new Cesium.Viewer(containerRef.current!, options)
    } catch (err) {
      console.error('Cesium3DMap: viewer init failed', err)
      return
    }

    viewerRef.current = viewer

    // Load World Terrain when Ion token available; silently ignore failure
    if (token) {
      Cesium.createWorldTerrainAsync({ requestWaterMask: false, requestVertexNormals: false })
        .then(tp => { if (!viewer.isDestroyed()) viewer.terrainProvider = tp })
        .catch(() => {/* no terrain without valid token */})
    }

    // Minimal dark atmosphere
    if (viewer.scene.fog) {
      viewer.scene.fog.enabled = true
      viewer.scene.fog.density = 0.0001
    }

    // Initial camera position — 45° tactical angle
    const [cLon, cLat] = getCenter(centerLon, centerLat)
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(cLon, cLat, 1200),
      orientation: {
        heading: Cesium.Math.toRadians(-15),
        pitch: Cesium.Math.toRadians(-40),
        roll: 0,
      },
    })

    // Helipad billboard — large, always-on-top
    helipadsRef.current = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(cLon, cLat, 2),
      billboard: {
        image: '/tenxy-dashboard/helipad.png',
        width: 140,
        height: 140,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scale: 1.0,
      },
    })

    // Click handler
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
    handlerRef.current = handler

    handler.setInputAction((evt: { position: Cesium.Cartesian2 }) => {
      const dm = drawModeRef.current
      const { lon: cL, lat: cA } = centerRef.current

      if (dm === 'fire' || dm === 'flood' || dm === 'boundary') {
        const ray = viewer.camera.getPickRay(evt.position)
        if (!ray) return
        const cartesian = viewer.scene.globe.pick(ray, viewer.scene)
        if (!cartesian) return
        const carto = Cesium.Cartographic.fromCartesian(cartesian)
        const lon = Cesium.Math.toDegrees(carto.longitude)
        const lat = Cesium.Math.toDegrees(carto.latitude)
        const nx = (lon - cL) / GRID_SCALE + 0.5
        const ny = -(lat - cA) / GRID_SCALE + 0.5
        if (dm === 'fire' || dm === 'flood') {
          onAddDisaster(dm, nx, ny)
        } else {
          onAddBoundaryPoint(nx, ny)
        }
        return
      }

      // Pick entity
      const picked = viewer.scene.pick(evt.position)
      if (Cesium.defined(picked) && picked.id) {
        const droneId = (picked.id as any)._droneId as string | undefined
        if (droneId) { onSelectDrone(droneId); return }
      }
      onSelectDrone(null)
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

    // Expose flyTo handle
    if (mapHandleRef) {
      mapHandleRef.current = {
        flyToUser: (lon, lat) => {
          if (viewer && !viewer.isDestroyed()) {
            viewer.camera.flyTo({
              destination: Cesium.Cartesian3.fromDegrees(lon, lat, 800),
              orientation: { heading: Cesium.Math.toRadians(-15), pitch: Cesium.Math.toRadians(-40), roll: 0 },
              duration: 1.5,
            })
          }
        },
      }
    }

    return () => {
      handler.destroy()
      droneEntities.current.clear()
      survivorEntities.current.clear()
      disasterEntities.current.clear()
      boundaryEntities.current.clear()
      if (mapHandleRef) mapHandleRef.current = null
      if (viewer && !viewer.isDestroyed()) viewer.destroy()
      viewerRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fly to user location when geolocation resolves ───────────────────────
  useEffect(() => {
    const v = viewerRef.current
    if (!v || v.isDestroyed() || userLon === null || userLat === null) return
    v.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(userLon, userLat, 1200),
      orientation: { heading: Cesium.Math.toRadians(-15), pitch: Cesium.Math.toRadians(-40), roll: 0 },
      duration: 1.5,
    })
  }, [userLon, userLat])

  // ── User location marker ─────────────────────────────────────────────────
  useEffect(() => {
    const v = viewerRef.current
    if (!v || v.isDestroyed() || userLon === null || userLat === null) return
    if (userMarkerRef.current) v.entities.remove(userMarkerRef.current)
    userMarkerRef.current = v.entities.add({
      position: Cesium.Cartesian3.fromDegrees(userLon, userLat, 0),
      point: {
        pixelSize: 14,
        color: Cesium.Color.fromCssColorString('#00d4ff'),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: 'YOU',
        font: 'bold 10px monospace',
        fillColor: Cesium.Color.fromCssColorString('#00d4ff'),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.TOP,
        pixelOffset: new Cesium.Cartesian2(0, 6),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
  }, [userLon, userLat])

  // ── Drone billboards ──────────────────────────────────────────────────────
  useEffect(() => {
    const v = viewerRef.current
    if (!v || v.isDestroyed()) return
    const [cLon, cLat] = getCenter(centerLon, centerLat)
    const existing = droneEntities.current

    drones.forEach(drone => {
      const [lon, lat] = normToLngLat(drone.x, drone.y, cLon, cLat)
      const alt = Math.max(5, drone.altitude || 150)
      const isSelected = drone.id === selectedDroneId
      const isLow = drone.battery < 20
      const color = isLow ? Cesium.Color.RED : isSelected ? Cesium.Color.YELLOW : Cesium.Color.fromCssColorString('#00d4ff')

      if (!existing.has(drone.id)) {
        const ent = v.entities.add({
          billboard: {
            image: '/tenxy-dashboard/camera-drone.png',
            width: 36, height: 36, color,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(300, 1.6, 3000, 0.5),
          },
          label: {
            text: drone.id,
            font: '9px monospace',
            fillColor: color,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.TOP,
            pixelOffset: new Cesium.Cartesian2(0, 4),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        })
        ;(ent as any)._droneId = drone.id
        existing.set(drone.id, ent)
      }

      const ent = existing.get(drone.id)!
      ent.position = new Cesium.ConstantPositionProperty(Cesium.Cartesian3.fromDegrees(lon, lat, alt))
      if (ent.billboard) {
        ;(ent.billboard.color as Cesium.ConstantProperty).setValue(color)
        ;(ent.billboard.width as Cesium.ConstantProperty).setValue(isSelected ? 52 : 36)
        ;(ent.billboard.height as Cesium.ConstantProperty).setValue(isSelected ? 52 : 36)
      }
      if (ent.label) {
        ;(ent.label.fillColor as Cesium.ConstantProperty).setValue(color)
      }
    })

    existing.forEach((ent, id) => {
      if (!drones.find(d => d.id === id)) { v.entities.remove(ent); existing.delete(id) }
    })
  }, [drones, selectedDroneId, centerLon, centerLat])

  // ── Disaster GIF billboards ───────────────────────────────────────────────
  useEffect(() => {
    const v = viewerRef.current
    if (!v || v.isDestroyed()) return
    const [cLon, cLat] = getCenter(centerLon, centerLat)
    const existing = disasterEntities.current

    disasters.forEach(d => {
      if (existing.has(d.id)) return
      const [dLon, dLat] = normToLngLat(d.x, d.y, cLon, cLat)
      const ent = v.entities.add({
        position: Cesium.Cartesian3.fromDegrees(dLon, dLat, 0),
        billboard: {
          image: `/tenxy-dashboard/${d.type}.gif`,
          width: 72, height: 72,
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
          pixelOffset: new Cesium.Cartesian2(0, 6),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })
      existing.set(d.id, ent)
    })

    existing.forEach((ent, id) => {
      if (!disasters.find(d => d.id === id)) { v.entities.remove(ent); existing.delete(id) }
    })
  }, [disasters, centerLon, centerLat])

  // ── Survivor points ───────────────────────────────────────────────────────
  useEffect(() => {
    const v = viewerRef.current
    if (!v || v.isDestroyed()) return
    const [cLon, cLat] = getCenter(centerLon, centerLat)
    const existing = survivorEntities.current

    survivors.forEach(s => {
      if (existing.has(s.id)) return
      const [sLon, sLat] = normToLngLat(s.x, s.y, cLon, cLat)
      const ent = v.entities.add({
        position: Cesium.Cartesian3.fromDegrees(sLon, sLat, 0),
        point: {
          pixelSize: 10,
          color: Cesium.Color.fromCssColorString('#ff4d00'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: s.id,
          font: '9px monospace',
          fillColor: Cesium.Color.fromCssColorString('#ff6622'),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.TOP,
          pixelOffset: new Cesium.Cartesian2(0, 4),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })
      existing.set(s.id, ent)
    })

    existing.forEach((ent, id) => {
      if (!survivors.find(s => s.id === id)) { v.entities.remove(ent); existing.delete(id) }
    })
  }, [survivors, centerLon, centerLat])

  // ── Boundary zone polygons ────────────────────────────────────────────────
  useEffect(() => {
    const v = viewerRef.current
    if (!v || v.isDestroyed()) return
    const [cLon, cLat] = getCenter(centerLon, centerLat)
    const existing = boundaryEntities.current
    existing.forEach(ent => v.entities.remove(ent))
    existing.clear()

    boundaries.forEach(bz => {
      if (bz.points.length < 3) return
      const positions = bz.points.map(p => {
        const [lon, lat] = normToLngLat(p.x, p.y, cLon, cLat)
        return Cesium.Cartesian3.fromDegrees(lon, lat, 0)
      })
      const centLon = bz.points.reduce((s, p) => s + normToLngLat(p.x, p.y, cLon, cLat)[0], 0) / bz.points.length
      const centLat = bz.points.reduce((s, p) => s + normToLngLat(p.x, p.y, cLon, cLat)[1], 0) / bz.points.length

      const ent = v.entities.add({
        position: Cesium.Cartesian3.fromDegrees(centLon, centLat, 15),
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(positions),
          material: Cesium.Color.fromCssColorString('rgba(255,170,0,0.15)'),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#ffaa00'),
          outlineWidth: 2,
          height: 0,
        },
        label: {
          text: bz.instruction.length > 32 ? bz.instruction.slice(0, 32) + '…' : bz.instruction,
          font: '10px monospace',
          fillColor: Cesium.Color.fromCssColorString('#ffcc44'),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })
      existing.set(bz.id, ent)
    })
  }, [boundaries, centerLon, centerLat])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#050a14' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {/* Crosshair cursor hint during draw mode — pointer-events:none so Cesium handles clicks */}
      {drawMode && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 5,
          cursor: drawMode === 'boundary' ? 'cell' : 'crosshair',
          pointerEvents: 'none',
        }} />
      )}
      {/* Tactical HUD strip */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 20,
        background: 'linear-gradient(to top, rgba(5,10,20,0.8), transparent)',
        display: 'flex', alignItems: 'flex-end', paddingBottom: 3, paddingLeft: 10,
        pointerEvents: 'none', zIndex: 5,
        fontFamily: 'monospace', fontSize: 8, color: 'rgba(0,212,255,0.6)',
        letterSpacing: 1,
      }}>
        CESIUM ION · 3D TERRAIN · SWARM TACTICAL VIEW
      </div>
    </div>
  )
}
