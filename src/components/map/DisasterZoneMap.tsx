import { useRef, useEffect, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Drone, Survivor, Sector, DisasterMarker, BoundaryZone } from '../../hooks/useSimulation'
import styles from './DisasterZoneMap.module.css'
import MapboxDroneCamera from '../detail/MapboxDroneCamera'

// Sweep path colors per drone index (cyan, green, amber, purple)
const SWEEP_COLORS = ['#00d4ff', '#00ff88', '#ffaa00', '#cc88ff']

// Coordinates for Tacloban, Philippines (Typhoon Haiyan SAR Zone) - DEFAULT
const DEFAULT_CENTER_LON = 125.0062
const DEFAULT_CENTER_LAT = 11.2435
const GRID_SCALE = 0.04 // Approx 4.5km across

interface DisasterZoneMapProps {
  drones: Drone[]
  survivors: Survivor[]
  sectors: Sector[]
  disasters: DisasterMarker[]
  boundaries: BoundaryZone[]
  selectedDroneId: string | null
  onSelectDrone: (id: string | null) => void
  onSetTarget: (id: string, x: number, y: number) => void
  onRecallDrones: (droneIds: string[], targetX: number, targetY: number) => void
  onSendMission: (droneIds: string[], targetX: number, targetY: number) => void
  onAddDisaster: (type: 'fire' | 'flood', x: number, y: number) => void
  onAddBoundary: (points: { x: number; y: number }[], instruction: string) => void
}


export default function DisasterZoneMap({
  drones,
  survivors,
  sectors,
  disasters,
  boundaries,
  selectedDroneId,
  onSelectDrone,
  onSetTarget,
  onRecallDrones,
  onSendMission,
  onAddDisaster,
  onAddBoundary
}: DisasterZoneMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const mapLoadedRef = useRef(false)
  const mapInstanceIdRef = useRef(0)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [viewMode, setViewMode] = useState<'2D' | '3D'>('2D')
  const [waypointMode, setWaypointMode] = useState(false)
  const [centerLon, setCenterLon] = useState<number>(() => {
    const v = parseFloat(sessionStorage.getItem('tenxy_center_lon') ?? '')
    return isNaN(v) ? DEFAULT_CENTER_LON : v
  })
  const [centerLat, setCenterLat] = useState<number>(() => {
    const v = parseFloat(sessionStorage.getItem('tenxy_center_lat') ?? '')
    return isNaN(v) ? DEFAULT_CENTER_LAT : v
  })
  const [userLon, setUserLon] = useState<number | null>(() => {
    const v = parseFloat(sessionStorage.getItem('tenxy_user_lon') ?? '')
    return isNaN(v) ? null : v
  })
  const [userLat, setUserLat] = useState<number | null>(() => {
    const v = parseFloat(sessionStorage.getItem('tenxy_user_lat') ?? '')
    return isNaN(v) ? null : v
  })
  const [locating, setLocating] = useState(false)
  const [missionPanel, setMissionPanel] = useState<'recall' | 'send' | null>(null)
  const [selectedForOp, setSelectedForOp] = useState<Set<string>>(new Set())
  const [drawMode, setDrawMode] = useState<'fire' | 'flood' | 'boundary' | null>(null)
  const [boundaryPoints, setBoundaryPoints] = useState<{ x: number; y: number }[]>([])
  const [boundaryInstruction, setBoundaryInstruction] = useState('')
  const [showBoundaryInput, setShowBoundaryInput] = useState(false)
  // Zone sweep completion toast notifications
  const [toastNotifications, setToastNotifications] = useState<{ id: string; text: string }[]>([])
  const prevZoneDroneCountsRef = useRef<Record<string, number>>({})
  // Draggable zone assignment popup
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 })
  const [popupDragging, setPopupDragging] = useState(false)
  const popupDragStart = useRef({ mouseX: 0, mouseY: 0, panelX: 0, panelY: 0 })
  const [dronePopup, setDronePopup] = useState<{ drone: Drone; px: number; py: number } | null>(null)
  const [selectedZone, setSelectedZone] = useState<{ zone: typeof boundaries[0]; px: number; py: number } | null>(null)
  const [windowOffset, setWindowOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const windowRef = useRef<HTMLDivElement>(null)
  const userMarkerRef = useRef<mapboxgl.Marker | null>(null)
  const dronesMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const droneMarkerElsRef = useRef<Map<string, { img: HTMLImageElement; label: HTMLDivElement }>>(new Map())
  const disasterMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const drawModeRef = useRef<'fire' | 'flood' | 'boundary' | null>(null)
  const boundaryPointsRef = useRef<{ x: number; y: number }[]>([])
  const waypointModeRef = useRef(false)
  const dronesStateRef = useRef<Drone[]>(drones)
  const selectedDroneIdRef = useRef<string | null>(selectedDroneId)
  const viewModeRef = useRef<'2D' | '3D'>('3D')
  const centerLonRef = useRef<number>((() => {
    const v = parseFloat(sessionStorage.getItem('tenxy_center_lon') ?? '')
    return isNaN(v) ? DEFAULT_CENTER_LON : v
  })())
  const centerLatRef = useRef<number>((() => {
    const v = parseFloat(sessionStorage.getItem('tenxy_center_lat') ?? '')
    return isNaN(v) ? DEFAULT_CENTER_LAT : v
  })())
  const lastGeoJSONUpdate = useRef(0)
  // Geolocation detection — set mission center ONCE before drones move, never again
  const centerSetRef = useRef(false)
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords
          setUserLat(latitude)
          setUserLon(longitude)
          sessionStorage.setItem('tenxy_user_lat', latitude.toString())
          sessionStorage.setItem('tenxy_user_lon', longitude.toString())

          // Only shift the mission grid center ONCE (before trails accumulate)
          if (!centerSetRef.current) {
            centerSetRef.current = true
            setCenterLat(latitude)
            setCenterLon(longitude)
            centerLatRef.current = latitude
            centerLonRef.current = longitude
            sessionStorage.setItem('tenxy_center_lat', latitude.toString())
            sessionStorage.setItem('tenxy_center_lon', longitude.toString())
          }
          // Fly map to user location only if map is loaded
          if (mapRef.current && mapLoadedRef.current) {
            mapRef.current.flyTo({ center: [longitude, latitude], zoom: 15, duration: 1500 })
          }
        },
        () => {
          // Geolocation unavailable — default Tacloban coordinates used
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      )
    }
  }, [])

  // Handle window dragging
  const handleHeaderMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX - windowOffset.x, y: e.clientY - windowOffset.y })
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return
      setWindowOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, dragStart])

  // Popup drag handlers
  const handlePopupHeaderMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setPopupDragging(true)
    popupDragStart.current = { mouseX: e.clientX, mouseY: e.clientY, panelX: popupPos.x, panelY: popupPos.y }
  }

  useEffect(() => {
    if (!popupDragging) return
    const onMove = (e: MouseEvent) => {
      setPopupPos({
        x: popupDragStart.current.panelX + (e.clientX - popupDragStart.current.mouseX),
        y: popupDragStart.current.panelY + (e.clientY - popupDragStart.current.mouseY),
      })
    }
    const onUp = () => setPopupDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [popupDragging])

  // Reset popup position when it opens (center of viewport)
  useEffect(() => {
    if (showBoundaryInput) {
      setPopupPos({ x: window.innerWidth / 2 - 150, y: window.innerHeight / 2 - 130 })
    }
  }, [showBoundaryInput])

  // Sync refs for the high-frequency render loop
  useEffect(() => {
    dronesStateRef.current = drones
    selectedDroneIdRef.current = selectedDroneId
    viewModeRef.current = viewMode
    waypointModeRef.current = waypointMode
    centerLonRef.current = centerLon
    centerLatRef.current = centerLat
    drawModeRef.current = drawMode
    boundaryPointsRef.current = boundaryPoints
  }, [drones, selectedDroneId, viewMode, waypointMode, centerLon, centerLat, drawMode, boundaryPoints])

  // In draw mode, disable ALL map interactions so the overlay div captures clicks cleanly
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const map = mapRef.current
    if (drawMode) {
      map.dragPan.disable()
      map.dragRotate.disable()
      map.touchZoomRotate.disable()
      map.scrollZoom.disable()
      map.boxZoom.disable()
      map.doubleClickZoom.disable()
    } else {
      map.dragPan.enable()
      map.dragRotate.enable()
      map.touchZoomRotate.enable()
      map.scrollZoom.enable()
      map.boxZoom.enable()
      map.doubleClickZoom.enable()
      map.getCanvas().style.cursor = ''
    }
  }, [drawMode, mapLoaded])

  // Initialize Mapbox
  useEffect(() => {
    const FALLBACK_MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string
    const token = sessionStorage.getItem('tenxy_mapbox_token') || FALLBACK_MAPBOX_TOKEN
    if (!mapContainerRef.current) return
    const instanceId = ++mapInstanceIdRef.current

    // Persist token so other components can read it
    if (!sessionStorage.getItem('tenxy_mapbox_token')) {
      sessionStorage.setItem('tenxy_mapbox_token', FALLBACK_MAPBOX_TOKEN)
    }

    mapboxgl.accessToken = token

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      // satellite-streets-v12 works better with GL v3 terrain (v9 can cause tile seams)
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [centerLonRef.current, centerLatRef.current],
      zoom: 14,
      pitch: 45,      // 45° avoids tile-slab artifacts caused by steep pitch + terrain
      bearing: -15,
      antialias: true,
      attributionControl: false
    })

    map.on('load', () => {
      // Guard: if a newer map instance was created (StrictMode remount), bail out
      if (instanceId !== mapInstanceIdRef.current) return

      // 1. Terrain Elevation — maxzoom 14 prevents tile-gap artifacts at steep pitch
      map.addSource('mapbox-dem', {
        type: 'raster-dem',
        url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
        tileSize: 512,
        maxzoom: 14
      })

      if (viewMode === '3D') {
        // exaggeration 1.0 keeps terrain real-scale; higher values cause floating tile slabs
        map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.0 })
      }

      // Fog fills the gaps between terrain tiles — prevents black bands at horizon
      map.setFog({
        color: 'rgba(10,15,25,0.8)',
        'high-color': 'rgba(0,40,80,0.6)',
        'horizon-blend': 0.1,
        'space-color': 'rgb(5,10,20)',
        'star-intensity': 0.4
      })

      // 2. Atmospheric Sky
      map.addLayer({
        id: 'sky',
        type: 'sky',
        paint: {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [0.0, 60.0],
          'sky-atmosphere-sun-intensity': 12
        }
      })

      // 3. SAR Sectors & Survivors
      map.addSource('sectors', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'sectors-fill', type: 'fill', source: 'sectors', paint: { 'fill-color': '#00d4ff', 'fill-opacity': ['get', 'opacity'] } })

      map.addSource('survivors', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'survivor-glow', type: 'circle', source: 'survivors', paint: { 'circle-radius': 15, 'circle-color': '#ff4d00', 'circle-opacity': 0.6, 'circle-blur': 1 } })

      // 3b. Selected Drone Highlight Area
      map.addSource('selected-drone-area', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'selected-drone-area',
        type: 'circle',
        source: 'selected-drone-area',
        paint: {
          // Scale with zoom so the circle always represents the real detection radius (~352m).
          // Formula: meters_per_px = cos(lat) × 40,075,017 / (2^Z × 256)
          // zoom 12 ≈ 9px, zoom 14 ≈ 37px, zoom 16 ≈ 150px — all equal to ~352m on screen.
          'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 12, 9, 16, 150],
          'circle-color': 'rgba(255, 255, 0, 0.12)',
          'circle-stroke-color': '#ffff00',
          'circle-stroke-width': 2
        }
      })

      // 3c. Drone Flight Trail Lines (yellow, 50% opacity)
      map.addSource('drone-trails', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'drone-trails',
        type: 'line',
        source: 'drone-trails',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffff00', 'line-opacity': 0.5, 'line-width': 2 }
      })

      // 3d. Planned Route Lines (dashed cyan, shown during recall/mission)
      map.addSource('planned-routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'planned-routes',
        type: 'line',
        source: 'planned-routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#00d4ff', 'line-opacity': 0.8, 'line-width': 2, 'line-dasharray': [4, 3] }
      })

      // 3e. Boundary zones (drawn polygons)
      map.addSource('boundary-zones', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'boundary-fill', type: 'fill', source: 'boundary-zones', paint: { 'fill-color': '#ffaa00', 'fill-opacity': 0.15 } })
      map.addLayer({ id: 'boundary-line', type: 'line', source: 'boundary-zones', paint: { 'line-color': '#ffaa00', 'line-width': 2, 'line-dasharray': [3, 2] } })
      // Hover highlight layer for boundary zones
      map.addLayer({ id: 'boundary-hover', type: 'fill', source: 'boundary-zones', paint: { 'fill-color': '#ffcc44', 'fill-opacity': 0 } })

      // 3f. In-progress boundary drawing line
      map.addSource('boundary-drawing', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'boundary-drawing', type: 'line', source: 'boundary-drawing', paint: { 'line-color': '#ffdd00', 'line-width': 2, 'line-opacity': 0.9 } })

      // 3g. Pre-computed lawnmower sweep paths (shown as soon as zone is committed)
      map.addSource('zone-sweep-paths', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'zone-sweep-paths',
        type: 'line',
        source: 'zone-sweep-paths',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['match', ['get', 'droneIdx'], 0, '#00d4ff', 1, '#00ff88', 2, '#ffaa00', '#cc88ff'],
          'line-width': 1,
          'line-opacity': 0.55,
          'line-dasharray': [2, 4],
        }
      })

      // 4. Drone Tracking Layer (Hitbox & 2D)
      // (drone icon replaced with circle layer — no image load needed)

      // Load helipad.png as the 2D map icon (falls back to canvas "H" if missing)
      const addHelipads = () => {
        map.addSource('helipad-location', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [centerLonRef.current, centerLatRef.current] } }]
          }
        })
        // Helipad 2D symbol — added here (after source) so it renders on top in 2D top-down mode
        map.addLayer({
          id: 'helipad-2d',
          type: 'symbol',
          source: 'helipad-location',
          layout: {
            'icon-image': 'helipad-icon',
            // Zoom-interpolated size (exponential base-2) keeps the helipad
            // covering a constant geographic footprint (~300 m diameter).
            // Each zoom step halves the icon-size to compensate for pixel doubling.
            'icon-size': ['interpolate', ['exponential', 2], ['zoom'], 12, 80.0, 14, 20.0, 15, 10.0, 16, 5.0, 17, 2.4, 18, 1.2],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'visibility': 'visible'
          }
        })
      }

      map.loadImage('/tenxy-dashboard/helipad.png', (error, image) => {
        // Always render onto a 512×512 canvas so the base image is
        // large enough to look sharp at any zoom level.
        const sz = 512
        const hCanvas = document.createElement('canvas')
        hCanvas.width = sz; hCanvas.height = sz
        const hCtx = hCanvas.getContext('2d')!
        if (!error && image) {
          hCtx.drawImage(image as HTMLImageElement, 0, 0, sz, sz)
        } else {
          // Fallback: draw a green circle with white H
          hCtx.fillStyle = '#1a4a2a'
          hCtx.beginPath(); hCtx.arc(sz/2, sz/2, sz/2 - 2, 0, Math.PI * 2); hCtx.fill()
          hCtx.strokeStyle = '#ffffff'; hCtx.lineWidth = 10
          hCtx.beginPath(); hCtx.arc(sz/2, sz/2, sz/2 - 8, 0, Math.PI * 2); hCtx.stroke()
          hCtx.strokeStyle = '#00d4ff'; hCtx.lineWidth = 6
          hCtx.beginPath(); hCtx.arc(sz/2, sz/2, sz/2 - 30, 0, Math.PI * 2); hCtx.stroke()
          hCtx.fillStyle = '#ffffff'
          hCtx.font = `bold ${Math.round(sz * 0.55)}px monospace`
          hCtx.textAlign = 'center'; hCtx.textBaseline = 'middle'
          hCtx.fillText('H', sz/2, sz/2 + 4)
        }
        map.addImage('helipad-icon', hCanvas as any)
        addHelipads()
        // Drone layers must always render above helipad, zones, and sectors.
        // Helipad is added asynchronously so we re-push drone layers to the top of the stack.
        // (drone-fleet-2d / drone-labels-2d removed — drones now rendered as HTML markers)
        if (map.getLayer('drone-hitbox')) map.moveLayer('drone-hitbox')
      })

      map.addSource('drones-data', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

      // Invisible Hitbox Layer — kept for queryRenderedFeatures click detection fallback
      map.addLayer({
        id: 'drone-hitbox',
        type: 'circle',
        source: 'drones-data',
        paint: {
          'circle-radius': 20,
          'circle-color': 'transparent',
          'circle-stroke-width': 0
        }
      })

      // Clear any stale markers from a previous map instance
      dronesMarkersRef.current.forEach(m => m.remove())
      dronesMarkersRef.current.clear()
      droneMarkerElsRef.current.clear()
      if (userMarkerRef.current) { userMarkerRef.current.remove(); userMarkerRef.current = null }

      mapRef.current = map
      setMapLoaded(true)
      mapLoadedRef.current = true

      // 30fps repaint loop keeps animated overlays (sweep paths, scan effects) smooth
      let rafId: number
      const repaintLoop = () => {
        if (mapRef.current) mapRef.current.triggerRepaint()
        rafId = requestAnimationFrame(repaintLoop)
      }
      rafId = requestAnimationFrame(repaintLoop)
      // Store cleanup id on map object for teardown
      ;(map as any)._rafId = rafId

      // Handle Map Clicks
      map.on('click', (e) => {
        const nx = (e.lngLat.lng - centerLonRef.current) / GRID_SCALE + 0.5
        const ny = -(e.lngLat.lat - centerLatRef.current) / GRID_SCALE + 0.5

        // Draw mode: place disaster or boundary point
        const dm = drawModeRef.current
        if (dm === 'fire' || dm === 'flood') {
          onAddDisaster(dm, nx, ny)
          setDrawMode(null)
          return
        }
        if (dm === 'boundary') {
          setBoundaryPoints(prev => {
            const next = [...prev, { x: nx, y: ny }]
            boundaryPointsRef.current = next
            return next
          })
          return
        }

        const features = map.queryRenderedFeatures(e.point, { layers: ['drone-fleet-2d', 'drone-hitbox'] })
        if (features.length > 0) {
          const droneId = features[0].properties?.id
          onSelectDrone(droneId)
          setWaypointMode(false)
          const drone = dronesStateRef.current.find(d => d.id === droneId)
          if (drone) setDronePopup({ drone, px: e.point.x, py: e.point.y })
          return
        }

        // Check for boundary zone click
        const zoneFeatures = map.queryRenderedFeatures(e.point, { layers: ['boundary-fill'] })
        if (zoneFeatures.length > 0) {
          const instruction = zoneFeatures[0].properties?.instruction
          if (instruction) {
            setSelectedZone({ zone: { id: 'clicked', points: [], instruction, active: true }, px: e.point.x, py: e.point.y })
            return
          }
        }

        if (selectedDroneIdRef.current && waypointModeRef.current && onSetTarget) {
          onSetTarget(selectedDroneIdRef.current, nx, ny)
          setWaypointMode(false)
        } else if (!waypointModeRef.current) {
          onSelectDrone(null)
          setDronePopup(null)
          setSelectedZone(null)
        }
      })

      // Cursor and hover for drones + zones
      map.on('mousemove', (e) => {
        const dm = drawModeRef.current
        if (dm) {
          map.getCanvas().style.cursor = dm === 'boundary' ? 'cell' : 'crosshair'
          return
        }
        const features = map.queryRenderedFeatures(e.point, { layers: ['drone-fleet-2d', 'drone-hitbox', 'boundary-fill'] })
        if (features.length > 0) {
          map.getCanvas().style.cursor = 'pointer'
          e.originalEvent?.stopPropagation?.()
        } else if (waypointModeRef.current) {
          map.getCanvas().style.cursor = 'crosshair'
        } else {
          map.getCanvas().style.cursor = ''
        }
      })
    })

    return () => {
      if (mapRef.current) {
        const rafId = (mapRef.current as any)._rafId
        if (rafId) cancelAnimationFrame(rafId)
        // Clear HTML marker refs so they are rebuilt fresh on remount
        dronesMarkersRef.current.clear()
        droneMarkerElsRef.current.clear()
        disasterMarkersRef.current.forEach(m => m.remove())
        disasterMarkersRef.current.clear()
        if (userMarkerRef.current) { userMarkerRef.current.remove(); userMarkerRef.current = null }
        mapRef.current.remove()
        mapRef.current = null
        setMapLoaded(false)
      }
    }
  }, []) // Runs once — map never re-initializes on prop changes

  // Auto-resize Mapbox canvas when the container changes size (e.g. BottomBar expand/collapse)
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !mapContainerRef.current) return
    const observer = new ResizeObserver(() => {
      mapRef.current?.resize()
    })
    observer.observe(mapContainerRef.current)
    return () => observer.disconnect()
  }, [mapLoaded])

  // Handle View Mode Transition
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const map = mapRef.current

    if (viewMode === '3D') {
      // Isometric = tilted flat 2D map — no terrain, no 3D models, just perspective tilt
      map.easeTo({ pitch: 35, bearing: -20, duration: 1000 })
    } else {
      // Top-down = flat overhead view
      try { map.setTerrain(undefined as any) } catch (_) { /* ignore */ }
      map.easeTo({ pitch: 0, bearing: 0, duration: 1000 })
      if (map.getLayer('helipad-2d')) map.setLayoutProperty('helipad-2d', 'visibility', 'visible')
    }
  }, [viewMode, mapLoaded])

  // Update GeoJSON overlays (Sectors & Survivors & 2D Drones) — throttled to 10fps
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const now = Date.now()
    if (now - lastGeoJSONUpdate.current < 100) return
    lastGeoJSONUpdate.current = now
    const map = mapRef.current

    // Sectors
    const sectorFeatures = sectors.filter(s => s.coverage > 0).map(s => {
      const xMin = centerLon + (s.x / 8 - 0.5) * GRID_SCALE
      const xMax = centerLon + ((s.x + 1) / 8 - 0.5) * GRID_SCALE
      const yMax = centerLat - (s.y / 8 - 0.5) * GRID_SCALE
      const yMin = centerLat - ((s.y + 1) / 8 - 0.5) * GRID_SCALE
      return {
        type: 'Feature',
        properties: { opacity: s.coverage / 400 },
        geometry: {
          type: 'Polygon',
          coordinates: [[[xMin, yMin], [xMax, yMin], [xMax, yMax], [xMin, yMax], [xMin, yMin]]]
        }
      }
    })
    const sectorSource = map.getSource('sectors') as mapboxgl.GeoJSONSource
    if (sectorSource) sectorSource.setData({ type: 'FeatureCollection', features: sectorFeatures as any })

    // Survivors
    const survivorFeatures = survivors.map(s => ({
      type: 'Feature',
      properties: { id: s.id },
      geometry: {
        type: 'Point',
        coordinates: [centerLon + (s.x - 0.5) * GRID_SCALE, centerLat - (s.y - 0.5) * GRID_SCALE]
      }
    }))
    const survivorSource = map.getSource('survivors') as mapboxgl.GeoJSONSource
    if (survivorSource) survivorSource.setData({ type: 'FeatureCollection', features: survivorFeatures as any })

    const droneFeatures = drones.map(d => {
      // Keep all 2D icons with a unified orientation for readability
      const bearingDegrees = 0

      return {
        type: 'Feature',
        properties: { 
          id: d.id,
          bearing: bearingDegrees,
          color: d.id === selectedDroneId ? '#ffff00' : (d.battery < 20 ? '#ff3b3b' : '#00d4ff')
        },
        geometry: {
          type: 'Point',
          coordinates: [centerLon + (d.x - 0.5) * GRID_SCALE, centerLat - (d.y - 0.5) * GRID_SCALE]
        }
      }
    })
    const droneSource = map.getSource('drones-data') as mapboxgl.GeoJSONSource
    if (droneSource) droneSource.setData({ type: 'FeatureCollection', features: droneFeatures as any })

    // Drone Trail Lines
    const trailFeatures = drones
      .filter(d => d.trail && d.trail.length > 1)
      .map(d => ({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: d.trail.map(p => [
            centerLon + (p.x - 0.5) * GRID_SCALE,
            centerLat - (p.y - 0.5) * GRID_SCALE
          ])
        }
      }))
    const trailSource = map.getSource('drone-trails') as mapboxgl.GeoJSONSource
    if (trailSource) trailSource.setData({ type: 'FeatureCollection', features: trailFeatures as any })

    // Planned Route Lines — origin is always the drone's home-base slot (static, never shifts as drone moves)
    const routeFeatures = drones
      .filter(d => (d.status === 'SCANNING' || d.status === 'RETURNING' || d.status === 'ALERT') &&
        (Math.abs((d.slotX ?? d.x) - d.targetX) > 0.01 || Math.abs((d.slotY ?? d.y) - d.targetY) > 0.01))
      .map(d => ({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            // Home-base slot — fixed at initialization, never changes
            [centerLon + ((d.slotX ?? d.x) - 0.5) * GRID_SCALE, centerLat - ((d.slotY ?? d.y) - 0.5) * GRID_SCALE],
            [centerLon + (d.targetX - 0.5) * GRID_SCALE, centerLat - (d.targetY - 0.5) * GRID_SCALE]
          ]
        }
      }))
    const routeSource = map.getSource('planned-routes') as mapboxgl.GeoJSONSource
    if (routeSource) routeSource.setData({ type: 'FeatureCollection', features: routeFeatures as any })

  }, [sectors, survivors, drones, mapLoaded, selectedDroneId, centerLon, centerLat])

  // Zoom and pan to selected drone
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !selectedDroneId) return
    const map = mapRef.current
    const selected = drones.find(d => d.id === selectedDroneId)
    if (!selected) return

    const lon = centerLon + (selected.x - 0.5) * GRID_SCALE
    const lat = centerLat - (selected.y - 0.5) * GRID_SCALE

    map.easeTo({
      center: [lon, lat],
      zoom: 16,
      duration: 800
    })
  }, [selectedDroneId, drones, mapLoaded, centerLon, centerLat])

  // Update selected drone highlight area
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const map = mapRef.current
    const source = map.getSource('selected-drone-area') as mapboxgl.GeoJSONSource | undefined
    if (!source) return

    if (!selectedDroneId) {
      source.setData({ type: 'FeatureCollection', features: [] })
      return
    }

    const selected = drones.find(d => d.id === selectedDroneId)
    if (!selected) {
      source.setData({ type: 'FeatureCollection', features: [] })
      return
    }

    const lon = centerLon + (selected.x - 0.5) * GRID_SCALE
    const lat = centerLat - (selected.y - 0.5) * GRID_SCALE

    const feature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Point',
        coordinates: [lon, lat]
      }
    }

    source.setData({ type: 'FeatureCollection', features: [feature as any] })
  }, [selectedDroneId, drones, mapLoaded, centerLon, centerLat])

  // Sync drone popup data when drones update
  useEffect(() => {
    if (dronePopup) {
      const updated = drones.find(d => d.id === dronePopup.drone.id)
      if (updated) setDronePopup(prev => prev ? { ...prev, drone: updated } : null)
    }
  }, [drones])

  // Update helipad 2D icon position when center changes
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const map = mapRef.current
    const src = map.getSource('helipad-location') as mapboxgl.GeoJSONSource | undefined
    if (src) {
      src.setData({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [centerLon, centerLat] } }]
      } as any)
    }
  }, [mapLoaded, centerLon, centerLat])

  // Update boundary zones GeoJSON layer
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const map = mapRef.current

    // Committed boundaries
    const bzFeatures = boundaries.map(bz => ({
      type: 'Feature', properties: { instruction: bz.instruction },
      geometry: { type: 'Polygon', coordinates: [[
        ...bz.points.map(p => [centerLon + (p.x - 0.5) * GRID_SCALE, centerLat - (p.y - 0.5) * GRID_SCALE]),
        [centerLon + (bz.points[0].x - 0.5) * GRID_SCALE, centerLat - (bz.points[0].y - 0.5) * GRID_SCALE]
      ]] }
    }))
    const bzSrc = map.getSource('boundary-zones') as mapboxgl.GeoJSONSource
    if (bzSrc) bzSrc.setData({ type: 'FeatureCollection', features: bzFeatures as any })

    // Sweep path preview lines — one LineString feature per drone per zone
    const sweepFeatures: any[] = []
    boundaries.forEach(bz => {
      if (!bz.sweepPaths) return
      bz.sweepPaths.forEach((wps, droneIdx) => {
        if (wps.length < 2) return
        sweepFeatures.push({
          type: 'Feature',
          properties: { droneIdx },
          geometry: {
            type: 'LineString',
            coordinates: wps.map(p => [
              centerLon + (p.x - 0.5) * GRID_SCALE,
              centerLat - (p.y - 0.5) * GRID_SCALE,
            ]),
          },
        })
      })
    })
    const sweepSrc = map.getSource('zone-sweep-paths') as mapboxgl.GeoJSONSource
    if (sweepSrc) sweepSrc.setData({ type: 'FeatureCollection', features: sweepFeatures })

    // In-progress drawing line — close loop back to first point so user sees the shape
    if (boundaryPoints.length > 1) {
      const drawCoords = boundaryPoints.map(p => [centerLon + (p.x - 0.5) * GRID_SCALE, centerLat - (p.y - 0.5) * GRID_SCALE])
      // Add closing segment back to the first point
      const closedCoords = [...drawCoords, drawCoords[0]]
      const drawSrc = map.getSource('boundary-drawing') as mapboxgl.GeoJSONSource
      if (drawSrc) drawSrc.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: closedCoords } }] })
    } else {
      const drawSrc = map.getSource('boundary-drawing') as mapboxgl.GeoJSONSource
      if (drawSrc) drawSrc.setData({ type: 'FeatureCollection', features: [] })
    }
  }, [mapLoaded, boundaries, boundaryPoints, centerLon, centerLat])

  // Disaster HTML markers
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const map = mapRef.current
    const existing = disasterMarkersRef.current

    disasters.forEach(d => {
      if (existing.has(d.id)) return // already placed
      const el = document.createElement('div')
      el.style.cssText = 'width:48px;height:48px;cursor:default;pointer-events:none;'
      const img = document.createElement('img')
      img.src = `/tenxy-dashboard/${d.type}.gif`
      img.style.cssText = 'width:100%;height:100%;object-fit:contain;'
      el.appendChild(img)

      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([centerLon + (d.x - 0.5) * GRID_SCALE, centerLat - (d.y - 0.5) * GRID_SCALE])
        .addTo(map)
      existing.set(d.id, marker)
    })

    // Remove stale
    existing.forEach((marker, id) => {
      if (!disasters.find(d => d.id === id)) {
        marker.remove()
        existing.delete(id)
      }
    })
  }, [mapLoaded, disasters, centerLon, centerLat])

  // User location marker
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || userLat === null || userLon === null) return
    const map = mapRef.current
    if (userMarkerRef.current) {
      userMarkerRef.current.setLngLat([userLon, userLat])
    } else {
      const el = document.createElement('div')
      el.style.cssText = `
        width:18px; height:18px; border-radius:50%;
        background:rgba(0,212,255,0.9); border:3px solid #fff;
        box-shadow:0 0 12px #00d4ff, 0 0 24px rgba(0,212,255,0.5);
        cursor:default;
      `
      const pulse = document.createElement('div')
      pulse.style.cssText = `
        position:absolute; top:-8px; left:-8px;
        width:34px; height:34px; border-radius:50%;
        border:2px solid rgba(0,212,255,0.6);
        animation:pulse-ring 2s ease-out infinite;
      `
      el.appendChild(pulse)
      userMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([userLon, userLat])
        .addTo(map)
    }
  }, [mapLoaded, userLat, userLon])

  // Move helipad marker to user's GPS position whenever it is updated
  useEffect(() => {
    if (!mapLoaded || !mapRef.current || userLat === null || userLon === null) return
    const src = mapRef.current.getSource('helipad-location') as mapboxgl.GeoJSONSource
    if (src) {
      src.setData({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [userLon, userLat] } }]
      })
    }
  }, [mapLoaded, userLat, userLon])

  // Manage one HTML Marker per drone — uses CSS transform for position (never flickers)
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return
    const map = mapRef.current
    const droneIds = new Set(drones.map(d => d.id))

    // Remove markers for drones that no longer exist
    dronesMarkersRef.current.forEach((marker, id) => {
      if (!droneIds.has(id)) {
        marker.remove()
        dronesMarkersRef.current.delete(id)
        droneMarkerElsRef.current.delete(id)
      }
    })

    drones.forEach(drone => {
      const lon = centerLon + (drone.x - 0.5) * GRID_SCALE
      const lat = centerLat - (drone.y - 0.5) * GRID_SCALE
      const isSelected = drone.id === selectedDroneId
      const isAlert = drone.status === 'RETURNING' || drone.battery < 20
      const glowColor = isSelected ? '#ffff00' : (isAlert ? '#ff4444' : '#00d4ff')
      const dx = drone.targetX - drone.x
      const dy = drone.targetY - drone.y
      const bearingDeg = Math.atan2(dy, dx) * 180 / Math.PI

      if (dronesMarkersRef.current.has(drone.id)) {
        // Update existing marker position and appearance
        dronesMarkersRef.current.get(drone.id)!.setLngLat([lon, lat])
        const els = droneMarkerElsRef.current.get(drone.id)!
        els.img.style.filter = `drop-shadow(0 0 8px ${glowColor}) brightness(1.3)`
        els.img.style.transform = `rotate(${bearingDeg}deg)`
        els.label.style.color = isSelected ? '#ffff00' : '#00d4ff'
        els.label.style.borderColor = isSelected ? 'rgba(255,255,0,0.6)' : 'rgba(0,212,255,0.4)'
      } else {
        // Create new marker
        const wrapper = document.createElement('div')
        wrapper.style.cssText = 'cursor:pointer;display:flex;flex-direction:column;align-items:center;'

        const img = document.createElement('img')
        img.src = '/tenxy-dashboard/drone-icon.png'
        img.style.cssText = `width:28px;height:28px;object-fit:contain;filter:drop-shadow(0 0 8px ${glowColor}) brightness(1.3);transform:rotate(${bearingDeg}deg);`
        img.onerror = () => {
          img.style.display = 'none'
          const fallback = document.createElement('div')
          fallback.style.cssText = `width:28px;height:28px;border-radius:50%;background:${glowColor};border:2px solid #fff;box-shadow:0 0 8px ${glowColor};`
          wrapper.insertBefore(fallback, wrapper.children[1])
        }

        const label = document.createElement('div')
        label.textContent = drone.id
        label.style.cssText = 'background:rgba(13,17,23,0.9);color:#00d4ff;font-family:monospace;font-size:9px;padding:1px 5px;border:1px solid rgba(0,212,255,0.4);margin-top:3px;white-space:nowrap;pointer-events:none;'

        wrapper.appendChild(img)
        wrapper.appendChild(label)
        wrapper.addEventListener('click', (e) => {
          e.stopPropagation()
          onSelectDrone(drone.id)
        })

        const marker = new mapboxgl.Marker({ element: wrapper, anchor: 'center' })
          .setLngLat([lon, lat])
          .addTo(map)
        dronesMarkersRef.current.set(drone.id, marker)
        droneMarkerElsRef.current.set(drone.id, { img, label })
      }
    })
  }, [drones, mapLoaded, selectedDroneId, centerLon, centerLat])

  // Detect zone sweep completions and show a toast banner
  useEffect(() => {
    boundaries.forEach(bz => {
      const activeCount = drones.filter(d => d.zoneId === bz.id).length
      const prevCount = prevZoneDroneCountsRef.current[bz.id] ?? -1
      if (prevCount > 0 && activeCount === 0) {
        const notifId = `${bz.id}-complete`
        setToastNotifications(prev => {
          if (prev.some(n => n.id === notifId)) return prev
          return [...prev, {
            id: notifId,
            text: `✓ ZONE SWEEP COMPLETE — ${bz.instruction.length > 35 ? bz.instruction.slice(0, 35) + '…' : bz.instruction} — All units RTB`
          }]
        })
        setTimeout(() => setToastNotifications(prev => prev.filter(n => n.id !== notifId)), 7000)
      }
      prevZoneDroneCountsRef.current[bz.id] = activeCount
    })
  }, [drones, boundaries])

  const handleLocateMe = () => {
    if (!('geolocation' in navigator)) {
      alert('Geolocation is not supported by your browser')
      return
    }

    // Check if map is loaded
    if (!mapRef.current || !mapLoadedRef.current) {
      alert('Map is still loading. Please wait a moment and try again.')
      return
    }

    setLocating(true)
    const timeout = setTimeout(() => {
      setLocating(false)
    }, 15000)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timeout)
        const { latitude, longitude } = pos.coords
        setUserLat(latitude)
        setUserLon(longitude)
        sessionStorage.setItem('tenxy_user_lat', latitude.toString())
        sessionStorage.setItem('tenxy_user_lon', longitude.toString())
        
        // Center map on user location - wait a moment to ensure map is ready
        if (mapRef.current && mapLoadedRef.current) {
          setTimeout(() => {
            if (mapRef.current) {
              mapRef.current.flyTo({
                center: [longitude, latitude],
                zoom: 15,
                duration: 1200,
                padding: { top: 50, bottom: 200, left: 50, right: 300 }
              })
            }
          }, 100)
        }
        setLocating(false)
      },
      (error) => {
        clearTimeout(timeout)
        let errorMsg = 'Could not get your location. '
        if (error.code === 1) {
          errorMsg += 'Please enable location permissions for this website.'
        } else if (error.code === 2) {
          errorMsg += 'Location is temporarily unavailable.'
        } else if (error.code === 3) {
          errorMsg += 'Location request timed out.'
        }
        alert(errorMsg)
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  // Convert GPS coords to simulation grid (0-1), clamped
  const gpsToGrid = (lat: number, lon: number) => ({
    x: Math.max(0, Math.min(1, (lon - centerLon) / GRID_SCALE + 0.5)),
    y: Math.max(0, Math.min(1, -(lat - centerLat) / GRID_SCALE + 0.5))
  })

  const handleRecall = (droneIds: string[]) => {
    const target = userLat !== null && userLon !== null
      ? gpsToGrid(userLat, userLon)
      : { x: 0.5, y: 0.5 }
    onRecallDrones(droneIds, target.x, target.y)
    setMissionPanel(null)
    setSelectedForOp(new Set())
  }

  const handleSendMission = (droneIds: string[]) => {
    const target = userLat !== null && userLon !== null
      ? gpsToGrid(userLat, userLon)
      : { x: 0.5, y: 0.5 }
    onSendMission(droneIds, target.x, target.y)
    setMissionPanel(null)
    setSelectedForOp(new Set())
  }

  const toggleDroneForOp = (id: string) => {
    setSelectedForOp(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const btnBase: React.CSSProperties = {
    background: 'rgba(5,10,20,0.82)', border: '1px solid rgba(0,212,255,0.45)',
    borderRadius: 7, color: '#00d4ff', fontSize: 10, fontWeight: 700,
    padding: '6px 10px', cursor: 'pointer', letterSpacing: 1,
    boxShadow: '0 2px 8px rgba(0,0,0,0.7)', whiteSpace: 'nowrap' as const
  }

  // React click-capture overlay for draw mode.
  // This div sits above the Mapbox canvas and intercepts clicks so the map
  // never receives them — preventing accidental rotation in 3D pitch mode.
  const handleDrawOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!mapRef.current || !drawMode) return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    const lngLat = mapRef.current.unproject([px, py])
    const nx = (lngLat.lng - centerLonRef.current) / GRID_SCALE + 0.5
    const ny = -(lngLat.lat - centerLatRef.current) / GRID_SCALE + 0.5

    if (drawMode === 'fire' || drawMode === 'flood') {
      onAddDisaster(drawMode, nx, ny)
      setDrawMode(null)
    } else if (drawMode === 'boundary') {
      setBoundaryPoints(prev => {
        const next = [...prev, { x: nx, y: ny }]
        boundaryPointsRef.current = next
        return next
      })
    }
  }

  return (
    <div className={styles.container}>
      {/* Mapbox map container — handles both 2D top-down and 3D tactical (Three.js layer) */}
      <div ref={mapContainerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Draw-mode click overlay — provides crosshair cursor; map.on('click') handles the actual event */}
      {drawMode && (
        <div
          onClick={handleDrawOverlayClick}
          style={{
            position: 'absolute', inset: 0, zIndex: 20,
            cursor: drawMode === 'boundary' ? 'cell' : 'crosshair',
          }}
        />
      )}

      {/* ── Top-left: View toggle ── */}
      <div className={styles.viewToggle}>
        <button className={viewMode === '2D' ? styles.activeMode : ''} onClick={() => setViewMode('2D')}>TOP-DOWN</button>
        <button className={viewMode === '3D' ? styles.activeMode : ''} onClick={() => setViewMode('3D')}>ISOMETRIC</button>
      </div>

      {/* ── Top-right: Disaster placement toolbar ── */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6, zIndex: 50 }}>
        <button
          onClick={() => { setDrawMode(drawMode === 'fire' ? null : 'fire'); setBoundaryPoints([]) }}
          style={{ ...btnBase, border: `1px solid ${drawMode === 'fire' ? '#ff6600' : 'rgba(255,102,0,0.5)'}`, color: drawMode === 'fire' ? '#ff6600' : '#ff9944', background: drawMode === 'fire' ? 'rgba(255,80,0,0.25)' : 'rgba(5,10,20,0.82)' }}
          title="Click on map to place fire disaster"
        >🔥 FIRE</button>
        <button
          onClick={() => { setDrawMode(drawMode === 'flood' ? null : 'flood'); setBoundaryPoints([]) }}
          style={{ ...btnBase, border: `1px solid ${drawMode === 'flood' ? '#0088ff' : 'rgba(0,136,255,0.5)'}`, color: drawMode === 'flood' ? '#44aaff' : '#88ccff', background: drawMode === 'flood' ? 'rgba(0,100,255,0.2)' : 'rgba(5,10,20,0.82)' }}
          title="Click on map to place flood disaster"
        >🌊 FLOOD</button>
        <button
          onClick={() => { setDrawMode(drawMode === 'boundary' ? null : 'boundary'); if (drawMode === 'boundary') setBoundaryPoints([]) }}
          style={{ ...btnBase, border: `1px solid ${drawMode === 'boundary' ? '#ffaa00' : 'rgba(255,170,0,0.5)'}`, color: drawMode === 'boundary' ? '#ffcc44' : '#ffbb44', background: drawMode === 'boundary' ? 'rgba(255,150,0,0.2)' : 'rgba(5,10,20,0.82)' }}
          title="Click points to draw a zone, then confirm"
        >⬡ DRAW ZONE</button>
        {drawMode === 'boundary' && boundaryPoints.length >= 3 && (
          <button
            onClick={() => { setShowBoundaryInput(true); setDrawMode(null) }}
            style={{ ...btnBase, border: '1px solid #00ff88', color: '#00ff88', background: 'rgba(0,200,100,0.2)' }}
          >✓ CONFIRM ({boundaryPoints.length} pts)</button>
        )}
        {drawMode && (
          <button onClick={() => { setDrawMode(null); setBoundaryPoints([]) }}
            style={{ ...btnBase, border: '1px solid rgba(255,80,80,0.6)', color: '#ff8888' }}>✕ CANCEL</button>
        )}
      </div>

      {/* Draw mode hint */}
      {drawMode && (
        <div style={{ position: 'absolute', top: 50, left: '50%', transform: 'translateX(-50%)', zIndex: 50, background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,200,0,0.5)', borderRadius: 6, padding: '5px 14px', color: '#ffdd55', fontSize: 11, letterSpacing: 1, pointerEvents: 'none' }}>
          {drawMode === 'fire' && '🔥 Click on the map to place FIRE'}
          {drawMode === 'flood' && '🌊 Click on the map to place FLOOD'}
          {drawMode === 'boundary' && `⬡ Click to add points (${boundaryPoints.length} placed) — Need ≥3 to confirm`}
        </div>
      )}

      {/* Boundary instruction input — draggable popup */}
      {showBoundaryInput && (
        <div style={{
          position: 'fixed', left: popupPos.x, top: popupPos.y,
          zIndex: 9000, background: 'rgba(4,8,18,0.97)',
          border: '1px solid rgba(0,212,255,0.5)',
          borderTop: '2px solid #00d4ff',
          borderRadius: 6, width: 300,
          boxShadow: '0 8px 32px rgba(0,0,0,0.9), 0 0 20px rgba(0,212,255,0.15)',
          fontFamily: 'monospace',
        }}>
          {/* Drag handle header */}
          <div
            onMouseDown={handlePopupHeaderMouseDown}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 10px',
              background: 'rgba(0,212,255,0.08)',
              borderBottom: '1px solid rgba(0,212,255,0.2)',
              cursor: popupDragging ? 'grabbing' : 'grab',
              userSelect: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'rgba(0,212,255,0.5)', fontSize: 11, letterSpacing: 2 }}>⠿</span>
              <span style={{ color: '#00d4ff', fontSize: 10, fontWeight: 700, letterSpacing: 1.5 }}>⬡ ASSIGN ZONE MISSION</span>
            </div>
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={() => { setShowBoundaryInput(false); setBoundaryPoints([]) }}
              style={{ background: 'none', border: 'none', color: '#556', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1 }}
            >×</button>
          </div>

          {/* Popup body */}
          <div style={{ padding: '12px 14px' }}>
            <div style={{ color: '#aab', fontSize: 9, marginBottom: 6, letterSpacing: 1, textTransform: 'uppercase' }}>
              Zone perimeter: {boundaryPoints.length} pts · Tell the swarm what to do:
            </div>
            <textarea
              autoFocus
              value={boundaryInstruction}
              onChange={e => setBoundaryInstruction(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && boundaryInstruction.trim()) {
                  e.preventDefault()
                  onAddBoundary(boundaryPoints, boundaryInstruction)
                  setBoundaryPoints([]); setBoundaryInstruction(''); setShowBoundaryInput(false)
                }
              }}
              placeholder="e.g. Search for survivors, Check for fire spread, Rescue civilians..."
              style={{
                width: '100%', height: 72,
                background: 'rgba(0,20,40,0.85)',
                border: '1px solid rgba(0,212,255,0.25)',
                borderRadius: 4, color: '#cde', fontSize: 11, padding: 8,
                resize: 'none', boxSizing: 'border-box', outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                onClick={() => {
                  if (boundaryInstruction.trim()) {
                    onAddBoundary(boundaryPoints, boundaryInstruction)
                    setBoundaryPoints([]); setBoundaryInstruction(''); setShowBoundaryInput(false)
                  }
                }}
                style={{ flex: 1, ...btnBase, background: 'rgba(0,200,80,0.25)', border: '1px solid #00cc66', color: '#00ff88', fontSize: 11, padding: '8px 0' }}
              >✓ CONFIRM MISSION</button>
              <button
                onClick={() => { setShowBoundaryInput(false); setBoundaryPoints([]) }}
                style={{ ...btnBase, background: 'rgba(255,60,60,0.12)', border: '1px solid rgba(255,80,80,0.45)', color: '#ff8888', padding: '8px 12px' }}
              >✕</button>
            </div>
            <div style={{ marginTop: 8, fontSize: 9, color: '#445', textAlign: 'center' }}>
              Drag header to move · Enter to confirm · Esc to cancel
            </div>
          </div>
        </div>
      )}

      {/* ── Zone sweep completion toast notifications ── */}
      {toastNotifications.length > 0 && (
        <div style={{
          position: 'absolute', top: 56, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9100, display: 'flex', flexDirection: 'column', gap: 5,
          alignItems: 'center', pointerEvents: 'none',
        }}>
          {toastNotifications.map(n => (
            <div key={n.id} style={{
              background: 'rgba(0,25,12,0.97)',
              border: '1px solid #00ff88',
              borderLeft: '3px solid #00ff88',
              borderRadius: 5,
              padding: '8px 20px',
              fontFamily: 'monospace',
              fontSize: 11,
              color: '#00ff88',
              letterSpacing: 1,
              boxShadow: '0 0 20px rgba(0,255,136,0.3)',
              whiteSpace: 'nowrap',
            }}>
              {n.text}
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse-ring { 0% { transform: scale(0.6); opacity: 1; } 100% { transform: scale(1.8); opacity: 0; } }
        /* Hide Mapbox attribution */
        .mapboxgl-ctrl-attrib { display: none !important; }
        .mapboxgl-ctrl-logo { display: none !important; }
      `}</style>

      {/* ── Bottom-left: Locate Me (prominent, always visible) ── */}
      <div style={{ position: 'absolute', bottom: 16, left: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, zIndex: 9999 }}>
        <button
          onClick={handleLocateMe}
          disabled={locating}
          title="Center map on my location"
          style={{
            width: 52, height: 52, padding: 0,
            background: locating ? 'rgba(0,212,255,0.3)' : 'rgba(5,10,20,0.92)',
            border: `2px solid ${locating ? '#00d4ff' : 'rgba(0,212,255,0.85)'}`,
            borderRadius: 10, cursor: locating ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: locating
              ? '0 0 16px rgba(0,212,255,0.7)'
              : '0 0 10px rgba(0,0,0,0.9), 0 0 8px rgba(0,212,255,0.4)',
            transition: 'all 0.2s',
            animation: locating ? 'none' : undefined,
          }}
        >
          <img src="/tenxy-dashboard/cursor.png" alt=""
            style={{ width: 32, height: 32, objectFit: 'contain', opacity: locating ? 0.7 : 1, animation: locating ? 'spin 1s linear infinite' : 'none', display: 'block' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        </button>
        <span style={{
          fontSize: 8, fontFamily: 'monospace', fontWeight: 700,
          color: '#00d4ff', letterSpacing: 1, textTransform: 'uppercase',
          textShadow: '0 0 6px #00d4ff',
          background: 'rgba(5,10,20,0.75)', padding: '2px 5px', borderRadius: 3,
        }}>LOCATE ME</span>
      </div>

      {/* ── Bottom-right: Mission Control ── */}
      <div style={{ position: 'absolute', bottom: 16, right: 16, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 9999, alignItems: 'flex-end' }}>
        {/* spacer — replaced Locate Me button which moved to bottom-left */}

        {/* Mission Control Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
        <button
          onClick={() => { setMissionPanel(missionPanel === 'recall' ? null : 'recall'); setSelectedForOp(new Set()) }}
          title="Recall drones to your location"
          style={{
            background: missionPanel === 'recall' ? 'rgba(255,80,80,0.85)' : 'rgba(0,0,0,0.7)',
            border: '2px solid rgba(255,80,80,0.8)',
            borderRadius: 8, color: '#fff', fontSize: 10, fontWeight: 700,
            padding: '6px 10px', cursor: 'pointer', letterSpacing: 1,
            boxShadow: '0 2px 8px rgba(0,0,0,0.6)'
          }}
        >RECALL</button>
        <button
          onClick={() => { setMissionPanel(missionPanel === 'send' ? null : 'send'); setSelectedForOp(new Set()) }}
          title="Send drones on mission from your location"
          style={{
            background: missionPanel === 'send' ? 'rgba(0,212,255,0.3)' : 'rgba(0,0,0,0.7)',
            border: '2px solid rgba(0,212,255,0.7)',
            borderRadius: 8, color: '#00d4ff', fontSize: 10, fontWeight: 700,
            padding: '6px 10px', cursor: 'pointer', letterSpacing: 1,
            boxShadow: '0 2px 8px rgba(0,0,0,0.6)'
          }}
        >DEPLOY</button>
        </div>{/* /Mission Control inner */}
      </div>{/* /Bottom-right outer wrapper */}

      {/* Recall / Deploy Mission Panel */}
      {missionPanel && (
        <div style={{
          position: 'absolute', bottom: 84, right: 80, width: 220,
          background: 'rgba(5,10,20,0.92)', border: '1px solid rgba(0,212,255,0.3)',
          borderRadius: 10, padding: 12, zIndex: 25,
          boxShadow: '0 4px 20px rgba(0,0,0,0.7)'
        }}>
          <div style={{ color: '#00d4ff', fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>
            {missionPanel === 'recall' ? '⬅ RECALL TO YOUR LOCATION' : '➡ DEPLOY FROM YOUR LOCATION'}
          </div>
          <div style={{ fontSize: 10, color: '#88aacc', marginBottom: 8 }}>
            {userLat !== null ? `GPS: ${userLat.toFixed(4)}°N ${userLon?.toFixed(4)}°E` : 'GPS: Not available'}
          </div>
          <div style={{ maxHeight: 160, overflowY: 'auto', marginBottom: 8 }}>
            {drones.map(d => (
              <div key={d.id}
                onClick={() => toggleDroneForOp(d.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px',
                  borderRadius: 4, cursor: 'pointer', marginBottom: 2,
                  background: selectedForOp.has(d.id) ? 'rgba(0,212,255,0.15)' : 'transparent',
                  border: `1px solid ${selectedForOp.has(d.id) ? 'rgba(0,212,255,0.5)' : 'transparent'}`
                }}
              >
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: selectedForOp.has(d.id) ? '#00d4ff' : 'rgba(255,255,255,0.25)',
                  border: '1px solid rgba(0,212,255,0.6)', flexShrink: 0
                }} />
                <span style={{ color: '#cde', fontSize: 10, flex: 1 }}>{d.id}</span>
                <span style={{ fontSize: 9, color: d.battery < 20 ? '#ff4444' : '#88aacc' }}>{d.battery.toFixed(0)}%</span>
                <span style={{ fontSize: 9, color: '#556' }}>{d.status}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setSelectedForOp(new Set(drones.map(d => d.id)))}
              style={{ flex: 1, background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)',
                borderRadius: 4, color: '#00d4ff', fontSize: 9, padding: '4px 0', cursor: 'pointer' }}
            >ALL</button>
            <button
              onClick={() => setSelectedForOp(new Set())}
              style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 4, color: '#aaa', fontSize: 9, padding: '4px 0', cursor: 'pointer' }}
            >NONE</button>
            <button
              disabled={selectedForOp.size === 0}
              onClick={() => missionPanel === 'recall'
                ? handleRecall(Array.from(selectedForOp))
                : handleSendMission(Array.from(selectedForOp))
              }
              style={{
                flex: 2, borderRadius: 4, fontSize: 9, fontWeight: 700, padding: '4px 0', cursor: 'pointer',
                background: selectedForOp.size === 0 ? 'rgba(255,255,255,0.05)' : (missionPanel === 'recall' ? 'rgba(255,80,80,0.7)' : 'rgba(0,212,255,0.3)'),
                border: `1px solid ${missionPanel === 'recall' ? 'rgba(255,80,80,0.7)' : 'rgba(0,212,255,0.5)'}`,
                color: selectedForOp.size === 0 ? '#555' : '#fff', letterSpacing: 1
              }}
            >{missionPanel === 'recall' ? 'RECALL' : 'SEND'} ({selectedForOp.size})</button>
          </div>
        </div>
      )}

      {!sessionStorage.getItem('tenxy_mapbox_token') && (
        <div className={styles.tokenRequired}>
          <div className={styles.tokenBox}>
            <h3>MAP DATA OFFLINE</h3>
            <p>Please enter your Mapbox Access Token in the briefing screen to initialize 3D Terrain Scanning.</p>
          </div>
        </div>
      )}

      {selectedDroneId && (
        <div className={styles.manualMode}>
          <div className={styles.manualBadge}>MANUAL OVERRIDE: {selectedDroneId.toUpperCase()}</div>
          <div className={styles.manualHint}>Click {viewMode === '3D' ? 'terrain' : 'map'} to set waypoint</div>
        </div>
      )}

      {selectedDroneId && (
        <div 
          ref={windowRef}
          className={styles.propertyWindow}
          style={{
            transform: `translate(${windowOffset.x}px, ${windowOffset.y}px)`,
            cursor: isDragging ? 'grabbing' : 'default',
          }}
        >
          <div 
            className={styles.propertyHeader}
            onMouseDown={handleHeaderMouseDown}
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          >
            <span className={styles.unitName}>{selectedDroneId} // TACTICAL HUD</span>
            <button 
              className={styles.waypointBtn} 
              onClick={() => setWaypointMode(prev => !prev)}
              title="Toggle waypoint placement mode"
            >
              {waypointMode ? 'CANCEL WAYPOINT' : 'SET WAYPOINT'}
            </button>
            <button className={styles.closeBtn} onClick={() => onSelectDrone(null)}>×</button>
          </div>
          <div className={styles.propertyContent}>
            <div className={styles.cameraFeed}>
              {(() => {
                const d = drones.find(dr => dr.id === selectedDroneId)
                if (!d) return null
                return <MapboxDroneCamera drone={d} disasters={disasters} />
              })()}
            </div>
            <div className={styles.statusGrid}>
              <div className={styles.statusItem}>
                <label>BATT</label>
                <div className={styles.barContainer}>
                  <div 
                    className={styles.bar} 
                    style={{ 
                      width: `${drones.find(d => d.id === selectedDroneId)?.battery}%`,
                      background: (drones.find(d => d.id === selectedDroneId)?.battery || 0) < 20 ? '#ff3b3b' : '#00d4ff'
                    }} 
                  />
                </div>
                <span>{drones.find(d => d.id === selectedDroneId)?.battery}%</span>
              </div>
              <div className={styles.statusItem}>
                <label>ALT</label>
                <span>{150}M</span>
              </div>
              <div className={styles.statusItem}>
                <label>MODE</label>
                <span className={styles.statusValue}>{drones.find(d => d.id === selectedDroneId)?.status}</span>
              </div>
              <div className={styles.statusItem}>
                <label>GPS</label>
                <span>FIX: 3D</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Drone popup on map */}
      {dronePopup && (() => {
        const d = dronePopup.drone
        const statusColor = d.status === 'ALERT' ? '#ff4444' : d.status === 'RETURNING' || d.status === 'CHARGING' ? '#ffaa00' : '#00d4ff'
        const missionText = d.mission || (d.status === 'SCANNING' ? 'Area scan / survivor detection' : d.status === 'RETURNING' ? 'Returning to helipad (low battery)' : d.status === 'CHARGING' ? 'Charging on helipad' : d.status === 'ALERT' ? 'Disaster response mission' : 'Standby')
        return (
          <div style={{
            position: 'absolute',
            left: Math.min(dronePopup.px + 12, window.innerWidth - 220),
            top: Math.max(dronePopup.py - 60, 8),
            width: 200, zIndex: 200,
            background: 'rgba(5,10,20,0.93)', border: `1px solid ${statusColor}44`,
            borderLeft: `3px solid ${statusColor}`, borderRadius: 8,
            padding: '8px 10px', boxShadow: '0 4px 20px rgba(0,0,0,0.8)',
            fontFamily: 'monospace',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ color: statusColor, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>{d.name}</span>
              <button onClick={() => setDronePopup(null)} style={{ background: 'none', border: 'none', color: '#556', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 8px', fontSize: 9, color: '#aab', marginBottom: 5 }}>
              <span>STATUS</span><span style={{ color: statusColor }}>{d.status}</span>
              <span>BATTERY</span><span style={{ color: d.battery < 20 ? '#ff4444' : '#cde' }}>{d.battery.toFixed(0)}%</span>
              <span>ALTITUDE</span><span style={{ color: '#cde' }}>{d.altitude.toFixed(0)}m</span>
              <span>SPEED</span><span style={{ color: '#cde' }}>{d.speed.toFixed(1)} m/s</span>
              <span>TEMP</span><span style={{ color: d.temp > 50 ? '#ff8844' : '#cde' }}>{d.temp.toFixed(1)}°C</span>
              <span>GPS</span><span style={{ color: '#cde' }}>FIX 3D</span>
            </div>
            <div style={{ borderTop: '1px solid rgba(0,212,255,0.15)', paddingTop: 5, fontSize: 9 }}>
              <span style={{ color: '#88aacc' }}>MISSION: </span>
              <span style={{ color: '#e0e8ff' }}>{missionText}</span>
            </div>
          </div>
        )
      })()}

      {/* Zone selection popup (2D mode — boundary-fill click) */}
      {selectedZone && viewMode === '2D' && (
        <div style={{
          position: 'absolute',
          left: Math.min(selectedZone.px + 8, 600),
          top: Math.max(selectedZone.py - 60, 4),
          zIndex: 110,
          minWidth: 180, maxWidth: 260,
          background: 'rgba(5,10,20,0.95)', border: '1px solid rgba(255,170,0,0.5)',
          borderLeft: '3px solid #ffaa00', borderRadius: 7,
          padding: '8px 10px', boxShadow: '0 4px 20px rgba(0,0,0,0.8)',
          fontFamily: 'monospace',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ color: '#ffaa00', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>⬡ ZONE MISSION</span>
            <button onClick={() => setSelectedZone(null)} style={{ background: 'none', border: 'none', color: '#556', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ color: '#e0d0b0', fontSize: 10, lineHeight: 1.5 }}>
            {selectedZone.zone.instruction}
          </div>
        </div>
      )}

      {/* ── Persistent Zone Status Panel (bottom-left, above LOCATE ME) ── */}
      {boundaries.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 90, left: 16,
          width: 210, maxHeight: 260, overflowY: 'auto',
          zIndex: 60,
          background: 'rgba(4,8,18,0.94)',
          border: '1px solid rgba(255,170,0,0.45)',
          borderLeft: '3px solid #ffaa00',
          borderRadius: 6,
          fontFamily: 'monospace',
          boxShadow: '0 4px 20px rgba(0,0,0,0.8)',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '5px 8px',
            background: 'rgba(255,170,0,0.08)',
            borderBottom: '1px solid rgba(255,170,0,0.2)',
          }}>
            <span style={{ color: '#ffaa00', fontSize: 9, fontWeight: 700, letterSpacing: 1.5 }}>
              ⬡ ACTIVE ZONES ({boundaries.length})
            </span>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ffaa00', boxShadow: '0 0 6px #ffaa00', animation: 'status-pulse 1.5s infinite' }} />
          </div>

          {/* Zone list */}
          {boundaries.map((bz, i) => {
            const assignedDrones = drones.filter(d => d.zoneId === bz.id)
            const color = SWEEP_COLORS[i % SWEEP_COLORS.length]
            return (
              <div key={bz.id} style={{
                padding: '6px 8px',
                borderBottom: i < boundaries.length - 1 ? '1px solid rgba(255,170,0,0.1)' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                  <span style={{ color: '#ffcc44', fontSize: 9, fontWeight: 700, letterSpacing: 1 }}>
                    ZONE-{String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ color: assignedDrones.length > 0 ? '#00ff88' : '#556', fontSize: 8, marginLeft: 'auto' }}>
                    {assignedDrones.length > 0 ? `${assignedDrones.length} DRONE${assignedDrones.length > 1 ? 'S' : ''}` : 'COMPLETE'}
                  </span>
                </div>
                <div style={{ color: '#b0a080', fontSize: 9, lineHeight: 1.4, marginLeft: 13 }}>
                  {bz.instruction.length > 50 ? bz.instruction.slice(0, 50) + '…' : bz.instruction}
                </div>
                {assignedDrones.length > 0 && (
                  <div style={{ marginLeft: 13, marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {assignedDrones.map(d => (
                      <span key={d.id} style={{
                        fontSize: 8, color: '#00d4ff',
                        background: 'rgba(0,212,255,0.08)',
                        border: '1px solid rgba(0,212,255,0.2)',
                        borderRadius: 2, padding: '1px 4px',
                      }}>{d.name}</span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className={styles.coords}>
        <span>LAT: {centerLat.toFixed(4)}° N</span>
        <span>LON: {centerLon.toFixed(4)}° E</span>
        <span>ZONE: {centerLat === DEFAULT_CENTER_LAT ? 'TACLOBAN' : 'USER-LOCATION'}-{viewMode} // SWARM ACTIVE</span>
      </div>
    </div>
  )
}
