import { useState, useEffect, useRef } from 'react'
import type { Drone, Survivor, DisasterMarker, BoundaryZone } from './useSimulation'

export type AgentKey = 'claude' | 'mesa' | 'autogen' | 'langchain' | 'fastmcp'

export const AGENT_LABELS: Record<AgentKey, { name: string; tag: string; color: string }> = {
  claude:    { name: 'Claude',          tag: 'MCP AGENT',   color: '#00d4ff' },
  mesa:      { name: 'Mesa ABM',        tag: 'PHYSICS SIM', color: '#f87171' },
  autogen:   { name: 'AutoGen',         tag: 'GROUP CHAT',  color: '#fb923c' },
  langchain: { name: 'LangChain ReAct', tag: 'REACT AGENT', color: '#4ade80' },
  fastmcp:   { name: 'FastMCP',         tag: 'MCP SERVER',  color: '#a78bfa' },
}

export interface ReasoningStep {
  text: string
  type: 'analysis' | 'strategy' | 'action' | 'detection'
  timestamp: string
  agent: AgentKey
}

/**
 * Produces agent reasoning entries ONLY from real simulation events:
 * - A new survivor is detected (random spawn counts as real detection)
 * - A disaster marker is placed by the operator
 * - A boundary zone is assigned
 * - A drone drops to critical battery
 * - A drone status changes to ALERT
 *
 * No random/fake "strategic update" messages are generated.
 */
export function useAgentReasoning(
  drones: Drone[],
  survivors: Survivor[],
  isRunning: boolean,
  disasters: DisasterMarker[] = [],
  boundaries: BoundaryZone[] = [],
) {
  const [steps, setSteps] = useState<ReasoningStep[]>([])
  const [isThinking, setIsThinking] = useState(false)

  const prevSurvivorCount = useRef(0)
  const prevDisasterIds = useRef<Set<string>>(new Set())
  const prevBoundaryIds = useRef<Set<string>>(new Set())
  const alertedDroneIds = useRef<Set<string>>(new Set())
  const lowBatteryDroneIds = useRef<Set<string>>(new Set())
  const zoneProgressRef = useRef<Record<string, number>>({})
  const prevZoneIdRef = useRef<Record<string, string | undefined>>({})
  const prevStatusRef = useRef<Record<string, string>>({})

  const addStep = (text: string, type: ReasoningStep['type'], agent: AgentKey) => {
    const ts = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setSteps(prev => [{ text, type, agent, timestamp: ts }, ...prev].slice(0, 80))
  }

  // Survivor detection — fires when a new survivor enters the survivors array
  useEffect(() => {
    if (!isRunning) return
    const newCount = survivors.length
    if (newCount <= prevSurvivorCount.current) {
      prevSurvivorCount.current = newCount
      return
    }
    const newSurvivors = survivors.slice(prevSurvivorCount.current)
    prevSurvivorCount.current = newCount

    newSurvivors.forEach(s => {
      setIsThinking(true)
      setTimeout(() => {
        addStep(
          `Thermal anomaly detected at normalized grid (${s.x.toFixed(3)}, ${s.y.toFixed(3)}). Sensor confidence: high. Flagged for drone verification.`,
          'detection', 'mesa'
        )
        addStep(
          `[thermal_scan(${s.id})] Routing nearest available unit for optical close-up. ETA computing.`,
          'action', 'fastmcp'
        )
        setIsThinking(false)
      }, 800)
    })
  }, [survivors, isRunning])

  // Disaster placed by operator
  useEffect(() => {
    if (!isRunning) return
    disasters.forEach(d => {
      if (prevDisasterIds.current.has(d.id)) return
      prevDisasterIds.current.add(d.id)
      setIsThinking(true)
      setTimeout(() => {
        addStep(
          `Operator placed ${d.type.toUpperCase()} disaster marker at grid (${d.x.toFixed(3)}, ${d.y.toFixed(3)}). Dispatching 2 nearest units.`,
          'action', 'langchain'
        )
        addStep(
          `[route_drone_to_position] ALERT status set on nearest drones. Swarm re-routing in progress.`,
          'action', 'fastmcp'
        )
        setIsThinking(false)
      }, 600)
    })
  }, [disasters, isRunning])

  // Boundary zone assigned
  useEffect(() => {
    if (!isRunning) return
    boundaries.forEach(b => {
      if (prevBoundaryIds.current.has(b.id)) return
      prevBoundaryIds.current.add(b.id)
      setIsThinking(true)
      setTimeout(() => {
        const droneCount = b.sweepPaths?.length ?? 3
        const wpCount = b.sweepPaths?.[0]?.length ?? '?'
        addStep(
          `Operator defined zone "${b.instruction}" (${b.points.length} pts). Assigning ${droneCount} drones — ${wpCount} waypoints each. Lawnmower sweep initiated.`,
          'strategy', 'autogen'
        )
        setIsThinking(false)
      }, 500)
    })
  }, [boundaries, isRunning])

  // ALERT drones (dispatched to disaster)
  useEffect(() => {
    if (!isRunning) return
    drones.filter(d => d.status === 'ALERT').forEach(d => {
      if (alertedDroneIds.current.has(d.id)) return
      alertedDroneIds.current.add(d.id)
      addStep(
        `${d.name} status → ALERT. Unit vectoring to disaster coordinates. Live feed active.`,
        'action', 'claude'
      )
    })
    // Clear alert tracking when drone leaves ALERT
    alertedDroneIds.current.forEach(id => {
      const drone = drones.find(d => d.id === id)
      if (drone && drone.status !== 'ALERT') alertedDroneIds.current.delete(id)
    })
  }, [drones, isRunning])

  // Critical battery
  useEffect(() => {
    if (!isRunning) return
    drones.forEach(d => {
      const isCritical = d.battery < 18 && d.status !== 'CHARGING'
      if (isCritical && !lowBatteryDroneIds.current.has(d.id)) {
        lowBatteryDroneIds.current.add(d.id)
        addStep(
          `${d.name} battery at ${d.battery.toFixed(0)}%. Below safe threshold. Auto-return protocol initiated.`,
          'analysis', 'autogen'
        )
      }
      // Clear once charging
      if (d.status === 'CHARGING') lowBatteryDroneIds.current.delete(d.id)
    })
  }, [drones, isRunning])

  // Zone sweep progress milestones (25 / 50 / 75%)
  useEffect(() => {
    if (!isRunning) return
    drones.forEach(d => {
      if (d.status !== 'SCANNING' || !d.zoneId || !d.waypoints || d.waypoints.length === 0) return
      const pct = Math.round(((d.waypointIndex ?? 0) / d.waypoints.length) * 100)
      const milestones = [25, 50, 75]
      milestones.forEach(m => {
        const key = `${d.id}-${d.zoneId}-${m}`
        if (pct >= m && !zoneProgressRef.current[key]) {
          zoneProgressRef.current[key] = 1
          addStep(
            `${d.name}: Zone coverage ${m}% — ${d.waypoints!.length - (d.waypointIndex ?? 0)} waypoints remaining.`,
            'analysis', 'langchain'
          )
        }
      })
    })
  }, [drones, isRunning])

  // Zone sweep complete → RTB
  useEffect(() => {
    if (!isRunning) return
    drones.forEach(d => {
      const prev = prevZoneIdRef.current[d.id]
      if (prev && !d.zoneId && d.status === 'RETURNING') {
        addStep(
          `${d.name}: Zone sweep complete. All assigned waypoints covered. Initiating RTB to home base.`,
          'action', 'claude'
        )
      }
      prevZoneIdRef.current[d.id] = d.zoneId
    })
  }, [drones, isRunning])

  // Drone recharged and ready
  useEffect(() => {
    if (!isRunning) return
    drones.forEach(d => {
      const prev = prevStatusRef.current[d.id]
      if (prev === 'CHARGING' && d.status === 'IDLE') {
        addStep(
          `${d.name}: Recharge complete (100%). Unit standing by at base. Ready for next deployment.`,
          'action', 'fastmcp'
        )
      }
      prevStatusRef.current[d.id] = d.status
    })
  }, [drones, isRunning])

  return { steps, isThinking }
}
