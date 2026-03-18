import { useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { Shield, Zap, Navigation } from 'lucide-react'
import GlowButton from '../components/shared/GlowButton'
import styles from './BriefingScreen.module.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string
const CESIUM_TOKEN = import.meta.env.VITE_CESIUM_TOKEN as string

export default function BriefingScreen() {
  const navigate = useNavigate()

  useEffect(() => {
    // Auto-load tokens on component mount
    sessionStorage.setItem('tenxy_mapbox_token', MAPBOX_TOKEN)
    sessionStorage.setItem('tenxy_cesium_token', CESIUM_TOKEN)
  }, [])

  const handleDeploy = () => {
    navigate('/dashboard')
  }

  return (
    <div className={styles.screen}>
      {/* Background grid effect */}
      <div className={styles.gridBg} />
      <div className={styles.scanline} />

      <div className={styles.content}>
        {/* Logo */}
        <div className={styles.logo}>
          <Shield size={64} className={styles.logoIcon} />
          <div className={styles.logoGlow} />
        </div>

        <h1 className={styles.title}>TENXY</h1>
        <p className={styles.subtitle}>
          Vector-Assigned Network Guardian for Unified Autonomous Rescue Drones
        </p>

        <div className={styles.divider} />

        {/* Mission Parameters */}
        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>OPERATION CALLSIGN</label>
            <input
              type="text"
              className={styles.input}
              defaultValue="OPERATION AZURE SHIELD"
              spellCheck={false}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
              <Zap size={12} style={{ display: 'inline' }} /> CLAUDE API KEY
              <span className={styles.optional}>(optional — enables AI reasoning)</span>
            </label>
            <input
              type="password"
              className={styles.input}
              placeholder="sk-ant-..."
              spellCheck={false}
              onChange={(e) => {
                if (e.target.value) {
                  sessionStorage.setItem('tenxy_api_key', e.target.value)
                }
              }}
            />
            <span className={styles.hint}>
              Stored in session memory only. Never saved or transmitted.
            </span>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
              <Navigation size={12} style={{ display: 'inline' }} /> MAPBOX ACCESS TOKEN
              <span className={styles.required}>(pre-loaded - ready to use)</span>
            </label>
            <input
              type="password"
              className={styles.input}
              defaultValue={MAPBOX_TOKEN}
              spellCheck={false}
              onChange={(e) => {
                if (e.target.value) {
                  sessionStorage.setItem('tenxy_mapbox_token', e.target.value)
                }
              }}
            />
            <span className={styles.hint}>
              Your token is automatically loaded. Enables 3D satellite visuals.
            </span>
          </div>

          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label}>FLEET SIZE (4–24 drones)</label>
              <input
                type="number"
                className={styles.input}
                defaultValue={parseInt(sessionStorage.getItem('tenxy_fleet_size') || '12')}
                min={4}
                max={24}
                onChange={(e) => {
                  const v = Math.max(4, Math.min(24, parseInt(e.target.value) || 12))
                  sessionStorage.setItem('tenxy_fleet_size', String(v))
                }}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>GRID SIZE</label>
              <input
                type="text"
                className={styles.input}
                defaultValue="8 × 8"
                readOnly
              />
            </div>
          </div>
        </div>

        <div className={styles.deploySection}>
          <GlowButton onClick={handleDeploy} fullWidth>
            ▶ DEPLOY SWARM
          </GlowButton>
        </div>

        <div className={styles.version}>
          TENXY COMMAND v4.2.0-STABLE // SWARM PROTOCOL ACTIVE
        </div>
      </div>
    </div>
  )
}
