import { useState, useEffect, useRef, useCallback } from 'react'

export interface Drone {
  id: string
  name: string
  x: number // 0-1 range (normalized)
  y: number // 0-1 range (normalized)
  targetX: number
  targetY: number
  battery: number
  status: 'SCANNING' | 'DEPLOYING' | 'RETURNING' | 'IDLE' | 'CHARGING' | 'ALERT'
  altitude: number
  speed: number
  temp: number
  trail: { x: number; y: number }[]
  slotX?: number  // helipad landing slot
  slotY?: number
  mission?: string  // current mission description
  rescueProgress?: number   // 0-100 while actively rescuing a disaster
  missionTargetId?: string  // ID of the DisasterMarker being rescued
  waypoints?: { x: number; y: number }[]  // zone sweep lawnmower path
  waypointIndex?: number    // current position in waypoints array
  zoneId?: string           // ID of the BoundaryZone being searched
}

export interface Survivor {
  id: string
  x: number
  y: number
  detectedTime: string
  status: 'DETECTED' | 'VERIFIED' | 'RESCUE_READY'
}

export interface Sector {
  id: string
  x: number
  y: number
  coverage: number
  status: 'UNSCANNED' | 'SCANNING' | 'SCANNED'
}

export interface MissionLogEntry {
  time: string
  message: string
  type: 'system' | 'drone' | 'alert'
}

export interface DisasterMarker {
  id: string
  type: 'fire' | 'flood'
  x: number  // normalized 0-1
  y: number
}

export interface BoundaryZone {
  id: string
  points: { x: number; y: number }[]  // normalized 0-1
  instruction: string
  active: boolean
  sweepPaths?: { x: number; y: number }[][]  // pre-computed lawnmower paths per drone
}

// ── Zone Search Helpers ────────────────────────────────────────────────────────

/** Ray-casting point-in-polygon test (normalized 0-1 coordinates) */
function pointInPolygon(x: number, y: number, polygon: { x: number; y: number }[]): boolean {
  let inside = false
  const n = polygon.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y
    const xj = polygon[j].x, yj = polygon[j].y
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/**
 * Generate lawnmower (boustrophedon) waypoints for one drone's sector.
 * The zone is divided into rows; each drone owns every Nth row (round-robin).
 * Alternate rows are traversed right-to-left for a continuous serpentine path.
 * Step sizes are adaptive: small zones get fine-grained coverage, large zones get broader sweeps.
 */
export function generateZoneWaypoints(
  polygon: { x: number; y: number }[],
  droneIndex: number,
  totalDrones: number,
): { x: number; y: number }[] {
  const xs = polygon.map(p => p.x)
  const ys = polygon.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)

  // Adaptive step sizes — target ~18 rows vertically and ~25 columns horizontally
  // so even small drawn zones produce meaningful sweep coverage.
  const SWEEP_STEP = Math.max(0.008, (maxY - minY) / 18)
  const POINT_STEP = Math.max(0.007, (maxX - minX) / 25)

  const result: { x: number; y: number }[] = []
  let globalRow = 0
  let ownedRow = 0

  for (let y = minY + SWEEP_STEP / 2; y <= maxY; y += SWEEP_STEP, globalRow++) {
    // Round-robin row assignment — each drone takes every Nth row
    if (globalRow % totalDrones !== droneIndex) continue

    const linePoints: { x: number; y: number }[] = []
    for (let x = minX + POINT_STEP / 2; x <= maxX; x += POINT_STEP) {
      if (pointInPolygon(x, y, polygon)) linePoints.push({ x, y })
    }

    // Serpentine: reverse every other owned row so the drone doesn't fly back to start
    if (ownedRow % 2 === 1) linePoints.reverse()
    result.push(...linePoints)
    ownedRow++
  }

  return result
}

// ──────────────────────────────────────────────────────────────────────────────

export function useSimulation(initialDroneCount: number = 12) {
  const [drones, setDrones] = useState<Drone[]>([])
  const [survivors, setSurvivors] = useState<Survivor[]>([])
  const [sectors, setSectors] = useState<Sector[]>([])
  const [logs, setLogs] = useState<MissionLogEntry[]>([])
  const [missionTime, setMissionTime] = useState(0)
  const [coverage, setCoverage] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [powerFailure, setPowerFailure] = useState(false)
  const [disasters, setDisasters] = useState<DisasterMarker[]>([])
  const [boundaries, setBoundaries] = useState<BoundaryZone[]>([])

  const initialized = useRef(false)
  // Track drones that were manually targeted by user (to prevent grid reset overriding them)
  const userTargetedDronesRef = useRef<Map<string, { x: number; y: number; time: number }>>(new Map())
  // Track when admin deployed the swarm (to prevent grid reset overriding deployment)
  const adminDeploymentTimeRef = useRef<number | null>(null)
  // Refs for stale-closure-safe access inside setInterval callbacks
  const powerFailureRef = useRef(false)
  const disastersRef = useRef<DisasterMarker[]>([])

  // Initialize drones
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    // Spawn drones in grid formation on helipad (center = 0.5, 0.5)
    const cols = Math.ceil(Math.sqrt(initialDroneCount))
    const newDrones: Drone[] = Array.from({ length: initialDroneCount }).map((_, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const spacing = 0.015
      const offsetX = (col - (cols - 1) / 2) * spacing
      const offsetY = (row - (Math.ceil(initialDroneCount / cols) - 1) / 2) * spacing
      return {
        id: `alpha-${i + 1}`,
        name: `ALPHA-${(i + 1).toString().padStart(2, '0')}`,
        x: 0.5 + offsetX,
        y: 0.5 + offsetY,
        targetX: 0.5 + offsetX,
        targetY: 0.5 + offsetY,
        battery: 100,
        status: 'IDLE' as const,
        altitude: 0,
        speed: 0,
        temp: 20,
        trail: [],
        slotX: 0.5 + offsetX,  // helipad grid slot
        slotY: 0.5 + offsetY,
      }
    })

    setDrones(newDrones)

    // Initialize 8x8 grid
    const newSectors: Sector[] = []
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        newSectors.push({
          id: `${String.fromCharCode(65 + y)}-${x + 1}`,
          x,
          y,
          coverage: 0,
          status: 'UNSCANNED'
        })
      }
    }
    setSectors(newSectors)

    addLog('System: Swarm initialized. All units reporting nominal.', 'system')
  }, [initialDroneCount])

  // Keep refs in sync so interval callbacks always read current state
  useEffect(() => { powerFailureRef.current = powerFailure }, [powerFailure])
  useEffect(() => { disastersRef.current = disasters }, [disasters])

  const addLog = useCallback((message: string, type: MissionLogEntry['type']) => {
    const timeStr = new Date().toLocaleTimeString('en-GB', { hour12: false })
    setLogs(prev => [...prev.slice(-49), { time: timeStr, message, type }])
  }, [])

  // Ref for completed disaster IDs — written inside setDrones, read on next tick
  const completedMissionsRef = useRef<Set<string>>(new Set())

  // Simulation tick
  useEffect(() => {
    if (isPaused) return

    const interval = setInterval(() => {
      setMissionTime(prev => prev + 1)

      // Process rescues completed on the previous tick
      if (completedMissionsRef.current.size > 0) {
        const toRemove = new Set(completedMissionsRef.current)
        completedMissionsRef.current.clear()
        setDisasters(prev => prev.filter(d => !toRemove.has(d.id)))
      }

      setDrones(prevDrones => {
        // Build set of disaster IDs already being rescued (from previous ticks).
        // Mutated inside the map so only ONE drone per disaster is assigned per tick.
        const rescuingNow = new Set<string>(
          prevDrones.filter(d => d.missionTargetId).map(d => d.missionTargetId!)
        )

        return prevDrones.map(drone => {
          let { x, y, targetX, targetY, battery, status, speed, altitude, temp } = drone
          let rescueProgress = drone.rescueProgress ?? 0
          let missionTargetId = drone.missionTargetId
          let waypoints = drone.waypoints
          let waypointIndex = drone.waypointIndex ?? 0
          let zoneId = drone.zoneId

          // IDLE drones do nothing — they stay at their helipad slot
          if (status === 'IDLE') return drone

          // ── Zone sweep: override target to current waypoint ────────────────
          if (status === 'SCANNING' && waypoints && waypoints.length > 0) {
            const wIdx = Math.min(waypointIndex, waypoints.length - 1)
            targetX = waypoints[wIdx].x
            targetY = waypoints[wIdx].y
          }

          // Move towards target
          const dx = targetX - x
          const dy = targetY - y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < 0.015) {
            if (status === 'SCANNING' && waypoints && waypoints.length > 0) {
              // ── Zone sweep waypoint reached — advance to next ──────────────
              const wIdx = Math.min(waypointIndex, waypoints.length - 1)
              const nextIdx = wIdx + 1
              if (nextIdx < waypoints.length) {
                waypointIndex = nextIdx
                targetX = waypoints[nextIdx].x
                targetY = waypoints[nextIdx].y
                const pct = Math.round((nextIdx / waypoints.length) * 100)
                if (pct === 25) addLog(`${drone.name}: Zone coverage 25% — thermal sensors sweeping.`, 'drone')
                else if (pct === 50) addLog(`${drone.name}: Zone coverage 50% — midpoint reached.`, 'drone')
                else if (pct === 75) addLog(`${drone.name}: Zone coverage 75% — final sector.`, 'drone')
              } else {
                // All waypoints completed — RTB
                addLog(`${drone.name}: Zone sweep COMPLETE — ${waypoints.length} waypoints covered. RTB.`, 'drone')
                waypoints = undefined
                waypointIndex = 0
                zoneId = undefined
                status = 'RETURNING'
                targetX = drone.slotX ?? 0.5
                targetY = drone.slotY ?? 0.5
              }
            } else if (status === 'RETURNING') {
              status = 'CHARGING'
              targetX = drone.slotX ?? x
              targetY = drone.slotY ?? y
              addLog(`${drone.name}: Docked at helipad. Initiating rapid recharge.`, 'system')
            } else if (status === 'ALERT' && missionTargetId) {
              // On-site rescue — step through 0→100 progress over ~25 ticks
              const prevProg = rescueProgress
              rescueProgress = Math.min(100, prevProg + 4)

              if (prevProg === 0 && rescueProgress > 0) {
                addLog(`${drone.name}: AGENT — On-site. Scanning for survivors with thermal imaging.`, 'drone')
              } else if (prevProg < 25 && rescueProgress >= 25) {
                addLog(`${drone.name}: AGENT — Thermal signature confirmed. Deploying emergency supplies.`, 'drone')
              } else if (prevProg < 50 && rescueProgress >= 50) {
                addLog(`${drone.name}: AGENT — Evacuating survivors. Coordinating escape routes.`, 'drone')
              } else if (prevProg < 75 && rescueProgress >= 75) {
                addLog(`${drone.name}: AGENT — Containment perimeter secured. Stabilizing zone.`, 'drone')
              } else if (prevProg < 100 && rescueProgress >= 100) {
                addLog(`${drone.name}: AGENT — ✓ RESCUE COMPLETE. All survivors evacuated. RTB.`, 'alert')
                completedMissionsRef.current.add(missionTargetId)
                status = 'RETURNING'
                targetX = drone.slotX ?? 0.5
                targetY = drone.slotY ?? 0.5
                missionTargetId = undefined
                rescueProgress = 0
              }
              // ALERT drone stays ALERT while rescuing (not IDLE)
            } else if (status !== 'CHARGING') {
              if (zoneId) {
                // Zone-assigned drone with 0 waypoints reached centroid — RTB cleanly
                addLog(`${drone.name}: Zone search complete (no sweep path). RTB.`, 'drone')
                zoneId = undefined
                waypoints = undefined
                waypointIndex = 0
                status = 'RETURNING'
                targetX = drone.slotX ?? 0.5
                targetY = drone.slotY ?? 0.5
              } else {
                // Regular waypoint reached — park at helipad slot
                status = 'IDLE'
                targetX = drone.slotX ?? 0.5
                targetY = drone.slotY ?? 0.5
              }
            }
          }

          if (status === 'CHARGING') {
            battery = Math.min(100, battery + 5)
            if (battery >= 100) {
              status = 'IDLE'
              addLog(`${drone.name}: Fully charged. Standing by at helipad.`, 'drone')
            }
          } else if (dist > 0) {
            const moveSpeed = 0.002 // Normalized units per tick
            x += (dx / dist) * moveSpeed
            y += (dy / dist) * moveSpeed
            speed = 40 + Math.random() * 10
            altitude = 100 + Math.sin(Date.now() / 1000) * 10
          }

          // Update trail
          const newTrail = [{ x, y }, ...drone.trail].slice(0, 15)

          // ── Battery drain + RTB ────────────────────────────────────────────
          if (status !== 'CHARGING') {
            battery = Math.max(0, battery - 0.2)

            if (status !== 'RETURNING') {
              const homeX = drone.slotX ?? 0.5
              const homeY = drone.slotY ?? 0.5

              if (status === 'ALERT') {
                // Rescue drones: use fixed 10% hard cutoff so they can complete the mission.
                if (battery <= 10) {
                  status = 'RETURNING'
                  targetX = homeX
                  targetY = homeY
                  missionTargetId = undefined
                  rescueProgress = 0
                  addLog(`${drone.name}: Critical battery during rescue — emergency RTB.`, 'alert')
                }
              } else {
                // Scanning/deploying drones: distance-aware RTB ensures they can always return.
                const distToHome = Math.hypot(x - homeX, y - homeY)
                const batteryNeeded = distToHome * 100 * 1.1  // 10% safety margin
                const threshold = Math.max(batteryNeeded, 10)  // never below 10%

                if (battery <= threshold) {
                  status = 'RETURNING'
                  targetX = homeX
                  targetY = homeY
                  // Clear zone waypoints — drone must RTB
                  waypoints = undefined
                  waypointIndex = 0
                  zoneId = undefined
                  addLog(`${drone.name}: Battery at ${battery.toFixed(0)}% — RTB (need ≥${batteryNeeded.toFixed(0)}%).`, 'alert')
                }
              }
            }
          }

          // ── Autonomous disaster detection (power failure mode) ──────────────
          // Drones have no telemetry — they detect by proximity ("on-board sensors").
          // rescuingNow is shared across the map call and mutated on assignment,
          // so only ONE drone per disaster is assigned per tick.
          if (powerFailureRef.current && !missionTargetId &&
              status !== 'ALERT' && status !== 'RETURNING' && status !== 'CHARGING') {
            const nearDisaster = disastersRef.current.find(d =>
              Math.hypot(d.x - x, d.y - y) < 0.08 && !rescuingNow.has(d.id)
            )
            if (nearDisaster) {
              rescuingNow.add(nearDisaster.id)  // claim before next drone checks
              addLog(`${drone.name}: AUTONOMOUS SENSOR — ${nearDisaster.type.toUpperCase()} signature detected at (${nearDisaster.x.toFixed(2)}, ${nearDisaster.y.toFixed(2)}). Initiating rescue protocol.`, 'alert')
              status = 'ALERT'
              missionTargetId = nearDisaster.id
              targetX = nearDisaster.x
              targetY = nearDisaster.y
              rescueProgress = 0
              waypoints = undefined
              waypointIndex = 0
              zoneId = undefined
            }
          }

          temp = 35 + (1 - battery / 100) * 20 + Math.random() * 2
          return {
            ...drone,
            x, y, targetX, targetY,
            battery: Number(battery.toFixed(1)),
            status, speed, altitude, temp,
            trail: newTrail,
            rescueProgress, missionTargetId,
            waypoints, waypointIndex, zoneId,
          }
        })
      })

      // Randomly spawn survivors or hazards
      if (Math.random() < 0.01) {
        const id = `SOS-${Math.floor(Math.random() * 999)}`
        const newSurvivor: Survivor = {
          id,
          x: Math.random(),
          y: Math.random(),
          detectedTime: new Date().toLocaleTimeString(),
          status: 'DETECTED',
        }
        setSurvivors(prev => [...prev, newSurvivor])
        addLog(`TENXY AI: Potential thermal signature detected at sector grid coordinate ${id}.`, 'drone')
      }

      // Update coverage
      setSectors(prevSectors => {
        const updated = prevSectors.map(sector => {
          // Count how many drones are currently in this sector
          const dronesInSector = drones.filter(d => {
            const sx = Math.floor(d.x * 8)
            const sy = Math.floor(d.y * 8)
            return sx === sector.x && sy === sector.y
          }).length

          if (dronesInSector > 0) {
            const newCoverage = Math.min(100, sector.coverage + (dronesInSector * 2))
            return {
              ...sector,
              coverage: newCoverage,
              status: (newCoverage === 100 ? 'SCANNED' : 'SCANNING') as Sector['status']
            }
          }
          return sector
        })

        // Update global coverage average
        const total = updated.reduce((sum, s) => sum + s.coverage, 0)
        setCoverage(total / 64)

        return updated
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isPaused, addLog])

  // ── Grid Formation Logic ──────────────────────────────────────────
  useEffect(() => {
    if (disasters.length > 0 || powerFailure) {
      return
    }

    const now = Date.now()
    const userTargets = userTargetedDronesRef.current
    const adminDeployTime = adminDeploymentTimeRef.current

    const isRecentAdminDeployment = adminDeployTime && (now - adminDeployTime) < 60000

    userTargets.forEach((target, id) => {
      if (now - target.time > 30000) {
        userTargets.delete(id)
      }
    })

    setDrones(prev => {
      return prev.map(drone => {
        // Skip drones that are charging or in other critical states
        if (drone.status === 'CHARGING' || drone.status === 'RETURNING') {
          return drone
        }

        // Skip drones that are actively executing a zone sweep (have waypoints OR are zone-assigned)
        if ((drone.waypoints && drone.waypoints.length > 0) || drone.zoneId) {
          return drone
        }

        // Skip drones that are actively mid-rescue — let their rescue progress loop finish and RTB on its own
        if (drone.missionTargetId) return drone

        // Skip drones that were recently targeted by the user
        const userTarget = userTargets.get(drone.id)
        if (userTarget) {
          const distToTarget = Math.hypot(
            drone.x - userTarget.x,
            drone.y - userTarget.y
          )
          if (distToTarget > 0.02) {
            return drone
          }
        }

        // Return SCANNING/ALERT/DEPLOYING drones back to IDLE at their grid slot
        const isActive = drone.status === 'SCANNING' || drone.status === 'DEPLOYING' || drone.status === 'ALERT'
        if (isActive && !userTarget && !isRecentAdminDeployment) {
          return {
            ...drone,
            status: 'IDLE',
            targetX: drone.slotX ?? 0.5,
            targetY: drone.slotY ?? 0.5,
            mission: undefined
          }
        }

        return drone
      })
    })
  }, [disasters.length, powerFailure])

  const deploySwarm = useCallback(() => {
    adminDeploymentTimeRef.current = Date.now()
    setDrones(prev => prev.map((d, idx) => {
      const gridSize = 4
      const gridX = (idx % gridSize) / gridSize + 0.125
      const gridY = Math.floor(idx / gridSize) / gridSize + 0.125
      return {
        ...d,
        status: 'SCANNING',
        targetX: gridX,
        targetY: gridY,
        mission: 'Area scan - survivor detection'
      }
    }))
    addLog('TENXY AI: Swarm deployment sequence active. Initializing grid search.', 'drone')
  }, [addLog])

  const addDisaster = useCallback((type: 'fire' | 'flood', x: number, y: number) => {
    const id = `${type.toUpperCase()}-${Date.now()}`
    setDisasters(prev => [...prev, { id, type, x, y }])

    // Power failure: base station OFFLINE — drones have no telemetry and cannot receive
    // dispatch orders. They will detect the disaster autonomously via on-board sensors.
    if (powerFailureRef.current) {
      addLog(`ALERT: ${type.toUpperCase()} DISASTER marked at (${x.toFixed(2)}, ${y.toFixed(2)}). Base station OFFLINE — drones will detect autonomously during sweep.`, 'alert')
      return
    }

    addLog(`ALERT: ${type.toUpperCase()} DISASTER detected at grid (${x.toFixed(2)}, ${y.toFixed(2)}). Dispatching response units.`, 'alert')
    setDrones(prev => {
      const available = prev.filter(d => d.status === 'SCANNING' || d.status === 'IDLE')
      const nearest = [...available].sort((a, b) => {
        const da = Math.hypot(a.x - x, a.y - y)
        const db = Math.hypot(b.x - x, b.y - y)
        return da - db
      }).slice(0, 2)
      const nearestIds = new Set(nearest.map(d => d.id))
      return prev.map(d => nearestIds.has(d.id)
        ? { ...d, targetX: x, targetY: y, status: 'ALERT' as const, mission: `RESPOND: ${type.toUpperCase()}`, missionTargetId: id, rescueProgress: 0, waypoints: undefined, waypointIndex: 0 }
        : d
      )
    })
  }, [addLog])

  const addBoundary = useCallback((points: { x: number; y: number }[], instruction: string) => {
    const id = `ZONE-${Date.now()}`
    addLog(`ZONE ASSIGNED: "${instruction}" — Routing drones to boundary zone.`, 'system')

    if (points.length >= 3) {
      const cx = points.reduce((s, p) => s + p.x, 0) / points.length
      const cy = points.reduce((s, p) => s + p.y, 0) / points.length

      // Pre-compute sweep paths for up to 3 drones (for map preview and drone assignment)
      const NUM_DRONES = 3
      const sweepPaths = Array.from({ length: NUM_DRONES }, (_, i) =>
        generateZoneWaypoints(points, i, NUM_DRONES)
      )

      // Store boundary with pre-computed sweep paths for immediate map preview
      setBoundaries(prev => [...prev, { id, points, instruction, active: true, sweepPaths }])

      setDrones(prev => {
        const available = prev.filter(d => d.status === 'SCANNING' || d.status === 'IDLE')
        const nearest = [...available].sort((a, b) =>
          Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy)
        ).slice(0, NUM_DRONES)

        const assignedIds = new Set(nearest.map(d => d.id))

        return prev.map(d => {
          if (!assignedIds.has(d.id)) return d
          const droneIdx = nearest.findIndex(nd => nd.id === d.id)
          const wps = sweepPaths[droneIdx] ?? []
          const firstWp = wps.length > 0 ? wps[0] : { x: cx, y: cy }
          addLog(`${d.name}: Sector ${droneIdx + 1}/${nearest.length} assigned — ${wps.length} waypoints. Starting lawnmower sweep.`, 'drone')
          return {
            ...d,
            targetX: firstWp.x,
            targetY: firstWp.y,
            status: 'SCANNING' as const,
            mission: instruction,
            waypoints: wps.length > 0 ? wps : undefined,
            waypointIndex: 0,
            zoneId: id,
          }
        })
      })
    } else if (points.length > 0) {
      // Fallback for < 3 points: just send drones to centroid
      const cx = points.reduce((s, p) => s + p.x, 0) / points.length
      const cy = points.reduce((s, p) => s + p.y, 0) / points.length
      setBoundaries(prev => [...prev, { id, points, instruction, active: true }])
      setDrones(prev => {
        const available = prev.filter(d => d.status === 'SCANNING' || d.status === 'IDLE')
        const nearest = [...available].sort((a, b) =>
          Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy)
        ).slice(0, 3)
        const nearestIds = new Set(nearest.map(d => d.id))
        return prev.map(d => nearestIds.has(d.id)
          ? { ...d, targetX: cx, targetY: cy, status: 'SCANNING' as const, mission: instruction }
          : d
        )
      })
    }
  }, [addLog])

  const isRunning = drones.some(d => d.status !== 'IDLE')

  return {
    drones,
    survivors,
    sectors,
    logs,
    disasters,
    boundaries,
    missionTime,
    coverage,
    isPaused,
    isRunning,
    powerFailure,
    setIsPaused,
    setPowerFailure,
    deploySwarm,
    setDroneTarget: useCallback((id: string, x: number, y: number) => {
      userTargetedDronesRef.current.set(id, { x, y, time: Date.now() })
      setDrones(prev => prev.map(d => d.id === id ? { ...d, targetX: x, targetY: y, status: 'SCANNING' } : d))
    }, []),
    // setAgentTarget: used by the autonomous agent (power failure mode).
    // Skips drones with active zone waypoints so the agent doesn't override zone sweeps.
    setAgentTarget: useCallback((id: string, x: number, y: number) => {
      setDrones(prev => prev.map(d => {
        if (d.id !== id) return d
        // Don't override a drone that is mid-zone-sweep
        if (d.waypoints && d.waypoints.length > 0) return d
        // Don't override a drone actively rescuing a disaster
        if (d.missionTargetId) return d
        return { ...d, targetX: x, targetY: y, status: 'SCANNING' as const }
      }))
    }, []),
    recallDrones: useCallback((droneIds: string[], targetX: number, targetY: number) => {
      setDrones(prev => prev.map(d =>
        droneIds.includes(d.id) ? { ...d, targetX, targetY, status: 'RETURNING', waypoints: undefined, waypointIndex: 0 } : d
      ))
    }, []),
    sendDronesToMission: useCallback((droneIds: string[], targetX: number, targetY: number) => {
      setDrones(prev => prev.map(d =>
        droneIds.includes(d.id) ? { ...d, targetX, targetY, status: 'SCANNING' } : d
      ))
    }, []),
    addDisaster,
    addBoundary,
  }
}
