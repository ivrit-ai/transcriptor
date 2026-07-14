import styles from './ActionBar.module.css'

interface ActionBarProps {
  onSubmit: () => void
  onFlagOpen: () => void
  canSubmit: boolean
}

export function ActionBar({ onSubmit, onFlagOpen, canSubmit }: ActionBarProps) {
  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={styles.flagBtn}
        onClick={onFlagOpen}
        aria-label="דיווח על שורה"
      >
        ⚑ לא קריא / דיווח
      </button>
      <span className={styles.hint}>לחצו F בשדה ריק לדיווח</span>
      <button
        type="button"
        className={styles.submitBtn}
        onClick={onSubmit}
        disabled={!canSubmit}
        aria-label="שילחו תעתוק והמשיכו לשורה הבאה"
      >
        שילחו והמשיכו ←
      </button>
    </div>
  )
}
