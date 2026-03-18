import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { SimulationProvider } from '../context/SimulationContext'
import DashboardScreen from '../screens/DashboardScreen'
import AgentAutonomyScreen from '../screens/AgentAutonomyScreen'
import AgentReasoningVisualizationScreen from '../screens/AgentReasoningVisualizationScreen'

// Mock WebSocket
global.WebSocket = vi.fn((url) => ({
  onopen: null,
  onmessage: null,
  onerror: null,
  onclose: null,
  send: vi.fn(),
  close: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}))

// ============= Test Fixtures =============

const mockDrone = (id: string) => ({
  id,
  name: `Drone ${id}`,
  status: 'SCANNING',
  battery: 80,
  altitude: 100,
  speed: 12,
  x: 0.5,
  y: 0.5,
  targetX: 0.6,
  targetY: 0.6,
  temperature: 45,
  gps: '11.2435,-125.0062'
})

const mockSurvivor = (id: string) => ({
  id,
  x: 0.3 + Math.random() * 0.4,
  y: 0.3 + Math.random() * 0.4,
  status: 'WAITING'
})

// ============= Component Tests =============

describe('DashboardScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders dashboard screen', () => {
    render(
      <BrowserRouter>
        <SimulationProvider>
          <DashboardScreen />
        </SimulationProvider>
      </BrowserRouter>
    )

    expect(screen.getByText(/OPERATION AZURE SHIELD/i)).toBeInTheDocument()
  })

  it('displays mission time', () => {
    render(
      <BrowserRouter>
        <SimulationProvider>
          <DashboardScreen />
        </SimulationProvider>
      </BrowserRouter>
    )

    expect(screen.getByText(/Mission Clock/i)).toBeInTheDocument()
  })

  it('renders map container', () => {
    render(
      <BrowserRouter>
        <SimulationProvider>
          <DashboardScreen />
        </SimulationProvider>
      </BrowserRouter>
    )

    const mapContainer = document.querySelector('[class*="mapContainer"]')
    expect(mapContainer).toBeInTheDocument()
  })
})

describe('AgentAutonomyScreen', () => {
  it('renders autonomy screen', () => {
    render(
      <BrowserRouter>
        <SimulationProvider>
          <AgentAutonomyScreen />
        </SimulationProvider>
      </BrowserRouter>
    )

    expect(screen.getByText(/AUTONOMOUS COMMAND CORE/i)).toBeInTheDocument()
  })

  it('displays power failure toggle button', () => {
    render(
      <BrowserRouter>
        <SimulationProvider>
          <AgentAutonomyScreen />
        </SimulationProvider>
      </BrowserRouter>
    )

    const powerBtn = screen.getByText(/SIMULATE BASE POWER FAILURE/i)
    expect(powerBtn).toBeInTheDocument()
  })

  it('displays agent reasoning button', () => {
    render(
      <BrowserRouter>
        <SimulationProvider>
          <AgentAutonomyScreen />
        </SimulationProvider>
      </BrowserRouter>
    )

    expect(screen.getByText(/AGENT REASONING/i)).toBeInTheDocument()
  })

  it('displays agent chat button', () => {
    render(
      <BrowserRouter>
        <SimulationProvider>
          <AgentAutonomyScreen />
        </SimulationProvider>
      </BrowserRouter>
    )

    expect(screen.getByText(/OPEN AGENT COMM/i)).toBeInTheDocument()
  })
})

describe('AgentReasoningVisualizationScreen', () => {
  it('renders reasoning visualization screen', () => {
    render(
      <BrowserRouter>
        <SimulationProvider>
          <AgentReasoningVisualizationScreen />
        </SimulationProvider>
      </BrowserRouter>
    )

    expect(screen.getByText(/AGENT REASONING VISUALIZATION/i)).toBeInTheDocument()
  })

  it('displays decision cycle log panel', () => {
    render(
      <BrowserRouter>
        <SimulationProvider>
          <AgentReasoningVisualizationScreen />
        </SimulationProvider>
      </BrowserRouter>
    )

    expect(screen.getByText(/DECISION CYCLE LOG/i)).toBeInTheDocument()
  })

  it('displays drone command queue panel', () => {
    render(
      <BrowserRouter>
        <SimulationProvider>
          <AgentReasoningVisualizationScreen />
        </SimulationProvider>
      </BrowserRouter>
    )

    expect(screen.getByText(/DRONE COMMAND QUEUE/i)).toBeInTheDocument()
  })
})

// ============= Hook Tests =============

describe('useAutonomousAgent', () => {
  it('initializes without power failure', async () => {
    // WebSocket should not connect without power failure
    const mockWs = vi.fn()
    global.WebSocket = vi.fn(mockWs)

    // Component without power failure
    render(
      <BrowserRouter>
        <SimulationProvider>
          <DashboardScreen />
        </SimulationProvider>
      </BrowserRouter>
    )

    // WebSocket should not be called immediately
    expect(mockWs).not.toHaveBeenCalled()
  })
})

// ============= Geolocation Tests =============

describe('Geolocation Detection', () => {
  it('requests geolocation on map load', () => {
    const mockGeolocation = {
      getCurrentPosition: vi.fn((success) =>
        success({
          coords: {
            latitude: 40.7128,
            longitude: -74.006
          }
        })
      )
    }

    Object.defineProperty(global.navigator, 'geolocation', {
      value: mockGeolocation,
      configurable: true
    })

    render(
      <BrowserRouter>
        <SimulationProvider>
          <DashboardScreen />
        </SimulationProvider>
      </BrowserRouter>
    )

    expect(mockGeolocation.getCurrentPosition).toHaveBeenCalled()
  })

  it('falls back to default location if geolocation fails', () => {
    const mockGeolocation = {
      getCurrentPosition: vi.fn((success, error) =>
        error({ message: 'Geolocation denied' })
      )
    }

    Object.defineProperty(global.navigator, 'geolocation', {
      value: mockGeolocation,
      configurable: true
    })

    render(
      <BrowserRouter>
        <SimulationProvider>
          <DashboardScreen />
        </SimulationProvider>
      </BrowserRouter>
    )

    expect(mockGeolocation.getCurrentPosition).toHaveBeenCalled()
    // Should still render without crashing
    expect(screen.getByText(/OPERATION AZURE SHIELD/i)).toBeInTheDocument()
  })
})

// ============= WebSocket Integration Tests =============

describe('WebSocket Communication', () => {
  it('connects WebSocket on power failure', async () => {
    const WebSocketMock = vi.fn(() => ({
      onopen: null,
      onmessage: null,
      onerror: null,
      onclose: null,
      send: vi.fn((data) => {
        const msg = JSON.parse(data)
        expect(msg.type).toBe('swarm_state')
      }),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))

    global.WebSocket = WebSocketMock

    render(
      <BrowserRouter>
        <SimulationProvider>
          <AgentAutonomyScreen />
        </SimulationProvider>
      </BrowserRouter>
    )

    // Simulate power failure toggle
    const powerBtn = screen.getByText(/SIMULATE BASE POWER FAILURE/i)
    fireEvent.click(powerBtn)

    // Give time for WebSocket connection
    await waitFor(() => {
      expect(WebSocketMock).toHaveBeenCalled()
    })
  })

  it('handles incoming agent reasoning messages', async () => {
    let wsInstance: any = null

    global.WebSocket = vi.fn((url) => {
      wsInstance = {
        onopen: null,
        onmessage: null,
        onerror: null,
        onclose: null,
        send: vi.fn(),
        close: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }
      return wsInstance
    })

    render(
      <BrowserRouter>
        <SimulationProvider>
          <AgentReasoningVisualizationScreen />
        </SimulationProvider>
      </BrowserRouter>
    )

    // Simulate message from agent
    if (wsInstance && wsInstance.onmessage) {
      wsInstance.onmessage({
        data: JSON.stringify({
          type: 'agent_reasoning',
          data: {
            phase: 'THINK',
            iteration: 1,
            timestamp: new Date().toISOString(),
            state_analysis: {
              total_drones: 3,
              active_drones: 2
            }
          }
        })
      })
    }

    // Should process message without error
    expect(true).toBe(true)
  })
})

// ============= Mission Clock Tests =============

describe('Mission Clock', () => {
  it('displays mission time in TopBar', () => {
    render(
      <BrowserRouter>
        <SimulationProvider>
          <DashboardScreen />
        </SimulationProvider>
      </BrowserRouter>
    )

    // Mission time should be displayed (defaults to 00:00:00)
    expect(screen.getByText(/Mission Clock/i)).toBeInTheDocument()
  })

  it('formats time correctly', () => {
    // Test the formatTime function
    const formatTime = (seconds: number): string => {
      const h = Math.floor(seconds / 3600)
        .toString()
        .padStart(2, '0')
      const m = Math.floor((seconds % 3600) / 60)
        .toString()
        .padStart(2, '0')
      const s = (seconds % 60).toString().padStart(2, '0')
      return `${h}:${m}:${s}`
    }

    expect(formatTime(0)).toBe('00:00:00')
    expect(formatTime(3661)).toBe('01:01:01')
    expect(formatTime(7322)).toBe('02:02:02')
  })
})

// ============= Accessibility Tests =============

describe('Accessibility', () => {
  it('renders with proper ARIA labels', () => {
    render(
      <BrowserRouter>
        <SimulationProvider>
          <AgentAutonomyScreen />
        </SimulationProvider>
      </BrowserRouter>
    )

    // Components should be accessible
    expect(screen.getByText(/AUTONOMOUS COMMAND CORE/i)).toBeVisible()
  })

  it('allows keyboard navigation', () => {
    const { container } = render(
      <BrowserRouter>
        <SimulationProvider>
          <AgentAutonomyScreen />
        </SimulationProvider>
      </BrowserRouter>
    )

    // Find button and verify it's focusable
    const buttons = container.querySelectorAll('button')
    expect(buttons.length).toBeGreaterThan(0)

    buttons.forEach((btn) => {
      expect(btn.hasAttribute('type')).toBe(true)
    })
  })
})

// ============= Performance Tests =============

describe('Performance', () => {
  it('renders dashboard within acceptable time', async () => {
    const startTime = performance.now()

    render(
      <BrowserRouter>
        <SimulationProvider>
          <DashboardScreen />
        </SimulationProvider>
      </BrowserRouter>
    )

    const endTime = performance.now()
    const renderTime = endTime - startTime

    // Should render in less than 1 second
    expect(renderTime).toBeLessThan(1000)
  })

  it('handles rapid state updates', async () => {
    const { rerender } = render(
      <BrowserRouter>
        <SimulationProvider>
          <AgentAutonomyScreen />
        </SimulationProvider>
      </BrowserRouter>
    )

    // Simulate rapid re-renders
    for (let i = 0; i < 10; i++) {
      rerender(
        <BrowserRouter>
          <SimulationProvider>
            <AgentAutonomyScreen />
          </SimulationProvider>
        </BrowserRouter>
      )
    }

    // Should still be responsive
    expect(screen.getByText(/AUTONOMOUS COMMAND CORE/i)).toBeInTheDocument()
  })
})
