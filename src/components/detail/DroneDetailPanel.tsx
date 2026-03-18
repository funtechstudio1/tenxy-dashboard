import { Link } from 'react-router-dom'
import { Activity, Zap, Thermometer, ArrowUp, Navigation, Maximize2 } from 'lucide-react'
import type { Drone, DisasterMarker } from '../../hooks/useSimulation'
import MapboxDroneCamera from './MapboxDroneCamera'
import styles from './DroneDetailPanel.module.css'

interface DroneDetailPanelProps {
  drone: Drone
  disasters?: DisasterMarker[]
}

export default function DroneDetailPanel({ drone, disasters = [] }: DroneDetailPanelProps) {

  if (!drone) return <div className={styles.panel}>No unit selected</div>

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <div className={styles.indicator} />
          <h2 className={styles.title}>SELECTED UNIT: {drone.name}</h2>
        </div>
        <Link to={`/drone/${drone.id}`} className={styles.detailLink}>
          <Maximize2 size={12} />
          <span>FULL HUD</span>
        </Link>
      </div>

      <div className={styles.feedContainer}>
        <MapboxDroneCamera drone={drone} disasters={disasters} />
      </div>

      <div className={styles.stats}>
        <div className={styles.statLine}>
          <div className={styles.statLabel}>
            <Zap size={14} />
            <span>BATTERY</span>
          </div>
          <div className={styles.statValue}>{drone.battery}%</div>
        </div>
        <div className={styles.statLine}>
          <div className={styles.statLabel}>
            <Thermometer size={14} />
            <span>CORE TEMP</span>
          </div>
          <div className={styles.statValue}>{drone.temp.toFixed(1)}°C</div>
        </div>
        <div className={styles.statLine}>
          <div className={styles.statLabel}>
            <ArrowUp size={14} />
            <span>ALTITUDE</span>
          </div>
          <div className={styles.statValue}>{drone.altitude.toFixed(0)}m</div>
        </div>
        <div className={styles.statLine}>
          <div className={styles.statLabel}>
            <Activity size={14} />
            <span>G-SPEED</span>
          </div>
          <div className={styles.statValue}>{drone.speed.toFixed(1)}m/s</div>
        </div>
        <div className={styles.statLine}>
          <div className={styles.statLabel}>
            <Navigation size={14} />
            <span>COORDINATES</span>
          </div>
          <div className={styles.statValue}>
            {drone.x.toFixed(4)}, {drone.y.toFixed(4)}
          </div>
        </div>
      </div>
    </div>
  )
}
