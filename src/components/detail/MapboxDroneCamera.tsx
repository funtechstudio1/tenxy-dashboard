/**
 * MapboxDroneCamera — Live nadir (straight-down) satellite view from the drone's position.
 * Replaces CesiumDroneCamera using Mapbox GL JS, which is already loaded in the app.
 */

import { useRef, useEffect } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Drone, DisasterMarker } from '../../hooks/useSimulation'

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
  const detectionCanvasRef = useRef<HTMLCanvasElement>(null)

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

  // Draw tactical bounding box on canvas when drone is rescuing a disaster
  useEffect(() => {
    const map = mapRef.current
    const canvas = detectionCanvasRef.current
    if (!map || !canvas) return

    if (!drone.missionTargetId) {
      const ctx = canvas.getContext('2d')
      ctx?.clearRect(0, 0, canvas.width, canvas.height)
      return
    }

    const disaster = disasters.find(d => d.id === drone.missionTargetId)
    if (!disaster) return

    const [dLon, dLat] = normToLngLat(disaster.x, disaster.y)

    const draw = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx || !mapRef.current) return
      const W = canvas.offsetWidth
      const H = canvas.offsetHeight
      canvas.width = W
      canvas.height = H
      ctx.clearRect(0, 0, W, H)

      const pt = mapRef.current.project([dLon, dLat])
      const px = pt.x, py = pt.y
      const half = 32
      const x1 = px - half, y1 = py - half, bw = half * 2, bh = half * 2
      if (px < -half || px > W + half || py < -half || py > H + half) return

      // Red glow box
      ctx.strokeStyle = '#ff3300'
      ctx.lineWidth = 2
      ctx.shadowColor = '#ff3300'
      ctx.shadowBlur = 8
      ctx.strokeRect(x1, y1, bw, bh)
      ctx.shadowBlur = 0

      // Orange corner ticks
      const tick = 12
      ctx.strokeStyle = '#ff6600'
      ctx.lineWidth = 2
      ;[
        [[x1 + tick, y1], [x1, y1], [x1, y1 + tick]],
        [[x1 + bw - tick, y1], [x1 + bw, y1], [x1 + bw, y1 + tick]],
        [[x1, y1 + bh - tick], [x1, y1 + bh], [x1 + tick, y1 + bh]],
        [[x1 + bw, y1 + bh - tick], [x1 + bw, y1 + bh], [x1 + bw - tick, y1 + bh]],
      ].forEach(([[ax, ay], [bx, by], [cx, cy]]) => {
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.stroke()
      })

      // Label badge
      const label = `${disaster.type.toUpperCase()} DETECTED`
      ctx.font = 'bold 9px monospace'
      const lw = ctx.measureText(label).width + 8
      ctx.fillStyle = 'rgba(180,20,0,0.9)'
      ctx.fillRect(x1, y1 - 18, lw, 15)
      ctx.fillStyle = '#ffffff'
      ctx.fillText(label, x1 + 4, y1 - 6)
    }

    draw()
    map.on('render', draw)
    return () => { map.off('render', draw) }
  }, [drone.missionTargetId, disasters])

  const [droneLon, droneLat] = normToLngLat(drone.x, drone.y)

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '200px', overflow: 'hidden', borderRadius: '2px' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Disaster detection bounding box canvas overlay */}
      <canvas
        ref={detectionCanvasRef}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          pointerEvents: 'none', zIndex: 13,
        }}
      />

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
