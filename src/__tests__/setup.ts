import { expect, afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'

// Cleanup after each test
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock Mapbox GL
vi.mock('mapbox-gl', () => ({
  default: {
    Map: vi.fn().mockImplementation(() => ({
      on: vi.fn(),
      off: vi.fn(),
      getCanvas: vi.fn(() => ({
        style: {
          cursor: ''
        }
      })),
      getSource: vi.fn(),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      setTerrain: vi.fn(),
      easeTo: vi.fn(),
      remove: vi.fn(),
      loadImage: vi.fn((url: string, cb: (error: null, image: null) => void) => cb(null, null)),
      addImage: vi.fn(),
      queryRenderedFeatures: vi.fn(() => []),
      triggerRepaint: vi.fn(),
      getLayer: vi.fn(),
      setLayoutProperty: vi.fn(),
    })),
    MercatorCoordinate: {
      fromLngLat: vi.fn(() => ({
        x: 0.5,
        y: 0.5,
        z: 0,
        meterInMercatorCoordinateUnits: vi.fn(() => 1)
      }))
    },
    accessToken: 'test-token'
  }
}))

// Setup global test utilities
global.console = {
  ...console,
  error: vi.fn(),
  warn: vi.fn(),
} as any
