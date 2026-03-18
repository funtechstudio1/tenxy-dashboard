import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Settings, AlertTriangle, FileText, Activity, X } from 'lucide-react'
import type { MissionLogEntry } from '../../hooks/useSimulation'
import styles from './TopBar.module.css'

interface TopBarProps {
  missionName?: string
  droneCount?: number
  missionTime?: string
  areaCoverage?: number
  alertCount?: number
  alerts?: MissionLogEntry[]
}

export default function TopBar({
  missionName = 'OPERATION AZURE SHIELD',
  droneCount = 12,
  missionTime = '00:00:00',
  areaCoverage = 0,
  alertCount = 0,
  alerts = [],
}: TopBarProps) {
  const navigate = useNavigate()
  const [showAlertPanel, setShowAlertPanel] = useState(false)

  return (
    <header className={styles.topbar} style={{ position: 'relative' }}>
      <div className={styles.brand}>
        <Shield className={styles.brandIcon} />
        <div className={styles.brandText}>
          <span className={styles.brandName}>{missionName}</span>
          <span className={styles.brandStatus}>
            <span className={styles.dot} />
            SYSTEM STATUS: ACTIVE
          </span>
        </div>
      </div>

      <div className={styles.stats}>
        <div className={styles.statItem}>
          <div className={styles.statLabel}>Total Swarm</div>
          <div className={styles.statValue}>{droneCount} DRONES</div>
        </div>
        <div className={styles.statItem}>
          <div className={styles.statLabel}>Mission Clock</div>
          <div className={styles.statValue}>{missionTime}</div>
        </div>
        <div className={styles.statItem}>
          <div className={styles.statLabel}>Area Coverage</div>
          <div className={styles.statValue}>{areaCoverage.toFixed(1)}%</div>
        </div>
      </div>

      <div className={styles.actions}>
        {alertCount > 0 && (
          <button
            className={styles.alertBtn}
            onClick={() => setShowAlertPanel(v => !v)}
            title="View alert log"
          >
            <AlertTriangle size={14} />
            ALERTS ({alertCount})
          </button>
        )}
        <button className={styles.debriefBtn} onClick={() => navigate('/agent-reasoning')} title="Agent Reasoning Log">
          <Activity size={16} />
          <span>MISSION LOG</span>
        </button>
        <button className={styles.debriefBtn} onClick={() => navigate('/summary')}>
          <FileText size={16} />
          <span>DEBRIEF</span>
        </button>
        <button className={styles.iconBtn} onClick={() => navigate('/agent')} title="Autonomous Command Core">
          <Settings size={18} />
        </button>
      </div>

      {/* Alert dropdown panel */}
      {showAlertPanel && (
        <div style={{
          position: 'absolute', top: '100%', right: 16, width: 380, maxHeight: 420,
          background: 'rgba(8,12,22,0.97)', border: '1px solid rgba(255,59,59,0.5)',
          borderTop: '2px solid #ff3b3b', zIndex: 1000,
          boxShadow: '0 8px 32px rgba(0,0,0,0.8), 0 0 20px rgba(255,59,59,0.15)',
          display: 'flex', flexDirection: 'column'
        }}>
          {/* Panel header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid rgba(255,59,59,0.3)', background: 'rgba(255,59,59,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={14} color="#ff3b3b" />
              <span style={{ color: '#ff3b3b', fontSize: 11, fontWeight: 700, letterSpacing: 1, fontFamily: 'monospace' }}>ALERT LOG — {alerts.length} EVENTS</span>
            </div>
            <button onClick={() => setShowAlertPanel(false)} style={{ background: 'none', border: 'none', color: '#556', cursor: 'pointer', padding: 2 }}>
              <X size={14} />
            </button>
          </div>

          {/* Alert list */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
            {alerts.length === 0 ? (
              <div style={{ padding: '16px 12px', color: '#445', fontSize: 11, fontFamily: 'monospace', textAlign: 'center' }}>
                No alerts recorded.
              </div>
            ) : (
              alerts.map((a, i) => (
                <div key={i} style={{
                  padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                  display: 'flex', gap: 10, alignItems: 'flex-start'
                }}>
                  <span style={{ color: '#ff7755', fontSize: 9, fontFamily: 'monospace', whiteSpace: 'nowrap', marginTop: 1 }}>[{a.time}]</span>
                  <span style={{ color: '#ffbbaa', fontSize: 10, fontFamily: 'monospace', lineHeight: 1.4 }}>{a.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </header>
  )
}
