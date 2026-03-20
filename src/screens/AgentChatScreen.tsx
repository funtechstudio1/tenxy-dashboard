import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Send } from 'lucide-react'
import Anthropic from '@anthropic-ai/sdk'
import { useSim } from '../context/SimulationContext'
import styles from './AgentChatScreen.module.css'

// ---------------------------------------------------------------------------
// Agent definitions — each one in the pipeline
// ---------------------------------------------------------------------------
const AGENTS = {
  user:       { name: 'YOU',              tag: 'USER',        color: '#3b82f6', bg: 'rgba(59,130,246,0.15)' },
  fastmcp:    { name: 'FastMCP',          tag: 'MCP SERVER',  color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  claude:     { name: 'Claude',           tag: 'MCP AGENT',   color: '#00d4ff', bg: 'rgba(0,212,255,0.10)' },
  autogen:    { name: 'AutoGen',          tag: 'GROUP CHAT',  color: '#fb923c', bg: 'rgba(251,146,60,0.12)' },
  langchain:  { name: 'LangChain ReAct',  tag: 'REACT AGENT', color: '#4ade80', bg: 'rgba(74,222,128,0.10)' },
  mesa:       { name: 'Mesa ABM',         tag: 'PHYSICS SIM', color: '#f87171', bg: 'rgba(248,113,113,0.10)' },
  system:     { name: 'TENXY Core',       tag: 'SYSTEM',      color: '#fbbf24', bg: 'rgba(251,191,36,0.10)' },
}

type AgentKey = keyof typeof AGENTS

interface ChatMessage {
  agentKey: AgentKey
  content: string
  ts: string
}

function AgentBadge({ agentKey }: { agentKey: AgentKey }) {
  const a = AGENTS[agentKey]
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      minWidth: 52, gap: 2, paddingTop: 2,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '6px',
        border: `2px solid ${a.color}`,
        background: a.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 800, color: a.color,
        letterSpacing: '0.04em', textAlign: 'center', lineHeight: 1.1,
        boxShadow: `0 0 8px ${a.color}44`,
      }}>
        {a.name.slice(0, 4).toUpperCase()}
      </div>
      <span style={{ fontSize: 8, color: a.color, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{a.tag}</span>
    </div>
  )
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const a = AGENTS[msg.agentKey]
  const isUser = msg.agentKey === 'user'
  return (
    <div style={{
      display: 'flex', gap: 10, alignSelf: isUser ? 'flex-end' : 'flex-start',
      flexDirection: isUser ? 'row-reverse' : 'row',
      maxWidth: '82%',
    }}>
      <AgentBadge agentKey={msg.agentKey} />
      <div style={{
        flex: 1, background: a.bg,
        border: `1px solid ${a.color}44`,
        borderRadius: 10, padding: '8px 12px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: a.color, letterSpacing: '0.08em' }}>
            {a.name}
          </span>
          <span style={{ fontSize: 9, color: '#555', fontFamily: 'monospace' }}>{msg.ts}</span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: '#d0e8ff', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
          {msg.content}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function AgentChatScreen() {
  const navigate = useNavigate()
  const { drones, survivors, powerFailure, disasters, boundaries, logs, missionTime, coverage } = useSim()
  const bottomRef = useRef<HTMLDivElement>(null)

  const now = () => new Date().toLocaleTimeString()

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      agentKey: 'system',
      ts: now(),
      content: 'TENXY COMMAND CORE ONLINE. Swarm telemetry nominal. Ask me about routing decisions, power failure scenarios, battery management, or survivor assignments.',
    },
    {
      agentKey: 'fastmcp',
      ts: now(),
      content: `MCP tools registered: get_swarm_status, get_survivor_locations, get_battery_status, thermal_scan, move_to, route_drone_to_position, plan_swarm_movement (+4 more). Ready to serve agent requests.`,
    },
    {
      agentKey: 'mesa',
      ts: now(),
      content: `Mesa ABM simulation running. ${drones.length} DroneAgent instances active. Physics tick: ${powerFailure ? 'AUTONOMOUS — agents controlling targets' : 'MANUAL — awaiting commands'}.`,
    },
  ])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const push = (agentKey: AgentKey, content: string) =>
    setMessages(prev => [...prev, { agentKey, content, ts: now() }])

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || isSending) return

    push('user', trimmed)
    setInput('')
    setIsSending(true)

    const apiKey = sessionStorage.getItem('tenxy_api_key')

    // ── Live telemetry snapshot ──────────────────────────────────────────────
    const activeDrones = drones.filter(d => d.status === 'SCANNING' || d.status === 'DEPLOYING').length
    const alertDrones = drones.filter(d => d.status === 'ALERT').length
    const criticalDrones = drones.filter(d => d.battery < 20).length
    const avgBattery = drones.length ? Math.round(drones.reduce((s, d) => s + d.battery, 0) / drones.length) : 0
    const disastersSummary = disasters.length > 0
      ? disasters.map(d => `${d.type.toUpperCase()} at (${d.x.toFixed(2)}, ${d.y.toFixed(2)})`).join(', ')
      : 'None active'

    // ── FastMCP: query-aware tool report ─────────────────────────────────────
    push('fastmcp', `[query: "${trimmed.slice(0, 60)}"]\n[get_swarm_status] ${drones.length} drones | ${activeDrones} scanning | ${alertDrones} alert | ${criticalDrones} critical\n[get_battery_status] avg: ${avgBattery}% | lowest: ${drones.length ? drones.reduce((min, d) => d.battery < min.battery ? d : min).name + ' ' + Math.round(drones.reduce((min, d) => d.battery < min.battery ? d : min).battery) + '%' : 'N/A'}\n[get_disasters] ${disastersSummary}`)

    // ── AutoGen: strategy decision ───────────────────────────────────────────
    const strategy = disasters.length > 0 ? 'DISASTER_RESPONSE' : survivors.length > 0 ? 'SURVIVOR_FOCUS' : criticalDrones > drones.length * 0.5 ? 'EMERGENCY_RECALL' : 'GRID_SWEEP'
    push('autogen', `[SituationAnalyst → TacticalPlanner] Query context: "${trimmed.slice(0, 40)}"\nRecommended strategy: ${strategy}\nRationale: ${
      strategy === 'DISASTER_RESPONSE' ? `${disasters.length} active disaster(s) — prioritize rescue operations.` :
      strategy === 'SURVIVOR_FOCUS' ? `${survivors.length} survivor(s) detected — redirect available drones.` :
      strategy === 'EMERGENCY_RECALL' ? `>50% drones at critical battery — emergency return.` :
      `No threats — maximize grid coverage. ${powerFailure ? 'Autonomous sweep in progress.' : 'Awaiting operator commands.'}`
    }`)

    // ── LangChain: execution trace ───────────────────────────────────────────
    push('langchain', `[ReAct loop] Thought: user asks "${trimmed.slice(0, 50)}", strategy=${strategy}, fleet=${activeDrones}/${drones.length} active\nAction: analyze_query(context=${strategy})\nObservation: telemetry aggregated for ${drones.length} units\nFinal answer: routing to Claude for reasoning.`)

    // ── Mesa: physics confirmation ───────────────────────────────────────────
    push('mesa', `[DroneAgent.step()] ${drones.length} agents active | tick rate: 1Hz | battery drain: 0.2%/tick\nPower: ${powerFailure ? 'OFFLINE — autonomous sweep' : 'ONLINE'} | Zones: ${boundaries.length} | Coverage: ${coverage.toFixed(1)}%`)

    // ── Build conversation history for Claude ────────────────────────────────
    const history: { role: 'user' | 'assistant'; content: string }[] = []
    let assistantBuf: string[] = []
    for (const m of messages) {
      if (m.agentKey === 'user') {
        if (assistantBuf.length > 0) {
          history.push({ role: 'assistant', content: assistantBuf.join('\n\n') })
          assistantBuf = []
        }
        history.push({ role: 'user', content: m.content })
      } else {
        assistantBuf.push(m.content)
      }
    }
    if (assistantBuf.length > 0) {
      history.push({ role: 'assistant', content: assistantBuf.join('\n\n') })
    }
    // Keep last 20 turns to stay within context limits
    const trimmedHistory = history.slice(-20)

    // ── Rich system prompt with live telemetry ───────────────────────────────
    const dronesSummary = drones.map(d =>
      `${d.name}: ${d.status} | bat:${d.battery.toFixed(0)}% | pos:(${d.x.toFixed(2)},${d.y.toFixed(2)})${d.missionTargetId ? ' | RESCUE:' + d.missionTargetId : ''}`
    ).join('\n')

    const recentLogs = logs.slice(-5).map(l => `[${l.time}] ${l.message}`).join('\n')

    const systemPrompt = `You are TENXY AI, the intelligent command agent inside the TENXY drone swarm SAR (search-and-rescue) command system.
You have real-time access to all swarm telemetry. Answer naturally — be helpful, specific, and reference actual drone names and data when relevant.

LIVE SWARM STATE:
- Fleet: ${drones.length} drones | Coverage: ${coverage.toFixed(1)}% | Mission time: ${Math.floor(missionTime / 60)}m ${missionTime % 60}s
- Power failure: ${powerFailure ? 'YES — drones operating autonomously via on-board sensors' : 'NO — normal operations'}
- Active disasters: ${disastersSummary}
- Survivors detected: ${survivors.length}
- Zones: ${boundaries.length} active boundary zone(s)

DRONE STATUS:
${dronesSummary}

RECENT MISSION LOG:
${recentLogs || 'No recent events'}

Respond conversationally. Keep answers focused but natural — not robotic.`

    // ── Claude: main AI response ─────────────────────────────────────────────
    if (!apiKey) {
      push('claude', `[No API key — offline mode]\n${drones.length} drones | ${activeDrones} active | ${criticalDrones} critical\nDisasters: ${disastersSummary}\nPower: ${powerFailure ? 'OFFLINE' : 'ONLINE'}\n\nProvide your Anthropic API key in the Briefing Screen for live AI reasoning.`)
      setIsSending(false)
      return
    }

    try {
      const client = new Anthropic({ apiKey })
      const resp = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: systemPrompt,
        messages: trimmedHistory,
      })
      push('claude', resp.content[0].type === 'text' ? resp.content[0].text : 'Error reading response.')
    } catch (err) {
      push('claude', `API error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>TENXY AGENT COMM LINK</h1>
          <p className={styles.subtitle}>
            Multi-agent pipeline: FastMCP → Claude (MCP Agent) → AutoGen → LangChain ReAct → Mesa ABM
          </p>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.chatWindow}>
          {messages.map((m, i) => <MessageBubble key={i} msg={m} />)}
          {isSending && (
            <div style={{ display: 'flex', gap: 10, alignSelf: 'flex-start' }}>
              <AgentBadge agentKey="claude" />
              <div style={{ background: AGENTS.claude.bg, border: `1px solid ${AGENTS.claude.color}44`, borderRadius: 10, padding: '8px 12px', color: '#00d4ff', fontSize: 12 }}>
                Claude is reasoning…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className={styles.inputRow}>
          <input
            className={styles.input}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask the swarm agents about routing, battery, survivors, strategy…"
            onKeyDown={e => { if (e.key === 'Enter' && !isSending) handleSend() }}
            disabled={isSending}
          />
          <button className={styles.sendBtn} onClick={handleSend} disabled={isSending || !input.trim()}>
            <Send size={16} />
          </button>
        </div>
      </main>
    </div>
  )
}
