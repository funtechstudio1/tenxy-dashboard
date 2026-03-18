import { useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

interface DraggablePanelProps {
  title: string
  children: ReactNode
  defaultPos: { x: number; y: number }
  defaultWidth?: number
  minWidth?: number
  maxHeight?: string
  style?: React.CSSProperties
}

export default function DraggablePanel({
  title,
  children,
  defaultPos,
  defaultWidth = 260,
  minWidth = 180,
  maxHeight = 'calc(100vh - 80px)',
  style,
}: DraggablePanelProps) {
  const [pos, setPos] = useState(defaultPos)
  const [collapsed, setCollapsed] = useState(false)
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef({ mouseX: 0, mouseY: 0, panelX: 0, panelY: 0 })

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setDragging(true)
    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panelX: pos.x,
      panelY: pos.y,
    }
  }

  useEffect(() => {
    if (!dragging) return

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStart.current.mouseX
      const dy = e.clientY - dragStart.current.mouseY
      setPos({
        x: dragStart.current.panelX + dx,
        y: dragStart.current.panelY + dy,
      })
    }

    const onUp = () => setDragging(false)

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging])

  return (
    <div
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        width: defaultWidth,
        minWidth,
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-secondary, rgba(5,10,20,0.97))',
        border: '1px solid rgba(0,212,255,0.25)',
        borderRadius: 4,
        boxShadow: '0 4px 24px rgba(0,0,0,0.8), 0 0 0 1px rgba(0,212,255,0.08)',
        overflow: 'hidden',
        ...style,
      }}
    >
      {/* Drag Handle Header */}
      <div
        onMouseDown={handleHeaderMouseDown}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '5px 8px',
          background: 'rgba(0,212,255,0.07)',
          borderBottom: '1px solid rgba(0,212,255,0.18)',
          cursor: dragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        {/* Grip dots */}
        <span style={{ color: 'rgba(0,212,255,0.4)', fontSize: 10, marginRight: 6, letterSpacing: 2 }}>⠿</span>
        <span style={{
          flex: 1,
          fontSize: 9,
          fontFamily: 'monospace',
          fontWeight: 700,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          color: '#00d4ff',
          textShadow: '0 0 6px rgba(0,212,255,0.4)',
        }}>
          {title}
        </span>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={() => setCollapsed(c => !c)}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(0,212,255,0.6)',
            cursor: 'pointer',
            fontSize: 13,
            padding: '0 2px',
            lineHeight: 1,
          }}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▲' : '▼'}
        </button>
      </div>

      {/* Panel Content */}
      {!collapsed && (
        <div style={{ overflow: 'hidden auto', maxHeight, flex: 1 }}>
          {children}
        </div>
      )}
    </div>
  )
}
