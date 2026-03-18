import styles from './PulsingDot.module.css'

interface PulsingDotProps {
  color?: 'green' | 'cyan' | 'amber' | 'red' | 'orange'
  size?: number
}

export default function PulsingDot({ color = 'green', size = 6 }: PulsingDotProps) {
  return (
    <span
      className={`${styles.dot} ${styles[color]}`}
      style={{ width: size, height: size }}
    />
  )
}
