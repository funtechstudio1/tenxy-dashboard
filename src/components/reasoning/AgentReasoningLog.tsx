import { Cpu, ChevronRight, Loader2 } from 'lucide-react'
import { useAgentReasoning, AGENT_LABELS } from '../../hooks/useAgentReasoning'
import type { ReasoningStep } from '../../hooks/useAgentReasoning'
import type { Drone, Survivor, DisasterMarker, BoundaryZone } from '../../hooks/useSimulation'
import styles from './AgentReasoningLog.module.css'

interface AgentReasoningLogProps {
  drones: Drone[]
  survivors: Survivor[]
  isRunning: boolean
  disasters?: DisasterMarker[]
  boundaries?: BoundaryZone[]
  // Optional: shared steps from autonomous agent (power failure logs)
  extraSteps?: ReasoningStep[]
}

export default function AgentReasoningLog({
  drones, survivors, isRunning,
  disasters = [], boundaries = [],
  extraSteps = []
}: AgentReasoningLogProps) {
  const { steps: eventSteps, isThinking } = useAgentReasoning(drones, survivors, isRunning, disasters, boundaries)

  // Merge event-driven steps with autonomous agent logs, newest first
  const allSteps = [...extraSteps, ...eventSteps]

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <Cpu size={16} className={styles.icon} />
          <h2 className={styles.title}>AGENT REASONING</h2>
        </div>
        {isThinking && (
          <div className={styles.thinking}>
            <Loader2 size={12} className={styles.spin} />
            <span>THINKING</span>
          </div>
        )}
      </div>
      <div className={styles.content}>
        {allSteps.map((step, i) => {
          const agent = AGENT_LABELS[step.agent] ?? { name: 'TENXY-AI', tag: 'CORE', color: '#00d4ff' }
          return (
            <div key={i} className={`${styles.entry} ${styles[step.type] ?? ''}`}>
              <div className={styles.entryHeader}>
                <span className={styles.timestamp}>[{step.timestamp}]</span>
                <span
                  className={styles.agentTag}
                  style={{ color: agent.color, borderColor: `${agent.color}44` }}
                  title={agent.tag}
                >
                  {agent.name}
                </span>
                <span className={styles.typeTag}>{step.type.toUpperCase()}</span>
              </div>
              <div className={styles.body}>
                <ChevronRight size={14} className={styles.chevron} />
                <p className={styles.text}>{step.text}</p>
              </div>
            </div>
          )
        })}
        {allSteps.length === 0 && (
          <div className={styles.empty}>
            <ChevronRight size={14} className={styles.chevron} />
            <p className={styles.text}>Awaiting tactical input from swarm...</p>
          </div>
        )}
      </div>
    </div>
  )
}
