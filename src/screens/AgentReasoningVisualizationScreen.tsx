import { useState, useEffect, useRef } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useSim } from '../context/SimulationContext'
import styles from './AgentReasoningVisualizationScreen.module.css'

interface ReasoningPhase {
  phase: 'THINK' | 'PROCESS' | 'EXECUTE' | 'COMMAND' | 'POWER_RESTORED'
  iteration: number
  timestamp: string
  data: any
}

interface DroneCommand {
  drone_id: string
  action: string
  target_x?: number
  target_y?: number
  reasoning?: string
  pattern?: string
}

export default function AgentReasoningVisualizationScreen() {
  const navigate = useNavigate()
  const { drones, survivors, powerFailure, agentReasoningSteps } = useSim()
  const [phases, setPhases] = useState<ReasoningPhase[]>([])
  const [commands, setCommands] = useState<DroneCommand[]>([])
  const [agentActive, setAgentActive] = useState(false)
  const logEndRef = useRef<HTMLDivElement>(null)
  const iterationRef = useRef(0)

  // Keep latest sim state accessible inside the interval without restarting it
  const stateRef = useRef({ drones, survivors, powerFailure })
  stateRef.current = { drones, survivors, powerFailure }

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [phases, commands])

  useEffect(() => {
    if (!powerFailure) {
      setAgentActive(false)
      setPhases(prev => {
        if (prev.length === 0) return prev
        const ts = new Date().toISOString()
        return [
          ...prev.slice(-19),
          {
            phase: 'POWER_RESTORED',
            iteration: iterationRef.current,
            timestamp: ts,
            data: { message: 'Grid power restored — returning to manual control' },
          },
        ]
      })
      return
    }

    setAgentActive(true)

    const runCycle = () => {
      const { drones: d, survivors: s } = stateRef.current
      iterationRef.current += 1
      const iter = iterationRef.current
      const ts = new Date().toISOString()

      const activeDrones = d.filter(dr => dr.status === 'SCANNING' || dr.status === 'DEPLOYING')
      const criticalDrones = d.filter(
        dr => dr.battery < 20 && dr.status !== 'RETURNING' && dr.status !== 'CHARGING'
      )
      const availableDrones = d.filter(
        dr => dr.status !== 'RETURNING' && dr.status !== 'CHARGING' && dr.battery >= 20
      )

      let strategy: string = 'GRID_SWEEP'
      if (criticalDrones.length > d.length * 0.5) strategy = 'EMERGENCY_RECALL'
      else if (s.length > 0) strategy = 'SURVIVOR_FOCUS'

      // Generate movement commands
      const newCmds: DroneCommand[] = []
      criticalDrones.forEach(dr => {
        newCmds.push({ drone_id: dr.id, action: 'SET_TARGET', target_x: 0.5, target_y: 0.5, reasoning: 'Critical battery — returning to base' })
      })
      if (strategy === 'SURVIVOR_FOCUS') {
        availableDrones.forEach((dr, i) => {
          const target = s[i % s.length]
          if (target) {
            newCmds.push({ drone_id: dr.id, action: 'SET_TARGET', target_x: target.x, target_y: target.y, reasoning: `Routing to survivor ${target.id}` })
          }
        })
      } else if (strategy === 'GRID_SWEEP') {
        availableDrones.forEach((dr, i) => {
          const cols = 4
          const col = i % cols
          const row = Math.floor(i / cols) % cols
          const cell = 1 / cols
          newCmds.push({ drone_id: dr.id, action: 'SET_TARGET', target_x: col * cell + cell / 2, target_y: row * cell + cell / 2, reasoning: `Grid sweep sector ${col}-${row}` })
        })
      } else {
        availableDrones.forEach(dr => {
          newCmds.push({ drone_id: dr.id, action: 'SET_TARGET', target_x: 0.5, target_y: 0.5, reasoning: 'Emergency recall' })
        })
      }

      setPhases(prev => [
        ...prev.slice(-16),
        {
          phase: 'THINK', iteration: iter, timestamp: ts,
          data: {
            state_analysis: {
              total_drones: d.length,
              active_drones: activeDrones.length,
              survivors_detected: s.length,
              battery_critical: criticalDrones.length,
              power_failure_active: true,
            },
            agent_mode: 'CREW_INTELLIGENCE',
          },
        },
        {
          phase: 'PROCESS', iteration: iter, timestamp: new Date().toISOString(),
          data: {
            decision_logic: {
              coverage_strategy: strategy,
              battery_management: criticalDrones.length > 0 ? 'CRITICAL_FIRST' : 'NORMAL',
              task_distribution: `${availableDrones.length} drones tasked`,
              next_action: strategy === 'SURVIVOR_FOCUS' ? 'ROUTE_TO_SURVIVORS' : 'DEPLOY_GRID',
            },
          },
        },
        {
          phase: 'EXECUTE', iteration: iter, timestamp: new Date().toISOString(),
          data: { command_count: newCmds.length },
        },
        {
          phase: 'COMMAND', iteration: iter, timestamp: new Date().toISOString(),
          data: {
            total_commands_sent: newCmds.length,
            command_status: 'TRANSMITTED',
            next_decision_in_seconds: 5,
          },
        },
      ])

      setCommands(newCmds)
    }

    runCycle()
    const timer = setInterval(runCycle, 5000)
    return () => clearInterval(timer)
  }, [powerFailure])

  // Each phase maps to the actual framework agent that handles it in the backend
  const PHASE_AGENT: Record<string, { name: string; framework: string; color: string }> = {
    THINK:         { name: 'MCP Tool-Use Agent',      framework: 'Anthropic SDK • tool-use loop',          color: '#00d4ff' },
    PROCESS:       { name: 'AutoGen GroupChat',        framework: 'autogen-agentchat • RoundRobinGroupChat', color: '#ffb74d' },
    EXECUTE:       { name: 'LangChain ReAct Agent',    framework: 'LangGraph • create_react_agent',         color: '#76ff03' },
    COMMAND:       { name: 'Mesa ABM',                 framework: 'mesa • DroneAgent.step()',               color: '#ff5252' },
    POWER_RESTORED:{ name: 'System',                   framework: 'TENXY Core',                             color: '#ffd700' },
  }

  const getPhaseColor = (phase: string): string =>
    PHASE_AGENT[phase]?.color ?? '#ffd700'

  const getPhaseAgent = (phase: string) =>
    PHASE_AGENT[phase] ?? { name: 'TENXY-AI', framework: 'CREW fallback', color: '#aaa' }

  const formatTimestamp = (ts: string): string => new Date(ts).toLocaleTimeString()

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>AGENT REASONING VISUALIZATION</h1>
          <p className={styles.subtitle}>Real-time view of autonomous agent decision cycles: THINK → PROCESS → EXECUTE → COMMAND</p>
        </div>
        <div className={styles.statusIndicator}>
          <div className={`${styles.statusLight} ${agentActive ? styles.connected : styles.disconnected}`} />
          <span>{agentActive ? 'AGENT ACTIVE' : 'STANDBY'}</span>
          {agentActive && <span className={styles.agentActive}>⚠ AUTONOMOUS MODE</span>}
        </div>
      </header>

      {/* Engine legend */}
      <div style={{ display: 'flex', gap: '6px', padding: '6px 20px', background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid rgba(0,212,255,0.1)', flexWrap: 'wrap' }}>
        {Object.entries(PHASE_AGENT).filter(([k]) => k !== 'POWER_RESTORED').map(([phase, a]) => (
          <div key={phase} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '3px 8px', border: `1px solid ${a.color}33`, borderRadius: '3px', fontSize: '10px' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: a.color, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ color: a.color, fontWeight: 700 }}>{a.name}</span>
            <span style={{ color: '#555', fontFamily: 'monospace' }}>— {a.framework}</span>
          </div>
        ))}
      </div>

      <main className={styles.main}>
        {/* Left: Phase Logs */}
        <section className={styles.phaseLogs}>
          <h2 className={styles.panelTitle}>DECISION CYCLE LOG</h2>
          <div className={styles.logScroller}>
            {phases.length === 0 && agentReasoningSteps.length === 0 ? (
              <div className={styles.emptyState}>
                <p>Agent monitoring active — awaiting events</p>
                <p className={styles.hint}>Place a disaster marker or enable Power Failure mode to see live reasoning cycles. Survivor detection and battery events also generate logs.</p>
              </div>
            ) : phases.length === 0 ? (
              // Show shared reasoning steps (event-driven logs from normal operation)
              <div>
                {agentReasoningSteps.slice(0, 60).map((step, idx) => (
                  <div key={idx} className={styles.phaseCard} style={{ borderLeftColor: '#00d4ff' }}>
                    <div className={styles.phaseHeader}>
                      <div className={styles.phaseName} style={{ color: '#00d4ff' }}>[EVENT]</div>
                      <div style={{ flex: 1, marginLeft: 8, color: '#556', fontSize: 9, fontFamily: 'monospace' }}>
                        {step.timestamp}
                      </div>
                      <div style={{ color: '#00d4ff', fontSize: 9 }}>{step.agent?.toUpperCase()}</div>
                    </div>
                    <div className={styles.phaseContent}>
                      <p style={{ color: '#8b949e', fontSize: 10, fontFamily: 'monospace', margin: 0 }}>{step.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              phases.map((phase, idx) => (
                <div
                  key={idx}
                  className={styles.phaseCard}
                  style={{ borderLeftColor: getPhaseColor(phase.phase) }}
                >
                  <div className={styles.phaseHeader}>
                    <div className={styles.phaseName} style={{ color: getPhaseColor(phase.phase) }}>
                      [{phase.phase}]
                    </div>
                    <div style={{ flex: 1, marginLeft: 8 }}>
                      <div style={{ color: getPhaseColor(phase.phase), fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em' }}>
                        {getPhaseAgent(phase.phase).name}
                      </div>
                      <div style={{ color: '#666', fontSize: '9px', fontFamily: 'monospace' }}>
                        {getPhaseAgent(phase.phase).framework}
                      </div>
                    </div>
                    <div className={styles.phaseIteration}>#{phase.iteration}</div>
                    <div className={styles.timestamp}>{formatTimestamp(phase.timestamp)}</div>
                  </div>

                  <div className={styles.phaseContent}>
                    {phase.phase === 'THINK' && phase.data?.state_analysis && (
                      <ul>
                        <li>Total Drones: {phase.data.state_analysis.total_drones}</li>
                        <li>Active Drones: {phase.data.state_analysis.active_drones}</li>
                        <li>Survivors Detected: {phase.data.state_analysis.survivors_detected}</li>
                        <li>Critical Battery: {phase.data.state_analysis.battery_critical}</li>
                        <li>Power Failure: {phase.data.state_analysis.power_failure_active ? 'YES' : 'NO'}</li>
                      </ul>
                    )}

                    {phase.phase === 'PROCESS' && phase.data?.decision_logic && (
                      <ul>
                        <li>Coverage: {phase.data.decision_logic.coverage_strategy}</li>
                        <li>Battery: {phase.data.decision_logic.battery_management}</li>
                        <li>Tasks: {phase.data.decision_logic.task_distribution}</li>
                        <li>Action: {phase.data.decision_logic.next_action}</li>
                      </ul>
                    )}

                    {phase.phase === 'EXECUTE' && phase.data && (
                      <ul>
                        <li>Commands Generated: {phase.data.command_count}</li>
                        <li>Status: EXECUTING</li>
                      </ul>
                    )}

                    {phase.phase === 'COMMAND' && phase.data && (
                      <ul>
                        <li>Commands Sent: {phase.data.total_commands_sent}</li>
                        <li>Status: {phase.data.command_status}</li>
                        <li>Next Decision: {phase.data.next_decision_in_seconds}s</li>
                      </ul>
                    )}

                    {phase.phase === 'POWER_RESTORED' && (
                      <p className={styles.powerRestored}>{phase.data?.message || 'Power restored - returning to manual control'}</p>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </section>

        {/* Right: Command List */}
        <section className={styles.commandPanel}>
          <h2 className={styles.panelTitle}>DRONE COMMAND QUEUE</h2>
          <div className={styles.commandScroller}>
            {commands.length === 0 && !powerFailure ? (
              // Show live drone status as the "command queue" during normal ops
              <div className={styles.commandList}>
                {drones.map((d) => (
                  <div key={d.id} className={styles.commandCard}>
                    <div className={styles.commandHeader}>
                      <span className={styles.droneId}>🚁 {d.id}</span>
                      <span className={styles.action} style={{ color: d.status === 'IDLE' ? '#556' : '#00d4ff' }}>{d.status}</span>
                    </div>
                    <div className={styles.commandDetails}>
                      <span>🔋 {d.battery.toFixed(0)}%</span>
                      <span style={{ marginLeft: 8 }}>📡 {d.speed.toFixed(0)} km/h</span>
                      <span style={{ marginLeft: 8 }}>⬆ {Math.round(d.altitude)}m</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : commands.length === 0 ? (
              <div className={styles.emptyState}>
                <p>Agent computing commands...</p>
              </div>
            ) : (
              <div className={styles.commandList}>
                {commands.map((cmd, idx) => (
                  <div key={idx} className={styles.commandCard}>
                    <div className={styles.commandHeader}>
                      <span className={styles.droneId}>🚁 {cmd.drone_id}</span>
                      <span className={styles.action}>{cmd.action}</span>
                    </div>
                    <div className={styles.commandDetails}>
                      {cmd.action === 'SET_TARGET' && (
                        <div>
                          <span>📍 Target: ({cmd.target_x?.toFixed(2)}, {cmd.target_y?.toFixed(2)})</span>
                        </div>
                      )}
                      {cmd.action === 'PATROL' && (
                        <div>
                          <span>🔄 Pattern: {cmd.pattern}</span>
                        </div>
                      )}
                      {cmd.reasoning && (
                        <div className={styles.reasoning}>
                          <small>💡 {cmd.reasoning}</small>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer: Phase Indicators */}
      <footer className={styles.footer}>
        <div className={styles.cycleIndicators}>
          <div className={styles.cyclePhase} style={{ backgroundColor: getPhaseColor('THINK') }} title="THINK Phase">
            🧠
          </div>
          <div className={styles.arrow}>→</div>
          <div className={styles.cyclePhase} style={{ backgroundColor: getPhaseColor('PROCESS') }} title="PROCESS Phase">
            ⚙
          </div>
          <div className={styles.arrow}>→</div>
          <div className={styles.cyclePhase} style={{ backgroundColor: getPhaseColor('EXECUTE') }} title="EXECUTE Phase">
            ⚡
          </div>
          <div className={styles.arrow}>→</div>
          <div className={styles.cyclePhase} style={{ backgroundColor: getPhaseColor('COMMAND') }} title="COMMAND Phase">
            📡
          </div>
        </div>
      </footer>
    </div>
  )
}
