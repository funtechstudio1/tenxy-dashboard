import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Battery, Gauge, Wind, MapPin, Shield, Activity, Radio, Cpu } from 'lucide-react'
import { useSim } from '../context/SimulationContext'
import MapboxDroneCamera from '../components/detail/MapboxDroneCamera'
import GlowButton from '../components/shared/GlowButton'
import styles from './DroneDetailScreen.module.css'

export default function DroneDetailScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { drones, setDroneTarget, disasters } = useSim()

  const drone = drones.find(d => d.id === id)

  const handleRerouteToBase = () => {
    if (drone && setDroneTarget) {
      // Use user GPS if available, else fall back to grid center
      const userLat = parseFloat(sessionStorage.getItem('tenxy_user_lat') || '')
      const userLon = parseFloat(sessionStorage.getItem('tenxy_user_lon') || '')
      const centerLat = parseFloat(sessionStorage.getItem('tenxy_center_lat') || '') || 11.2435
      const centerLon = parseFloat(sessionStorage.getItem('tenxy_center_lon') || '') || 125.0062
      const GRID_SCALE = 0.04
      const tx = isFinite(userLon) ? (userLon - centerLon) / GRID_SCALE + 0.5 : 0.5
      const ty = isFinite(userLat) ? -(userLat - centerLat) / GRID_SCALE + 0.5 : 0.5
      setDroneTarget(drone.id, Math.max(0, Math.min(1, tx)), Math.max(0, Math.min(1, ty)))
      setTimeout(() => navigate('/dashboard'), 500)
    }
  }

  if (!drone) {
    return (
      <div className={styles.errorScreen}>
        <h2>DRONE NOT FOUND</h2>
        <GlowButton onClick={() => navigate('/dashboard')}>RETURN TO COMMAND</GlowButton>
      </div>
    )
  }

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={20} />
          </button>
          <div className={styles.titleGroup}>
            <h1 className={styles.title}>UNIT: {drone.name}</h1>
            <span className={styles.subtitle}>TACTICAL HUD | SECTOR G-9</span>
          </div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.headerStat}>
            <span className={styles.headerStatLabel}>STATUS</span>
            <span className={`${styles.headerStatValue} ${styles[drone.status]}`}>{drone.status}</span>
          </div>
          <div className={styles.headerStat}>
            <span className={styles.headerStatLabel}>SIGNAL</span>
            <span className={styles.headerStatValue}>98.4%</span>
          </div>
          <GlowButton variant="danger" onClick={handleRerouteToBase}>REROUTE TO BASE</GlowButton>
        </div>
      </header>

      <main className={styles.grid}>
        {/* Visual HUD Section — Live Cesium nadir camera */}
        <section className={styles.visualHud}>
          <div className={styles.hudContainer} style={{ position: 'relative', overflow: 'hidden' }}>
            <MapboxDroneCamera drone={drone} disasters={disasters} />
            {/* HUD Overlay on top of live camera */}
            <div className={styles.hudOverlay} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              <div className={styles.hudCorner + ' ' + styles.topL} />
              <div className={styles.hudCorner + ' ' + styles.topR} />
              <div className={styles.hudCorner + ' ' + styles.botL} />
              <div className={styles.hudCorner + ' ' + styles.botR} />
              <div className={styles.hudCenter}>
                <div className={styles.crosshair} />
              </div>
              <div className={styles.hudBottom}>
                <div className={styles.compass}>
                  <span>ALT: {drone.altitude.toFixed(0)}m</span>
                  <span className={styles.activeDeg}>{drone.status}</span>
                  <span>SPD: {drone.speed.toFixed(1)}m/s</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Telemetry Sidebar */}
        <aside className={styles.telemetry}>
          <div className={styles.sectionHeader}>
            <Activity size={16} />
            <span>LIVE TELEMETRY</span>
          </div>

          <div className={styles.telemetryCard}>
            <div className={styles.telRow}>
              <Battery size={18} className={styles.telIcon} />
              <div className={styles.telData}>
                <span className={styles.telLabel}>BATTERY LEVEL</span>
                <span className={styles.telValue}>{drone.battery}%</span>
              </div>
            </div>
            <div className={styles.batteryBar}>
              <div 
                className={styles.batteryFill} 
                style={{ width: `${drone.battery}%`, background: drone.battery < 20 ? 'var(--status-red)' : 'var(--accent-cyan)' }} 
              />
            </div>
          </div>

          <div className={styles.telemetryGrid}>
            <div className={styles.telItem}>
              <Gauge size={16} />
              <span className={styles.telItemLabel}>G-SPEED</span>
              <span className={styles.telItemValue}>{drone.speed.toFixed(1)} m/s</span>
            </div>
            <div className={styles.telItem}>
              <Wind size={16} />
              <span className={styles.telItemLabel}>ALTITUDE</span>
              <span className={styles.telItemValue}>{drone.altitude.toFixed(0)}m</span>
            </div>
            <div className={styles.telItem}>
              <Shield size={16} />
              <span className={styles.telItemLabel}>CORE TEMP</span>
              <span className={styles.telItemValue}>{drone.temp.toFixed(1)}°C</span>
            </div>
            <div className={styles.telItem}>
              <Radio size={16} />
              <span className={styles.telItemLabel}>BANDWIDTH</span>
              <span className={styles.telItemValue}>12 MB/s</span>
            </div>
          </div>

          <div className={styles.coordsCard}>
            <div className={styles.telRow}>
              <MapPin size={18} className={styles.telIcon} />
              <div className={styles.telData}>
                <span className={styles.telLabel}>GPS COORDINATES</span>
                <span className={styles.telValue}>{drone.x.toFixed(6)}°N, {drone.y.toFixed(6)}°W</span>
              </div>
            </div>
          </div>

          <div className={styles.aiDiagnostic}>
            <div className={styles.sectionHeader}>
              <Cpu size={16} />
              <span>AI DIAGNOSTIC</span>
            </div>
            <div className={styles.diagnosticLog}>
              <p>[09:24:12] Path optimization: SUCCEEDED</p>
              <p>[09:24:15] Object detection: ACTIVE</p>
              <p>[09:24:18] Swarm priority: BALANCED</p>
              <p className={styles.activeDiag}>[LIVE] ANALYZING TERRAIN FEATURES...</p>
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}
