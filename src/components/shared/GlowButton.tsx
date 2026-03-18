import styles from './GlowButton.module.css'

interface GlowButtonProps {
  children: React.ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  fullWidth?: boolean
}

export default function GlowButton({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  fullWidth = false,
}: GlowButtonProps) {
  return (
    <button
      className={`${styles.btn} ${styles[variant]} ${fullWidth ? styles.full : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}
