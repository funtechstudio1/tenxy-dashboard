# TENXY — Autonomous Drone Swarm Simulator

**Vector-Assigned Network Guardian for Unified Autonomous Rescue Drones**

A real-time web dashboard simulating an AI command agent orchestrating a fleet of rescue drones over a disaster zone. Built with React 19 + Vite 8, with Claude API integration for chain-of-thought reasoning.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + Vite 8 + TypeScript |
| Routing | React Router v7 (HashRouter for GitHub Pages) |
| 2D Map | Mapbox GL JS |
| 3D Camera | Cesium Ion |
| Mapping | Mapbox GL JS |
| AI Reasoning | Anthropic SDK (`claude-sonnet-4-6`) |
| Icons | Lucide React |
| Styling | Vanilla CSS Modules |

---

## Screens

| Route | Screen | Purpose |
|-------|--------|---------|
| `/` | BriefingScreen | Mission setup, optional Claude API key |
| `/dashboard` | DashboardScreen | Main swarm command HQ |
| `/drone/:id` | DroneDetailScreen | Individual drone telemetry + Cesium 3D camera |
| `/summary` | SummaryScreen | Post-mission statistics |
| `/agent` | AgentAutonomyScreen | Agent decision tree + power failure mode |
| `/agent-chat` | AgentChatScreen | Multi-agent pipeline chat (Claude/MCP/AutoGen/LangChain/Mesa) |
| `/agent-reasoning` | AgentReasoningVisualizationScreen | Live THINK→PROCESS→EXECUTE→COMMAND phases |

---

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server → http://localhost:5173/tenxy-dashboard/
npm run dev

# Production build
npm run build

# Preview production build
npm run preview
```

---

## API Keys

All tokens are pre-loaded automatically on the BriefingScreen:
- **Mapbox** — auto-loaded via `sessionStorage`
- **Cesium Ion** — auto-loaded via `sessionStorage`
- **Claude API key** — optional, enter on BriefingScreen to enable AI reasoning

---

## Key Features

- **12-drone swarm** (configurable via BriefingScreen)
- Real-time Mapbox map with sector grid, survivor markers, trail rendering
- **Power failure mode** → triggers autonomous Claude agent to take control
- Multi-agent chat: Claude (MCP Agent), AutoGen, LangChain ReAct, Mesa ABM
- Agent reasoning visualization with THINK / PROCESS / EXECUTE / COMMAND phases
- Disaster markers (fire/flood), boundary zone drawing
- Cesium 3D drone camera view per drone
- GitHub Pages deployment via `.github/workflows/deploy.yml`

---

## Project Structure

```
src/
├── App.tsx                          # Routes + ErrorBoundary
├── main.tsx                         # Entry point
├── context/
│   └── SimulationContext.tsx        # Global simulation state
├── hooks/
│   ├── useSimulation.ts             # Core drone/survivor/sector sim loop
│   ├── useAutonomousAgent.ts        # Power-failure autonomous agent
│   └── useAgentReasoning.ts        # Event-driven reasoning simulation
├── screens/
│   ├── BriefingScreen.tsx
│   ├── DashboardScreen.tsx
│   ├── DroneDetailScreen.tsx
│   ├── SummaryScreen.tsx
│   ├── AgentAutonomyScreen.tsx
│   ├── AgentChatScreen.tsx
│   └── AgentReasoningVisualizationScreen.tsx
└── components/
    ├── layout/   TopBar, BottomBar
    ├── fleet/    DroneFleetPanel
    ├── map/      DisasterZoneMap
    ├── detail/   DroneDetailPanel, CesiumDroneCamera, MapboxDroneCamera
    ├── reasoning/ AgentReasoningLog
    └── shared/   BatteryBar, GlowButton, PulsingDot, StatusBadge
```
