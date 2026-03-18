import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { useSimulation } from '../hooks/useSimulation'
import { useAutonomousAgent } from '../hooks/useAutonomousAgent'
import type { Drone, Survivor, MissionLogEntry, DisasterMarker, BoundaryZone } from '../hooks/useSimulation'
import type { ReasoningStep } from '../hooks/useAgentReasoning'

interface SimulationContextType {
  drones: Drone[]
  survivors: Survivor[]
  sectors: any[]
  logs: MissionLogEntry[]
  missionTime: number
  coverage: number
  isPaused: boolean
  isRunning: boolean
  powerFailure: boolean
  setIsPaused: (paused: boolean) => void
  setPowerFailure: (failed: boolean) => void
  deploySwarm: () => void
  setDroneTarget: (id: string, x: number, y: number) => void
  setAgentTarget: (id: string, x: number, y: number) => void
  recallDrones: (droneIds: string[], targetX: number, targetY: number) => void
  sendDronesToMission: (droneIds: string[], targetX: number, targetY: number) => void
  disasters: DisasterMarker[]
  boundaries: BoundaryZone[]
  addDisaster: (type: 'fire' | 'flood', x: number, y: number) => void
  addBoundary: (points: { x: number; y: number }[], instruction: string) => void
  // Shared agent reasoning log visible across all screens
  agentReasoningSteps: ReasoningStep[]
  pushAgentReasoning: (lines: string[]) => void
}

const SimulationContext = createContext<SimulationContextType | undefined>(undefined)

export const SimulationProvider = ({ children }: { children: ReactNode }) => {
  const fleetSize = parseInt(sessionStorage.getItem('tenxy_fleet_size') || '12')
  const sim = useSimulation(fleetSize)

  // Shared agent reasoning log — appended by useAutonomousAgent when power fails
  const [agentReasoningSteps, setAgentReasoningSteps] = useState<ReasoningStep[]>([])

  const pushAgentReasoning = useCallback((lines: string[]) => {
    const ts = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setAgentReasoningSteps(prev => {
      const newSteps: ReasoningStep[] = lines.map(line => ({
        text: line,
        type: 'analysis' as const,
        timestamp: ts,
        agent: 'claude' as const,
      }))
      return [...newSteps, ...prev].slice(0, 120)
    })
  }, [])

  // Autonomous agent runs at context level so all screens share its decisions.
  // Uses setAgentTarget (not setDroneTarget) so drone movements from the agent
  // don't pollute the user-targeted-drone tracking in useSimulation.
  useAutonomousAgent(
    sim.drones,
    sim.survivors,
    sim.sectors,
    sim.missionTime,
    sim.powerFailure,
    sim.setAgentTarget,
    pushAgentReasoning
  )

  return (
    <SimulationContext.Provider value={{
      drones: sim.drones,
      survivors: sim.survivors,
      sectors: sim.sectors,
      logs: sim.logs,
      missionTime: sim.missionTime,
      coverage: sim.coverage,
      isPaused: sim.isPaused,
      isRunning: sim.isRunning,
      powerFailure: sim.powerFailure,
      setIsPaused: sim.setIsPaused,
      setPowerFailure: sim.setPowerFailure,
      deploySwarm: sim.deploySwarm,
      setDroneTarget: sim.setDroneTarget,
      setAgentTarget: sim.setAgentTarget,
      recallDrones: sim.recallDrones,
      sendDronesToMission: sim.sendDronesToMission,
      disasters: sim.disasters,
      boundaries: sim.boundaries,
      addDisaster: sim.addDisaster,
      addBoundary: sim.addBoundary,
      agentReasoningSteps,
      pushAgentReasoning,
    }}>
      {children}
    </SimulationContext.Provider>
  )
}

export function useSim() {
  const context = useContext(SimulationContext)
  if (context === undefined) {
    throw new Error('useSim must be used within a SimulationProvider')
  }
  return context
}
