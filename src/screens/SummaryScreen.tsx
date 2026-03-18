import { useNavigate } from 'react-router-dom'
import { Download, Share2, Clock, Users, Zap, CheckCircle, ArrowLeft } from 'lucide-react'
import { useSim } from '../context/SimulationContext'
import GlowButton from '../components/shared/GlowButton'
import styles from './SummaryScreen.module.css'

export default function SummaryScreen() {
  const navigate = useNavigate()
  const { survivors, missionTime, coverage } = useSim()

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0')
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${h}:${m}:${s}`
  }

  const detectedCount = survivors.length
  const efficiency = Math.min(100, (detectedCount * 10) + (coverage * 0.5)).toFixed(1)

  return (
    <div className={styles.screen}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <button className={styles.backBtn} onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={18} />
          </button>
          <span className={styles.brandName}>MISSION LOG & REASONING</span>
        </div>
        <div className={styles.actions}>
          <GlowButton variant="secondary" onClick={() => window.print()}>
            <Download size={14} />
            EXPORT REPORT
          </GlowButton>
          <button className={styles.iconBtn}>
            <Share2 size={18} />
          </button>
        </div>
      </header>

      <div className={styles.content}>
        <div className={styles.missionHeader}>
          <span className={styles.badge}>● POST-MISSION ANALYSIS</span>
          <h1 className={styles.missionTitle}>Mission Alpha-7 Summary</h1>
          <p className={styles.missionSub}>Autonomous Drone Fleet 12 • Search & Rescue Operations</p>
        </div>

        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>
              <Clock size={14} /> TOTAL DURATION
            </span>
            <span className={styles.statValue}>{formatTime(missionTime)}</span>
            <span className={styles.statDelta}>MISSION DURATION REAL-TIME</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>
              <Users size={14} /> SIGNATURES DETECTED
            </span>
            <span className={styles.statValue}>{detectedCount.toString().padStart(2, '0')}</span>
            <span className={styles.statDelta}>SIGNATURES VERIFIED</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statLabel}>
              <Zap size={14} /> EFFICIENCY SCORE
            </span>
            <span className={styles.statValue}>{efficiency}%</span>
            <span className={styles.statDelta}>SWARM OPTIMIZATION LEVEL</span>
          </div>
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>
            <CheckCircle size={16} className={styles.sectionIcon} />
            Tactical Objectives
          </h2>
          <div className={styles.checkList}>
            <div className={styles.checkItem}>
              <span className={`${styles.checkDot} ${coverage > 30 ? styles.checked : ''}`} />
              <div>
                <strong>Area Scanned</strong>
                <p className={styles.checkSub}>{coverage.toFixed(1)}% of high-priority sector covered.</p>
              </div>
            </div>
            <div className={styles.checkItem}>
              <span className={`${styles.checkDot} ${detectedCount > 0 ? styles.checked : ''}`} />
              <div>
                <strong>Survivors Located</strong>
                <p className={styles.checkSub}>{detectedCount} potential thermal signatures identified.</p>
              </div>
            </div>
            <div className={styles.checkItem}>
              <span className={`${styles.checkDot} ${coverage > 80 ? styles.checked : ''}`} />
              <div>
                <strong>Rescue Teams Notified</strong>
                <p className={styles.checkSub}>{coverage > 80 ? 'Verification complete. Teams deployed.' : 'Awaiting critical coverage threshold.'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.newMission}>
          <GlowButton onClick={() => navigate('/')}>
            START NEW MISSION
          </GlowButton>
        </div>
      </div>
    </div>
  )
}
