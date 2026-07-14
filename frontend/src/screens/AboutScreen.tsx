import { useEffect, useState } from 'react'
import { TopNav } from '../components/shared/TopNav'
import { PrimaryBtn } from '../components/shared/PrimaryBtn'
import { useNavigate } from 'react-router-dom'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        fontFamily: 'var(--font-serif)',
        fontSize: 22,
        fontWeight: 500,
        color: 'var(--tl-ink)',
      }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Para({ children, isMobile }: { children: React.ReactNode; isMobile?: boolean }) {
  return (
    <p style={{
      fontSize: isMobile ? 15 : 16,
      lineHeight: 1.75,
      color: 'var(--tl-muted)',
      margin: 0,
    }}>
      {children}
    </p>
  )
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div style={{
      background: 'var(--tl-surface)',
      border: '0.5px solid var(--tl-border)',
      borderRadius: 14,
      padding: '20px 24px',
      textAlign: 'center',
      flex: '1 1 140px',
    }}>
      <div style={{
        fontFamily: 'var(--font-serif)',
        fontSize: 32,
        fontWeight: 500,
        color: 'var(--tl-ink)',
        lineHeight: 1.1,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: 13,
        color: 'var(--tl-muted)',
        marginTop: 6,
      }}>
        {label}
      </div>
    </div>
  )
}

export function AboutScreen() {
  const navigate = useNavigate()
  const [viewportW, setViewportW] = useState(window.innerWidth)
  useEffect(() => {
    const h = () => setViewportW(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  const isMobile = viewportW < 768

  const pad = isMobile ? '24px 22px 40px' : '52px 56px 64px'
  const maxW = 680

  return (
    <div dir="rtl" lang="he" style={{
      minHeight: '100vh',
      background: 'var(--tl-page)',
      fontFamily: 'var(--font-ui)',
    }}>
      <TopNav active="about" compact={isMobile} safeTop={isMobile ? 50 : 0} />

      <div style={{ padding: pad, maxWidth: maxW + (isMobile ? 0 : 112), margin: '0 auto' }}>
        <div style={{ maxWidth: maxW }}>

          {/* Hero */}
          <div style={{ marginBottom: isMobile ? 32 : 44 }}>
            <div style={{
              fontSize: isMobile ? 13 : 14,
              fontWeight: 600,
              color: 'oklch(0.55 0.1 60)',
              letterSpacing: '0.04em',
              marginBottom: 10,
            }}>
              אודות הפרויקט
            </div>
            <h1 style={{
              fontFamily: 'var(--font-serif)',
              fontSize: isMobile ? 30 : 42,
              fontWeight: 500,
              lineHeight: 1.15,
              color: 'var(--tl-ink)',
              margin: '0 0 14px',
            }}>
              ivrit.ai — עברית בקוד פתוח
            </h1>
            <p style={{
              fontSize: isMobile ? 15 : 17,
              lineHeight: 1.65,
              color: 'var(--tl-muted)',
              margin: 0,
            }}>
              פרויקט קהילתי שמטרתו לבנות משאבי שפה פתוחים לעברית — כדי שטכנולוגיית הבינה המלאכותית תדבר גם עברית, וגם תבין אותה.
            </p>
          </div>

          <div style={{ height: 1, background: 'var(--tl-border)', marginBottom: isMobile ? 28 : 36 }} />

          {/* Sections */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 28 : 36 }}>

            <Section title="מה זה ivrit.ai?">
              <Para isMobile={isMobile}>
                ivrit.ai הוא יוזמה קהילתית לבניית מאגר נתוני שמע ודיבור פתוח בשפה העברית. מאגרי הנתונים הגדולים שמאמנים מודלים של זיהוי דיבור וייצור טקסט כמעט ולא כוללים עברית — והתוצאה היא שמודלים בינה מלאכותית מדברים עברית חצי-אפויה.
              </Para>
              <Para isMobile={isMobile}>
                המטרה של ivrit.ai היא לשנות את זה: לאסוף, לתמלל ולשחרר לציבור כמות גדולה ככל האפשר של חומרי שמע ומלל בעברית — כך שכל חוקר, יזם, או מפתח יוכל לאמן מודלים איכותיים על השפה שלנו.
              </Para>
            </Section>

            <Section title="מה תפקיד הכלי הזה?">
              <Para isMobile={isMobile}>
                כלי התמלול הזה הוא חלק מתשתית האיסוף של ivrit.ai. אנחנו מציגים לכם דפים ממסמכים היסטוריים, כתבי עת, מחברות ועוד — ואתם מקלידים את מה שרשום בהם, שורה אחר שורה.
              </Para>
              <Para isMobile={isMobile}>
                כל תעתוק שתורמים שומר בסופו של דבר כחלק ממאגר הטקסט הפתוח. ממנו ניתן לאמן מודלים לעיבוד שפה טבעית, לשפר תוצאות חיפוש בעברית, לפתח מנועי OCR ועוד.
              </Para>
            </Section>

            <Section title="למה זה חשוב?">
              <Para isMobile={isMobile}>
                ישנו פער עצום בין כמות הנתונים הפתוחים הקיימים בשפות אחרות ובין מה שקיים לעברית. הפרויקט מאמין שקהילה יכולה לגשר על הפער הזה — מתנדב אחרי מתנדב, דף אחרי דף.
              </Para>
              <Para isMobile={isMobile}>
                כל שורה שאתם מתמללים מוסיפה לבניין משותף: עברית דיגיטלית, פתוחה, נגישה לכולם.
              </Para>
            </Section>

            <div style={{ height: 1, background: 'var(--tl-border)' }} />

            {/* Stats */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <StatCard value="קוד פתוח" label="כל הנתונים חופשיים לשימוש" />
              <StatCard value="מתנדבים" label="עשרות אלפי שעות עבודה קהילתית" />
              <StatCard value="עברית" label="שפה שראויה לטכנולוגיה מהשורה הראשונה" />
            </div>

            <div style={{ height: 1, background: 'var(--tl-border)' }} />

            {/* CTA */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Para isMobile={isMobile}>
                רוצים ללמוד עוד על הפרויקט, לראות את הנתונים הפתוחים, או להצטרף לקהילה?
              </Para>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                <a
                  href="https://ivrit.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: 15,
                    fontWeight: 500,
                    color: '#fff',
                    background: 'var(--tl-ink)',
                    borderRadius: 10,
                    padding: '10px 20px',
                    textDecoration: 'none',
                    display: 'inline-block',
                    transition: 'opacity 0.15s',
                  }}
                >
                  אתר ivrit.ai ↗
                </a>
                <a
                  href="https://collect-handwriting.ivrit.ai/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontFamily: 'var(--font-ui)',
                    fontSize: 15,
                    fontWeight: 500,
                    color: 'var(--tl-ink)',
                    background: 'transparent',
                    border: '1px solid var(--tl-border)',
                    borderRadius: 10,
                    padding: '10px 20px',
                    textDecoration: 'none',
                    display: 'inline-block',
                    transition: 'opacity 0.15s',
                  }}
                >
                  תרומת כתב יד ↗
                </a>
                <PrimaryBtn size="md" onClick={() => navigate('/work')}>
                  התחלו לתרום עכשיו
                </PrimaryBtn>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
