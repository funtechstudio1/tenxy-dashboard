import { Component, type ReactNode } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import BriefingScreen from './screens/BriefingScreen'
import DashboardScreen from './screens/DashboardScreen'
import DroneDetailScreen from './screens/DroneDetailScreen'
import SummaryScreen from './screens/SummaryScreen'
import AgentAutonomyScreen from './screens/AgentAutonomyScreen'
import AgentChatScreen from './screens/AgentChatScreen'
import AgentReasoningVisualizationScreen from './screens/AgentReasoningVisualizationScreen'
import { SimulationProvider } from './context/SimulationContext'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    const { error } = this.state
    if (error) {
      return (
        <div style={{ padding: 32, fontFamily: 'monospace', background: '#050a0f', color: '#ff4444', minHeight: '100vh' }}>
          <h2 style={{ color: '#ff6666' }}>⚠ TENXY SYSTEM FAULT</h2>
          <pre style={{ color: '#ff8888', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {(error as Error).message}{'\n\n'}{(error as Error).stack}
          </pre>
          <button onClick={() => { this.setState({ error: null }); window.location.hash = '/' }}
            style={{ marginTop: 16, padding: '8px 16px', background: 'rgba(0,212,255,0.2)', border: '1px solid #00d4ff', color: '#00d4ff', cursor: 'pointer', borderRadius: 6 }}>
            ↩ RETURN TO BRIEFING
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function App() {
  return (
    <ErrorBoundary>
      <SimulationProvider>
        <HashRouter>
          <Routes>
            <Route path="/" element={<BriefingScreen />} />
            <Route path="/dashboard" element={<DashboardScreen />} />
            <Route path="/drone/:id" element={<DroneDetailScreen />} />
            <Route path="/summary" element={<SummaryScreen />} />
            <Route path="/agent" element={<AgentAutonomyScreen />} />
            <Route path="/agent-chat" element={<AgentChatScreen />} />
            <Route path="/agent-reasoning" element={<AgentReasoningVisualizationScreen />} />
          </Routes>
        </HashRouter>
      </SimulationProvider>
    </ErrorBoundary>
  )
}

export default App
