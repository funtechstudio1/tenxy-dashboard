import styles from './BatteryBar.module.css'

interface BatteryBarProps {
  level: number
  showLabel?: boolean
}

export default function BatteryBar({ level, showLabel = true }: BatteryBarProps) {
  const color =
    level > 60 ? 'var(--accent-cyan)' :
    level > 20 ? 'var(--status-amber)' :
    'var(--status-red)'

  return (
    <div className={styles.wrapper}>
      {showLabel && (
        <span className={styles.label} style={{ color }}>
          {level}%
        </span>
      )}
      <div className={styles.track}>
        <div
          className={styles.fill}
          style={{ width: `${level}%`, background: color }}
        />
      </div>
    </div>
  )
}
