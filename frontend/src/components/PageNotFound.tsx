import { Icon } from './shared'

// Shown inline inside WorkScreen when /work/:pageId points at a page that no
// longer exists (backend returns 404 for GET /api/sessions/{pageId}) — e.g. a
// stale link. Distinct from the "all caught up" (/done) case: there, no work
// is left at all; here, this specific page just isn't a valid target, so we
// offer a way back into the loop rather than sending the user to /done.
export function PageNotFound({
  onNextPage,
  onBackToProgress,
  onReportProblem,
}: {
  onNextPage: () => void
  onBackToProgress: () => void
  onReportProblem: () => void
}) {
  return (
    <div style={{
      flex: 1,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: 32, gap: 18,
      background: 'var(--tl-page)',
    }}>
      <div style={{ position: 'relative', width: 72, height: 72 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: 'oklch(0.9 0.05 60)',
        }} />
        <div style={{
          position: 'absolute', inset: 12, borderRadius: '50%',
          background: 'oklch(0.85 0.08 60)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="image" size={26} color="oklch(0.5 0.1 60)" strokeWidth={2} />
        </div>
      </div>

      <div>
        <div style={{
          fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 500,
          color: 'var(--tl-ink)',
        }}>
          העמוד הזה לא נמצא
        </div>
        <div style={{
          fontFamily: 'var(--font-ui)', fontSize: 14.5, color: 'var(--tl-muted)',
          marginTop: 8, maxWidth: 340, lineHeight: 1.6,
        }}>
          יתכן ואינו אושר עדיין, הקישור אינו תקין או שהעמוד הוסר
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', maxWidth: 300, marginTop: 6 }}>
        <button
          onClick={onNextPage}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 600, color: '#fff',
            background: 'var(--tl-accent)', border: 'none', borderRadius: 10,
            padding: '11px 22px', cursor: 'pointer',
            transition: 'background 0.15s',
          }}
        >
          תעתק עמוד אחר <Icon name="forward" size={16} color="#fff" />
        </button>
        <button
          onClick={onBackToProgress}
          style={{
            fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 500,
            color: 'var(--tl-ink)',
            background: 'var(--tl-muted-fill)', border: '0.5px solid var(--tl-border)',
            borderRadius: 10, padding: '10px 22px', cursor: 'pointer',
          }}
        >
          חזרה לעמוד ההתקדמות שלך
        </button>
      </div>

      <button
        onClick={onReportProblem}
        style={{
          marginTop: 4,
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'var(--font-ui)', fontSize: 12.5, color: 'var(--tl-muted)',
          textDecoration: 'underline', textUnderlineOffset: 2,
        }}
      >
        ציפית לעמוד כאן? דיווח על תקלה
      </button>
    </div>
  )
}
