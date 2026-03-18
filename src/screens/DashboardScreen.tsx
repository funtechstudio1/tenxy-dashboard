import { useState } from 'react'
import TopBar from '../components/layout/TopBar'
import BottomBar from '../components/layout/BottomBar'
import DroneFleetPanel from '../components/fleet/DroneFleetPanel'
import DisasterZoneMap from '../components/map/DisasterZoneMap'
import DroneDetailPanel from '../components/detail/DroneDetailPanel'
import AgentReasoningLog from '../components/reasoning/AgentReasoningLog'
import DraggablePanel from '../components/shared/DraggablePanel'
import { useSim } from '../context/SimulationContext'
import styles from './DashboardScreen.module.css'

const GRID_SCALE = 0.04

function getHelpadTarget() {
  const cLat = parseFloat(sessionStorage.getItem('tenxy_center_lat') || '') || 11.2435
  const cLon = parseFloat(sessionStorage.getItem('tenxy_center_lon') || '') || 125.0062
  const uLat = parseFloat(sessionStorage.getItem('tenxy_user_lat') || '')
  const uLon = parseFloat(sessionStorage.getItem('tenxy_user_lon') || '')
  const tx = isFinite(uLon) ? Math.max(0, Math.min(1, (uLon - cLon) / GRID_SCALE + 0.5)) : 0.5
  const ty = isFinite(uLat) ? Math.max(0, Math.min(1, -(uLat - cLat) / GRID_SCALE + 0.5)) : 0.5
  return { tx, ty }
}

export default function DashboardScreen() {
  const {
    drones,
    survivors,
    sectors,
    logs,
    disasters,
    boundaries,
    missionTime,
    coverage,
    isRunning,
    deploySwarm,
    setDroneTarget,
    recallDrones,
    sendDronesToMission,
    addDisaster,
    addBoundary,
    agentReasoningSteps,
  } = useSim()

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0')
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${h}:${m}:${s}`
  }

  const [selectedDroneId, setSelectedDroneId] = useState<string | null>(null)
  const selectedDrone = drones.find(d => d.id === selectedDroneId) || drones[0]

  const handleRecallSelected = (ids: string[]) => {
    const { tx, ty } = getHelpadTarget()
    recallDrones(ids, tx, ty)
  }

  const handleDeploySelected = (ids: string[]) => {
    const { tx, ty } = getHelpadTarget()
    sendDronesToMission(ids, tx, ty)
  }

  return (
    <div className={styles.dashboard}>
      <TopBar
        missionName="OPERATION AZURE SHIELD"
        droneCount={drones.length}
        missionTime={formatTime(missionTime)}
        areaCoverage={coverage}
        alertCount={logs.filter(l => l.type === 'alert').length}
        alerts={logs.filter(l => l.type === 'alert')}
      />

      {/* Main area: map fills full space, panels float over it */}
      <div className={styles.main}>
        {/* Full-area map */}
        <DisasterZoneMap
          drones={drones}
          survivors={survivors}
          sectors={sectors}
          disasters={disasters}
          boundaries={boundaries}
          selectedDroneId={selectedDroneId}
          onSelectDrone={setSelectedDroneId}
          onSetTarget={setDroneTarget}
          onRecallDrones={recallDrones}
          onSendMission={sendDronesToMission}
          onAddDisaster={addDisaster}
          onAddBoundary={addBoundary}
        />

        {/* Left floating panel: Drone Fleet */}
        <DraggablePanel
          title="DRONE FLEET LIST"
          defaultPos={{ x: 12, y: 8 }}
          defaultWidth={252}
        >
          <DroneFleetPanel
            drones={drones}
            selectedId={selectedDroneId}
            onSelect={setSelectedDroneId}
            onDeploy={deploySwarm}
            onRecallSelected={handleRecallSelected}
            onDeploySelected={handleDeploySelected}
          />
        </DraggablePanel>

        {/* Right floating panel: Drone Detail + AI Reasoning */}
        <DraggablePanel
          title="SELECTED UNIT HUD"
          defaultPos={{ x: typeof window !== 'undefined' ? window.innerWidth - 272 : 900, y: 8 }}
          defaultWidth={260}
        >
          <DroneDetailPanel drone={selectedDrone} disasters={disasters} />
          <AgentReasoningLog
            drones={drones}
            survivors={survivors}
            isRunning={isRunning}
            disasters={disasters}
            boundaries={boundaries}
            extraSteps={agentReasoningSteps}
          />
        </DraggablePanel>
      </div>

      <BottomBar logs={logs} />
    </div>
  )
}
