import { useState } from 'react'
import { Filter } from 'lucide-react'
import GlowButton from '../shared/GlowButton'
import type { Drone } from '../../hooks/useSimulation'
import styles from './DroneFleetPanel.module.css'

interface DroneFleetPanelProps {
  drones: Drone[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDeploy: () => void
  onRecallSelected?: (ids: string[]) => void
  onDeploySelected?: (ids: string[]) => void
}

export default function DroneFleetPanel({
  drones,
  selectedId,
  onSelect,
  onDeploy,
  onRecallSelected,
  onDeploySelected
}: DroneFleetPanelProps) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [showDeployModal, setShowDeployModal] = useState(false)

  const toggleCheck = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setCheckedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => setCheckedIds(new Set(drones.map(d => d.id)))
  const clearAll = () => setCheckedIds(new Set())

  const checked = Array.from(checkedIds)

  return (
    <div className={styles.panel} style={{ position: 'relative' }}>
      <div className={styles.header}>
        <h2 className={styles.title}>DRONE FLEET LIST</h2>
        <button className={styles.filterBtn}>
          <Filter size={14} />
        </button>
      </div>

      {/* Multi-select quick toolbar */}
      <div style={{ display: 'flex', gap: 4, padding: '4px 8px', borderBottom: '1px solid rgba(0,212,255,0.1)', flexShrink: 0 }}>
        <button onClick={selectAll} style={{ flex: 1, background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.25)', borderRadius: 3, color: '#00d4ff', fontSize: 9, padding: '3px 0', cursor: 'pointer', letterSpacing: 0.5 }}>ALL</button>
        <button onClick={clearAll} style={{ flex: 1, background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 3, color: '#556', fontSize: 9, padding: '3px 0', cursor: 'pointer', letterSpacing: 0.5 }}>NONE</button>
        <span style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: checkedIds.size > 0 ? '#00d4ff' : '#334', fontFamily: 'monospace' }}>
          {checkedIds.size > 0 ? `${checkedIds.size} SELECTED` : 'CLICK ☐ TO SELECT'}
        </span>
      </div>

      <div className={styles.list}>
        {drones.map((drone) => (
          <div
            key={drone.id}
            className={`${styles.card} ${selectedId === drone.id ? styles.selected : ''} ${checkedIds.has(drone.id) ? styles.checked : ''}`}
            onClick={() => onSelect(drone.id)}
          >
            <div className={styles.cardHeader}>
              {/* Checkbox */}
              <div
                onClick={(e) => toggleCheck(drone.id, e)}
                style={{
                  width: 14, height: 14, borderRadius: 3, flexShrink: 0, cursor: 'pointer',
                  border: `1px solid ${checkedIds.has(drone.id) ? '#00d4ff' : 'rgba(0,212,255,0.3)'}`,
                  background: checkedIds.has(drone.id) ? 'rgba(0,212,255,0.3)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginRight: 4, color: '#00d4ff', fontSize: 10
                }}
              >
                {checkedIds.has(drone.id) && '✓'}
              </div>
              <div className={styles.cardName}>
                <img src="/tenxy-dashboard/drone-icon.png" className={styles.cardIconImg} alt="drone" />
                <span>{drone.name}</span>
              </div>
              <span className={`${styles.cardStatus} ${
                drone.status === 'SCANNING' ? styles.statusCyan :
                drone.status === 'RETURNING' ? styles.statusGreen :
                drone.status === 'ALERT' ? styles.statusRed :
                styles.statusDim
              }`}>
                {drone.status}
              </span>
            </div>
            <div className={styles.cardMeta}>
              <span>Battery: {Math.round(drone.battery)}%</span>
              <span>Signal: {drone.battery > 20 ? 'Strong' : 'Weak'}</span>
            </div>
            <div className={styles.batteryTrack}>
              <div
                className={styles.batteryFill}
                style={{
                  width: `${drone.battery}%`,
                  background: drone.battery > 60 ? 'var(--accent-cyan)' :
                              drone.battery > 20 ? 'var(--status-amber)' : 'var(--status-red)',
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Action bar for selected drones */}
      {checkedIds.size > 0 && (
        <div style={{ padding: '6px 8px', borderTop: '1px solid rgba(0,212,255,0.2)', display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => { onRecallSelected?.(checked); clearAll() }}
            style={{ flex: 1, background: 'rgba(255,80,80,0.2)', border: '1px solid rgba(255,80,80,0.6)', borderRadius: 4, color: '#ff8888', fontSize: 9, fontWeight: 700, padding: '5px 0', cursor: 'pointer', letterSpacing: 0.5 }}
          >⬅ RECALL ({checkedIds.size})</button>
          <button
            onClick={() => { onDeploySelected?.(checked); clearAll() }}
            style={{ flex: 1, background: 'rgba(0,212,255,0.15)', border: '1px solid rgba(0,212,255,0.5)', borderRadius: 4, color: '#00d4ff', fontSize: 9, fontWeight: 700, padding: '5px 0', cursor: 'pointer', letterSpacing: 0.5 }}
          >➡ DEPLOY ({checkedIds.size})</button>
        </div>
      )}

      {/* Deploy Mode Modal */}
      {showDeployModal && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(5,10,20,0.96)',
          zIndex: 100, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', padding: 16, gap: 12
        }}>
          <div style={{ color: '#00d4ff', fontSize: 12, fontWeight: 700, letterSpacing: 2, textAlign: 'center', marginBottom: 4 }}>
            SELECT DEPLOY MODE
          </div>
          <p style={{ color: '#8b949e', fontSize: 10, textAlign: 'center', lineHeight: 1.5 }}>
            Choose how the swarm should operate after launch.
          </p>
          {/* Autonomous Mode */}
          <button
            onClick={() => { setShowDeployModal(false); onDeploy() }}
            style={{
              width: '100%', padding: '12px 8px', background: 'rgba(0,212,255,0.12)',
              border: '1px solid rgba(0,212,255,0.6)', borderRadius: 6, cursor: 'pointer',
              textAlign: 'left'
            }}
          >
            <div style={{ color: '#00d4ff', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>🤖 AUTONOMOUS MODE</div>
            <div style={{ color: '#8b949e', fontSize: 9, marginTop: 4 }}>
              All drones sweep the area in a serpentine grid, detect survivors autonomously, and self-assign missions.
            </div>
          </button>
          {/* Planning Mode */}
          <button
            onClick={() => {
              setShowDeployModal(false)
              // Enter planning mode: select all drones and let user assign via checkboxes
              setCheckedIds(new Set(drones.map(d => d.id)))
            }}
            style={{
              width: '100%', padding: '12px 8px', background: 'rgba(255,170,0,0.08)',
              border: '1px solid rgba(255,170,0,0.5)', borderRadius: 6, cursor: 'pointer',
              textAlign: 'left'
            }}
          >
            <div style={{ color: '#ffaa00', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>📋 PLANNING MODE</div>
            <div style={{ color: '#8b949e', fontSize: 9, marginTop: 4 }}>
              Select specific drones with checkboxes and use DEPLOY to assign them to target locations on the map.
            </div>
          </button>
          <button
            onClick={() => setShowDeployModal(false)}
            style={{ background: 'transparent', border: 'none', color: '#556', fontSize: 10, cursor: 'pointer', marginTop: 4 }}
          >✕ CANCEL</button>
        </div>
      )}

      <div className={styles.footer} style={{ position: 'relative' }}>
        <GlowButton fullWidth onClick={() => setShowDeployModal(true)}>
          {drones.some(d => d.status !== 'IDLE') ? 'RE-SCAN SECTORS' : 'DEPLOY SWARM'}
        </GlowButton>
        <div className={styles.footerStats}>
          <div className={styles.footerStat}>
            <span className={styles.footerLabel}>SIGNAL INTEGRITY</span>
            <span className={styles.footerValue}>98.2 ms</span>
          </div>
          <span className={styles.footerLabel}>LATENCY</span>
        </div>
      </div>
    </div>
  )
}
