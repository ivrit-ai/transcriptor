import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { TopNav, Icon, PrimaryBtn } from "../components/shared";
import { SAMPLE_PAGE } from "../components/shared/ManuscriptPreview";

const RULES = [
  {
    t: "מעתיקים בדיוק מה שרואים",
    d: 'כולל שגיאות כתיב או קיצורים. אל תתקנו ואל "תשפרו" את הטקסט.',
    ok: true,
  },
  {
    t: "לא ממציאים מה שלא ברור",
    d: "אם אות או מילה מטושטשת, עדיף לדווח מאשר לנחש.",
    ok: false,
  },
  {
    t: "לא מוסיפים פרשנות",
    d: "בלי הערות, סוגריים או הסברים משלכם. רק הטקסט עצמו.",
    ok: false,
  },
];

const FLAG_CARDS = [
  { label: "תמונה חתוכה", d: "השורה חתוכה בקצה או שחלק ממנה חסר בסריקה." },
  { label: "לא עברית", d: "הטקסט כולו בשפה אחרת." },
  { label: "לא טקסט", d: "איור, חותמת, קישוט או שוליים ריקים." },
  { label: "לא מצליח לקרוא", d: "דהוי, מטושטש או בכתב יד שאי אפשר לפענח." },
];

const FAQ_ITEMS: { q: string; a: string; caption?: string }[] = [
  {
    q: "האם לתקן שגיאות כתיב?",
    a: "לא. יש לתעתק את הכתוב כפי שהוא, גם כאשר קיימת שגיאת כתיב ברורה. אין להשלים אות או מילה חסרה לפי הדקדוק או לפי ההקשר.",
  },
  {
    q: "האם להשלים קיצורים וראשי תיבות?",
    a: "לא. יש להעתיק את הקיצור כפי שהוא מופיע, כולל גרש או גרשיים אם הם קיימים. אין להרחיב ראשי תיבות למילים מלאות.",
  },
  {
    q: "האם לתעתק גרשיים, מקפים וסימני פיסוק?",
    a: "כן. יש להעתיק סימני פיסוק שנראים בבירור. אין להוסיף פסיקים, נקודות או סימנים שאינם מופיעים במקור.",
  },
  {
    q: "מה עושים כשהכתיבה עוברת לאנגלית?",
    a: "יש להקליד את האנגלית בסדר הרגיל שלה, משמאל לימין. אין להפוך את סדר האותיות, גם אם המילה מופיעה בתוך שורה עברית. תווים בעברית נכתבים מימין לשמאל, תווים באנגלית וספרות נכתבים משמאל לימין — התוצאה צריכה להיראות כפי שהיא נראית בכתב.",
    caption: "ניתוח השונות שבוצע הינו Two-way ANOVA",
  },
  {
    q: "מה לעשות כשיש מילה, אות או שורה לא ברורה?",
    a: 'אם כל השורה או רובה לא ברורות, ניתן לסמן בעזרת הכפתור "לא ניתן לקרוא". אם רק מילה אחת או אות אחת לא ברורות, ניתן לתעתק את מה שאפשר.',
  },
  {
    q: "מה עושים אם חלק מהטקסט חתוך בקצה התמונה?",
    a: "יש לתעתק רק את מה שנראה בפועל. אין להשלים מילים שנמצאות מחוץ לתמונה.",
  },
  {
    q: "האם לתעתק ניקוד?",
    a: "אין צורך.",
  },
  {
    q: "האם לתעתק טקסט מודפס שמופיע לצד כתב היד?",
    a: "כן.",
  },
];

const ADVANCED_ITEMS: {
  q: string;
  a: string;
  examples?: string[];
  aExtra?: string;
}[] = [
  {
    q: "איך לכתוב מתמטיקה?",
    a: "מומלץ להבחין בין ביטוי פשוט לבין נוסחה מורכבת. ביטויים פשוטים יש להקליד באמצעות סימנים רגילים ככל האפשר:",
    examples: ["2 + 3 = 5", "x²", "1/2", "a < b", "אחרת: H1"],
    aExtra:
      'נוסחה מורכבת שקשה לייצג בטקסט רגיל תסומן כ"לא עברית" — אין לתאר אותה במילים ואין לנחש סימנים שאינם ברורים.',
  },
  {
    q: "מה עושים עם סימן שאינו קיים במקלדת?",
    a: 'יש לבחור את הסימן הקרוב ביותר מתוך לוח הסימנים של המערכת. אם אין סימן מתאים, אפשר לסמן "לא עברית" — אך לא להחליף אותו באות או בסימן אחר על סמך ניחוש.',
  },
];

function ExampleBox({ text }: { text: string }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-serif)",
        fontSize: 15,
        direction: "rtl",
        color: "var(--tl-ink)",
        background: "var(--tl-surface)",
        border: "0.5px solid var(--tl-border)",
        borderRadius: 8,
        padding: "8px 12px",
        marginTop: 8,
        lineHeight: 1.6,
      }}
    >
      {text}
    </div>
  );
}

function FaqItem({
  q,
  a,
  caption,
  examples,
  aExtra,
  isMobile,
}: {
  q: string;
  a: string;
  caption?: string;
  examples?: string[];
  aExtra?: string;
  isMobile?: boolean;
}) {
  return (
    <div
      style={{
        borderBottom: "0.5px solid var(--tl-border)",
        paddingBottom: isMobile ? 16 : 18,
      }}
    >
      <div
        style={{
          fontSize: isMobile ? 15 : 16,
          fontWeight: 600,
          color: "var(--tl-ink)",
          marginBottom: 6,
        }}
      >
        {q}
      </div>
      <div
        style={{
          fontSize: isMobile ? 13.5 : 14.5,
          color: "var(--tl-muted)",
          lineHeight: 1.6,
        }}
      >
        {a}
      </div>
      {examples && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginTop: 8,
          }}
        >
          {examples.map((ex) => (
            <span
              key={ex}
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 14,
                color: "var(--tl-ink)",
                background: "var(--tl-surface)",
                border: "0.5px solid var(--tl-border)",
                borderRadius: 6,
                padding: "3px 10px",
              }}
            >
              {ex}
            </span>
          ))}
        </div>
      )}
      {aExtra && (
        <div
          style={{
            fontSize: isMobile ? 13.5 : 14.5,
            color: "var(--tl-muted)",
            lineHeight: 1.6,
            marginTop: 8,
          }}
        >
          {aExtra}
        </div>
      )}
      {caption && <ExampleBox text={caption} />}
    </div>
  );
}

function RuleRow({
  t,
  d,
  ok,
  isMobile,
}: {
  t: string;
  d: string;
  ok: boolean;
  isMobile?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 13, alignItems: "flex-start" }}>
      <div
        style={{
          flex: "0 0 auto",
          width: 26,
          height: 26,
          borderRadius: 13,
          marginTop: 1,
          background: ok ? "oklch(0.92 0.05 150)" : "oklch(0.93 0.03 60)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon
          name={ok ? "check" : "close"}
          size={15}
          color={ok ? "oklch(0.5 0.1 150)" : "oklch(0.55 0.1 50)"}
          strokeWidth={2.2}
        />
      </div>
      <div>
        <div
          style={{
            fontSize: isMobile ? 15 : 16,
            fontWeight: 600,
            color: "var(--tl-ink)",
          }}
        >
          {t}
        </div>
        <div
          style={{
            fontSize: isMobile ? 13.5 : 14.5,
            color: "var(--tl-muted)",
            marginTop: 2,
            lineHeight: 1.5,
          }}
        >
          {d}
        </div>
      </div>
    </div>
  );
}

function WorkedExample({ width }: { width: number }) {
  return (
    <div
      style={{
        background: "var(--tl-surface)",
        border: "0.5px solid var(--tl-border)",
        borderRadius: 16,
        padding: 20,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--tl-muted)",
          marginBottom: 10,
        }}
      >
        השורה המודגשת
      </div>
      <img style={{ width, borderRadius: 8 }} src={SAMPLE_PAGE.image_url}></img>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          margin: "10px 0 8px",
          fontFamily: "var(--font-ui)",
          fontSize: 13,
          color: "var(--tl-muted)",
        }}
      >
        <Icon name="forward" size={14} color="var(--tl-muted)" />
        <span>מקלידים</span>
      </div>
      <div
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 17,
          lineHeight: 1.6,
          color: "var(--tl-ink)",
          direction: "rtl",
          textAlign: "right",
          background: "var(--tl-page)",
          border: "0.5px solid var(--tl-border)",
          borderRadius: 8,
          padding: "10px 14px",
        }}
      >
        במפגש אחר הוא פוגש אדם חולה.
      </div>
    </div>
  );
}

export function GuidelinesScreen() {
  const navigate = useNavigate();
  const [viewportW, setViewportW] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setViewportW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  const isMobile = viewportW < 768;

  const intro = (
    <>
      <div
        style={{
          fontSize: isMobile ? 13 : 14,
          fontWeight: 600,
          color: "oklch(0.55 0.1 60)",
          letterSpacing: "0.04em",
          marginBottom: 10,
        }}
      >
        מדריך קצר
      </div>
      <h1
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: isMobile ? 30 : 40,
          fontWeight: 500,
          lineHeight: 1.15,
          color: "var(--tl-ink)",
          margin: "0 0 12px",
        }}
      >
        איך לתעתק נכון
      </h1>
      <p
        style={{
          fontSize: isMobile ? 15 : 17,
          lineHeight: 1.6,
          color: "var(--tl-muted)",
          margin: 0,
          maxWidth: 540,
        }}
      >
        מעתיקים בדיוק מה שרואים — אפילו שגיאות כתיב. כמה כללים שיעזרו:
      </p>
    </>
  );

  const rulesBlock = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: isMobile ? 16 : 18,
      }}
    >
      {RULES.map((r, i) => (
        <RuleRow key={i} {...r} isMobile={isMobile} />
      ))}
    </div>
  );

  const flagBlock = (
    <div>
      <div
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: isMobile ? 19 : 22,
          fontWeight: 500,
          color: "var(--tl-ink)",
          marginBottom: 4,
        }}
      >
        מתי לדווח על שורה
      </div>
      <p
        style={{
          fontSize: isMobile ? 14 : 15,
          color: "var(--tl-muted)",
          margin: "0 0 16px",
          lineHeight: 1.5,
        }}
      >
        אם השורה לא ניתנת לתעתוק, סמנו את הסיבה לכך והמשיכו. דיווח הוא חלק
        נורמלי מהעבודה — לא טעות.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 10,
        }}
      >
        {FLAG_CARDS.map((f) => (
          <div
            key={f.label}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              background: "var(--tl-surface)",
              border: "0.5px solid var(--tl-border)",
              borderRadius: 12,
              padding: "12px 14px",
            }}
          >
            <Icon name="flag" size={16} color="var(--tl-muted)" />
            <div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  color: "var(--tl-ink)",
                }}
              >
                {f.label}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--tl-muted)",
                  marginTop: 2,
                  lineHeight: 1.45,
                }}
              >
                {f.d}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const faqBlock = (
    <div>
      <div
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: isMobile ? 19 : 22,
          fontWeight: 500,
          color: "var(--tl-ink)",
          marginBottom: 18,
        }}
      >
        שאלות נפוצות
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 16 : 18 }}>
        {FAQ_ITEMS.map((item) => (
          <FaqItem key={item.q} {...item} isMobile={isMobile} />
        ))}
      </div>
    </div>
  );

  const advancedBlock = (
    <div>
      <div
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: isMobile ? 19 : 22,
          fontWeight: 500,
          color: "var(--tl-ink)",
          marginBottom: 18,
        }}
      >
        למתקדמים
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: isMobile ? 16 : 18 }}>
        {ADVANCED_ITEMS.map((item) => (
          <FaqItem key={item.q} {...item} isMobile={isMobile} />
        ))}
      </div>
    </div>
  );

  const divider = (
    <div style={{ height: 1, background: "var(--tl-border)" }} />
  );

  const pad = isMobile ? "24px 22px 30px" : "44px 56px 56px";

  if (isMobile) {
    return (
      <div
        dir="rtl"
        lang="he"
        style={{
          minHeight: "100vh",
          background: "var(--tl-page)",
          fontFamily: "var(--font-ui)",
        }}
      >
        <TopNav active="guide" compact safeTop={50} />
        <div
          style={{
            padding: pad,
            display: "flex",
            flexDirection: "column",
            gap: 26,
          }}
        >
          <div>{intro}</div>
          <WorkedExample width={272} />
          {rulesBlock}
          {flagBlock}
          {divider}
          {faqBlock}
          {divider}
          {advancedBlock}
          <PrimaryBtn
            size="lg"
            onClick={() => navigate("/work")}
            style={{ width: "100%", justifyContent: "center" }}
          >
            התחל לתעתק <Icon name="forward" size={17} color="#fff" />
          </PrimaryBtn>
        </div>
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      lang="he"
      style={{
        minHeight: "100vh",
        background: "var(--tl-page)",
        fontFamily: "var(--font-ui)",
      }}
    >
      <TopNav active="guide" />
      <div style={{ padding: pad }}>
        <div style={{ marginBottom: 36 }}>{intro}</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 380px",
            gap: 44,
            alignItems: "start",
            marginBottom: 44,
          }}
        >
          {rulesBlock}
          <WorkedExample width={340} />
        </div>
        <div
          style={{
            height: 1,
            background: "var(--tl-border)",
            margin: "0 0 36px",
          }}
        />
        {flagBlock}
        <div
          style={{
            height: 1,
            background: "var(--tl-border)",
            margin: "36px 0",
          }}
        />
        {faqBlock}
        <div
          style={{
            height: 1,
            background: "var(--tl-border)",
            margin: "36px 0",
          }}
        />
        {advancedBlock}
        <div style={{ marginTop: 40 }}>
          <PrimaryBtn size="lg" onClick={() => navigate("/work")}>
            התחל לתעתק <Icon name="forward" size={18} color="#fff" />
          </PrimaryBtn>
        </div>
      </div>
    </div>
  );
}
