import styles from './StatusBadge.module.css'

interface StatusBadgeProps {
  status: string
  variant?: 'green' | 'cyan' | 'amber' | 'red' | 'dim'
}

const variantMap: Record<string, StatusBadgeProps['variant']> = {
  SCANNING: 'cyan',
  DEPLOYING: 'cyan',
  RETURNING: 'green',
  IDLE: 'dim',
  CHARGING: 'amber',
  ALERT: 'red',
  FLIGHT: 'green',
  CAUTION: 'amber',
  ACTIVE: 'green',
  NOMINAL: 'green',
}

export default function StatusBadge({ status, variant }: StatusBadgeProps) {
  const resolvedVariant = variant || variantMap[status] || 'dim'
  return (
    <span className={`${styles.badge} ${styles[resolvedVariant]}`}>
      {status}
    </span>
  )
}
