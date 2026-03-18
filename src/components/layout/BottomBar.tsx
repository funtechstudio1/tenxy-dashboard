import { useEffect, useRef, useState, useCallback } from 'react'
import styles from './BottomBar.module.css'

export interface MissionLogEntry {
  time: string
  message: string
  type: 'system' | 'drone' | 'alert'
}

interface BottomBarProps {
  logs?: MissionLogEntry[]
  signalIntegrity?: number
  latency?: number
  weather?: string
}

const MIN_HEIGHT = 80
const MAX_HEIGHT = 520
const DEFAULT_HEIGHT = 160
const EXPAND_HEIGHTS = [80, 160, 360] as const

export default function BottomBar({
  logs = [],
  signalIntegrity = 98.2,
  latency = 12,
  weather = 'Clear Skies // 12km/h W',
}: BottomBarProps) {
  const logRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(DEFAULT_HEIGHT)
  const dragRef = useRef<{ startY: number; startH: number } | null>(null)

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs])

  const toggleExpand = useCallback(() => {
    setHeight(h => {
      const idx = EXPAND_HEIGHTS.indexOf(h as typeof EXPAND_HEIGHTS[number])
      const next = idx === -1 ? 1 : (idx + 1) % EXPAND_HEIGHTS.length
      return EXPAND_HEIGHTS[next]
    })
  }, [])

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startH: height }

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return
      const delta = dragRef.current.startY - ev.clientY   // drag up = larger
      const newH = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, dragRef.current.startH + delta))
      setHeight(newH)
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [height])

  return (
    <div className={styles.bottombar} style={{ height }}>
      {/* Drag handle — grab and pull up to expand the log panel */}
      <div className={styles.resizeHandle} onMouseDown={onDragStart} title="Drag to resize">
        <div className={styles.resizeGrip} />
      </div>

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.title}>Mission Log</span>
          <span className={styles.liveIndicator}>
            <span className={styles.liveDot} />
            Live stream connected
          </span>
        </div>
        <button className={styles.expandBtn} onClick={toggleExpand} title="Expand/collapse log">
          {height >= 360 ? '▼ COLLAPSE' : '▲ EXPAND'}
        </button>
      </div>

      <div className={styles.logContainer} ref={logRef}>
        {logs.map((entry, i) => (
          <div key={i} className={styles.logEntry}>
            <span className={styles.logTime}>[{entry.time}]</span>
            <span className={`${styles.logMessage} ${styles[entry.type]}`}>
              {entry.message}
            </span>
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <div className={styles.footerLeft}>
          <span>SIGNAL INTEGRITY: <strong>{signalIntegrity}ms</strong></span>
          <span>LATENCY: <strong>{latency}ms</strong></span>
        </div>
        <div className={styles.footerRight}>
          <div className={styles.weather}>
            <div className={styles.weatherLabel}>Weather Condition</div>
            <div className={styles.weatherValue}>{weather}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
