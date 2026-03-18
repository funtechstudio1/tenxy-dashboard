import { useState } from 'react'
import AgentReasoningLog from '../components/reasoning/AgentReasoningLog'
import { useSim } from '../context/SimulationContext'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import styles from './AgentAutonomyScreen.module.css'

export default function AgentAutonomyScreen() {
  const { drones, survivors, isRunning, powerFailure, setPowerFailure, disasters, boundaries, agentReasoningSteps } = useSim()
  const [expandedDrone, setExpandedDrone] = useState<string | null>(null)
  const navigate = useNavigate()

  const activeDrones = drones.filter(d => d.status === 'SCANNING' || d.status === 'ALERT' || d.status === 'DEPLOYING')
  const criticalDrones = drones.filter(d => d.battery < 20)

  // Live decision tree derived from real simulation state
  const decisionTree = [
    {
      id: 1,
      title: 'ANALYZE SWARM STATE',
      status: `${drones.length} UNITS | ${activeDrones.length} ACTIVE`,
      color: '#00d4ff'
    },
    {
      id: 2,
      title: 'ASSESS SURVIVOR LOCATIONS',
      status: survivors.length > 0 ? `${survivors.length} DETECTED` : 'NONE DETECTED',
      color: survivors.length > 0 ? '#ff6b35' : '#00d4ff'
    },
    {
      id: 3,
      title: 'CALCULATE COVERAGE ZONES',
      status: criticalDrones.length > 0 ? `${criticalDrones.length} CRITICAL BATT` : 'NOMINAL',
      color: criticalDrones.length > 0 ? '#ff5252' : '#00d4ff'
    },
    {
      id: 4,
      title: powerFailure ? 'AUTONOMOUS MODE: ACTIVE' : 'HUMAN OVERRIDE: AVAILABLE',
      status: powerFailure ? 'BLACKOUT ENGAGED' : 'STANDBY',
      color: powerFailure ? '#ff5252' : '#ffd700'
    },
    {
      id: 5,
      title: 'GENERATE TASK DISTRIBUTION',
      status: activeDrones.length > 0 ? `${activeDrones.length} TASKS DISPATCHED` : 'AWAITING DEPLOY',
      color: activeDrones.length > 0 ? '#00ff88' : '#ffb74d'
    },
  ]

  // Count drones by status
  const droneStats = {
    active: drones.filter(d => d.status === 'SCANNING' || d.status === 'DEPLOYING').length,
    returning: drones.filter(d => d.status === 'RETURNING').length,
    idle: drones.filter(d => d.status === 'IDLE').length,
    lowBattery: drones.filter(d => d.battery < 20).length,
  }

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{ background: 'none', border: '1px solid rgba(0,212,255,0.3)', color: '#00d4ff', borderRadius: '4px', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', marginTop: '2px', whiteSpace: 'nowrap' }}
          >
            <ArrowLeft size={14} /> DASHBOARD
          </button>
          <div>
          <h1 className={styles.title}>AUTONOMOUS COMMAND CORE</h1>
          <p className={styles.subtitle}>
            Pure agent-only decision space. No manual controls, all routing and tasking originate from the TENXY AI core.
          </p>
          </div>
        </div>
        <div className={styles.controls}>
          <button
            className={`${styles.powerToggle} ${powerFailure ? styles.powerActive : ''}`}
            onClick={() => setPowerFailure(!powerFailure)}
          >
            {powerFailure ? '⚠ RESTORE GRID POWER' : '⚡ SIMULATE BASE POWER FAILURE'}
          </button>
          <span className={styles.hint}>
            {powerFailure
              ? 'AUTONOMY MODE ENGAGED - All command decisions made by AI core'
              : 'Click to simulate emergency scenario'
            }
          </span>
          <Link to="/agent-reasoning" className={styles.chatLink}>
            🧠 AGENT REASONING
          </Link>
          <Link to="/agent-chat" className={styles.chatLink}>
            💬 OPEN AGENT COMM
          </Link>
        </div>
      </header>

      <main className={styles.main}>
        {/* Left: Agent Reasoning Panel */}
        <section className={styles.agentPanel}>
          <div className={styles.reasoningContainer}>
            <div className={styles.reasoningHeader}>
              <h2 className={styles.panelTitle}>REAL-TIME AGENT REASONING</h2>
              <span className={styles.liveIndicator}>● LIVE</span>
            </div>
            <AgentReasoningLog drones={drones} survivors={survivors} isRunning={isRunning} disasters={disasters} boundaries={boundaries} extraSteps={agentReasoningSteps} />
          </div>
        </section>

        {/* Middle: Decision Tree */}
        <section className={styles.decisionPanel}>
          <h2 className={styles.panelTitle}>DECISION TREE</h2>
          <div className={styles.treeContainer}>
            {decisionTree.map((node, idx) => (
              <div key={node.id} className={styles.treeNode}>
                <div className={styles.nodeLine} style={{ borderLeftColor: node.color }} />
                <div className={styles.nodeContent}>
                  <div className={styles.nodeTitle}>{node.title}</div>
                  <div className={styles.nodeStatus} style={{ color: node.color }}>
                    {node.status}
                  </div>
                </div>
                {idx < decisionTree.length - 1 && <div className={styles.nodeConnector} />}
              </div>
            ))}
          </div>
        </section>

        {/* Right: Swarm Status & Command Queue */}
        <section className={styles.statusPanel}>
          <h2 className={styles.panelTitle}>SWARM EXECUTION MATRIX</h2>

          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statIcon}>🚁</div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>ACTIVE</div>
                <div className={styles.statValue}>{droneStats.active}</div>
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statIcon}>🏠</div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>RETURNING</div>
                <div className={styles.statValue}>{droneStats.returning}</div>
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statIcon}>⏸</div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>IDLE</div>
                <div className={styles.statValue}>{droneStats.idle}</div>
              </div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statIcon}>🔋</div>
              <div className={styles.statContent}>
                <div className={styles.statLabel}>LOW BATT</div>
                <div className={styles.statValue}>{droneStats.lowBattery}</div>
              </div>
            </div>
          </div>

          <h3 className={styles.commandQueueTitle}>COMMAND QUEUE</h3>
          <div className={styles.commandQueue}>
            {drones.slice(0, 5).map(drone => (
              <div key={drone.id} className={styles.commandItem}>
                <div className={styles.commandHeader}>
                  <span className={styles.commandDrone}>{drone.id}</span>
                  <span className={styles.commandStatus}>{drone.status}</span>
                </div>
                <div className={styles.commandBar}>
                  <div className={styles.commandProgress} style={{ width: `${(drone.altitude / 150) * 100}%` }} />
                </div>
                <div className={styles.commandMeta}>
                  <span>ALT: {Math.round(drone.altitude)}m</span>
                  <span>BAT: {drone.battery.toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.droneGrid}>
            {drones.map(drone => (
              <div
                key={drone.id}
                className={styles.droneCard}
                onClick={() => setExpandedDrone(expandedDrone === drone.id ? null : drone.id)}
              >
                <div className={styles.droneHeader}>
                  <span className={styles.droneName}>{drone.name}</span>
                  <span className={styles.droneStatus}>{drone.status}</span>
                </div>
                <div className={styles.droneBody}>
                  <div className={styles.metricRow}>
                    <span>BATT</span>
                    <span>{drone.battery.toFixed(0)}%</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span>ALT</span>
                    <span>{Math.round(drone.altitude)}m</span>
                  </div>
                  <div className={styles.metricRow}>
                    <span>SPEED</span>
                    <span>{Math.round(drone.speed)} km/h</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

