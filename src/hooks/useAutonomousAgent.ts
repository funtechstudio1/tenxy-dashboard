/**
 * useAutonomousAgent — Blackout / Power-Failure autonomous swarm intelligence.
 *
 * When the base station goes offline the drones lose all external telemetry:
 *  • No knowledge of placed disasters (fire/flood markers)
 *  • No remote waypoint commands from the operator
 *  • No live map feed
 *
 * Each drone therefore operates from its own on-board sensors:
 *  • Systematic serpentine grid sweep to ensure full coverage
 *  • Proximity-based survivor/heat detection (scan radius ~0.08 grid units)
 *  • Individual battery management — return to helipad when critical
 *  • Chain-of-thought reasoning logged per iteration
 */

import { useEffect, useRef } from 'react'
import type { Drone, Survivor, Sector } from './useSimulation'

// Detection radius in normalised grid units (≈ 360 m at GRID_SCALE 0.04)
const SCAN_RADIUS = 0.08
// How many grid columns the serpentine sweep uses
const SWEEP_COLS = 5
// Minimum battery before returning to helipad
const CRITICAL_BATTERY = 18

/** Build a full serpentine sweep path across the grid.
 *  Restricted to [0.2, 0.8] so corner waypoints are ≤0.34 units from center,
 *  within the drone's max safe round-trip range of ~0.476 units.
 */
function buildSweepPath(): { x: number; y: number }[] {
  const path: { x: number; y: number }[] = []
  const SWEEP_START = 0.2
  const SWEEP_END = 0.8
  const rows = SWEEP_COLS
  const cellW = (SWEEP_END - SWEEP_START) / SWEEP_COLS
  const cellH = (SWEEP_END - SWEEP_START) / rows
  for (let r = 0; r < rows; r++) {
    const cols = r % 2 === 0
      ? Array.from({ length: SWEEP_COLS }, (_, c) => c)
      : Array.from({ length: SWEEP_COLS }, (_, c) => SWEEP_COLS - 1 - c)
    for (const c of cols) {
      path.push({
        x: SWEEP_START + c * cellW + cellW / 2,
        y: SWEEP_START + r * cellH + cellH / 2,
      })
    }
  }
  return path
}

const SWEEP_PATH = buildSweepPath() // 25 waypoints, pre-computed once

export function useAutonomousAgent(
  drones: Drone[],
  survivors: Survivor[],
  sectors: Sector[],
  _missionTime: number,
  powerFailure: boolean,
  setDroneTarget: (id: string, x: number, y: number) => void,
  pushAgentReasoning?: (lines: string[]) => void
) {
  const iterationRef = useRef(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Per-drone sweep cursor — index into SWEEP_PATH
  const sweepCursorRef = useRef<Map<string, number>>(new Map())
  // Drones currently in rescue mode (assigned to a survivor)
  const rescuingRef = useRef<Set<string>>(new Set())

  const stateRef = useRef({ drones, survivors, sectors })
  const callbackRef = useRef({ setDroneTarget, pushAgentReasoning })

  stateRef.current = { drones, survivors, sectors }
  callbackRef.current = { setDroneTarget, pushAgentReasoning }

  useEffect(() => {
    if (!powerFailure) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      // Reset per-drone state when power is restored
      sweepCursorRef.current.clear()
      rescuingRef.current.clear()
      return
    }

    const runDecisionCycle = () => {
      const { drones: d, survivors: s } = stateRef.current
      const { setDroneTarget: route, pushAgentReasoning: push } = callbackRef.current
      iterationRef.current += 1
      const iter = iterationRef.current

      const reasoningLog: string[] = []

      reasoningLog.push(
        `[BLACKOUT MODE] Iteration ${iter} — Base station OFFLINE`,
        `Drones operating on autonomous protocols. No external telemetry.`,
        `Fleet: ${d.length} units | Known contacts: ${s.length} survivors`,
        '──────────────────────────────────────────────'
      )

      const commands: { id: string; x: number; y: number; reason: string }[] = []

      for (const drone of d) {
        // Skip drones that are charging (they're docked and recharging)
        if (drone.status === 'CHARGING') continue
        // Skip ALERT drones — they're responding to placed disasters, don't override rescue
        if (drone.status === 'ALERT') continue
        // Skip drones that are mid zone-sweep — they have their own waypoint path
        if (drone.waypoints && drone.waypoints.length > 0) continue
        // IDLE drones ARE commanded during power failure — they need to start sweeping

        // ── 1. CRITICAL BATTERY — return to helipad regardless ──────────
        if (drone.battery < CRITICAL_BATTERY && drone.status !== 'RETURNING') {
          const slotX = drone.slotX ?? 0.5
          const slotY = drone.slotY ?? 0.5
          commands.push({ id: drone.id, x: slotX, y: slotY, reason: `BATTERY ${drone.battery.toFixed(0)}% — RETURNING TO HELIPAD` })
          rescuingRef.current.delete(drone.id)
          reasoningLog.push(
            `[${drone.name}] CRITICAL: Battery ${drone.battery.toFixed(0)}% < ${CRITICAL_BATTERY}%. ` +
            `Aborting mission. Returning to helipad slot (${slotX.toFixed(2)}, ${slotY.toFixed(2)}).`
          )
          continue
        }

        // Already returning — let the simulation handle it
        if (drone.status === 'RETURNING') {
          reasoningLog.push(`[${drone.name}] Returning to helipad. Battery: ${drone.battery.toFixed(0)}%.`)
          continue
        }

        // ── 2. PROXIMITY SCAN — detect nearby survivors ─────────────────
        const nearby = s.filter(sv => {
          const dx = sv.x - drone.x
          const dy = sv.y - drone.y
          return Math.sqrt(dx * dx + dy * dy) < SCAN_RADIUS
        })

        if (nearby.length > 0) {
          // Pick closest survivor not already being covered by multiple drones
          const target = nearby.reduce((closest, sv) => {
            const da = Math.hypot(sv.x - drone.x, sv.y - drone.y)
            const dc = Math.hypot(closest.x - drone.x, closest.y - drone.y)
            return da < dc ? sv : closest
          })

          rescuingRef.current.add(drone.id)
          commands.push({
            id: drone.id,
            x: target.x + (Math.random() - 0.5) * 0.02,
            y: target.y + (Math.random() - 0.5) * 0.02,
            reason: `SURVIVOR DETECTED (${target.id}) at range ${Math.hypot(target.x - drone.x, target.y - drone.y).toFixed(3)}`
          })
          reasoningLog.push(
            `[${drone.name}] Thermal/acoustic contact: ${target.id}. ` +
            `Distance: ${Math.hypot(target.x - drone.x, target.y - drone.y).toFixed(3)} units. ` +
            `No base confirmation available. Engaging autonomously. Battery: ${drone.battery.toFixed(0)}%.`
          )
          continue
        }

        // Left rescue mode if survivor gone
        rescuingRef.current.delete(drone.id)

        // ── 3. SERPENTINE GRID SWEEP ─────────────────────────────────────
        // Assign a unique sweep lane offset per drone so drones don't overlap
        const droneIndex = d.indexOf(drone)
        const laneOffset = droneIndex % SWEEP_PATH.length

        // Get current sweep cursor for this drone
        let cursor = sweepCursorRef.current.get(drone.id) ?? (laneOffset % SWEEP_PATH.length)

        // Check if close enough to current waypoint to advance
        const wp = SWEEP_PATH[cursor]
        const distToWp = Math.hypot(drone.x - wp.x, drone.y - wp.y)
        if (distToWp < 0.06) {
          // Reached waypoint — advance to next, wrapping around
          cursor = (cursor + 1) % SWEEP_PATH.length
          sweepCursorRef.current.set(drone.id, cursor)
        }

        const nextWp = SWEEP_PATH[cursor]
        commands.push({
          id: drone.id,
          x: nextWp.x,
          y: nextWp.y,
          reason: `SWEEP waypoint ${cursor + 1}/${SWEEP_PATH.length} (${nextWp.x.toFixed(2)}, ${nextWp.y.toFixed(2)})`
        })
        reasoningLog.push(
          `[${drone.name}] No contacts. Systematic sweep — waypoint ${cursor + 1}/${SWEEP_PATH.length}. ` +
          `Sector (${nextWp.x.toFixed(2)}, ${nextWp.y.toFixed(2)}). Battery: ${drone.battery.toFixed(0)}%. ` +
          `Base station: OFFLINE. Operating on last known grid.`
        )
      }

      // ── TRANSMIT COMMANDS ──────────────────────────────────────────────
      commands.forEach(cmd => route(cmd.id, cmd.x, cmd.y))

      reasoningLog.push(
        '──────────────────────────────────────────────',
        `[EXECUTE] ${commands.length} autonomous commands issued.`,
        `MESA ABM physics engine processing movement. Next decision cycle in 5s.`
      )

      push?.(reasoningLog)
    }

    runDecisionCycle()
    intervalRef.current = setInterval(runDecisionCycle, 5000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [powerFailure])
}
