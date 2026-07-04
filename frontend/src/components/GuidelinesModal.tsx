import { useState, useMemo, useEffect } from "react";
import { RULES, FLAG_CARDS, FAQ_ITEMS, ADVANCED_ITEMS } from "../domain-knowledge/guidelinesData";
import { Icon } from "./shared";

function includesIgnoreCase(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase());
}

function allItemTexts(
  item:
    | (typeof FAQ_ITEMS)[number]
    | (typeof ADVANCED_ITEMS)[number]
    | (typeof RULES)[number]
    | (typeof FLAG_CARDS)[number],
): string[] {
  if ("t" in item) return [item.t, item.d];
  if ("label" in item) return [item.label, item.d];
  const qa = item as (typeof FAQ_ITEMS)[number] | (typeof ADVANCED_ITEMS)[number];
  const texts = [qa.q, qa.a];
  if ("caption" in qa && qa.caption) texts.push(qa.caption);
  if ("aExtra" in qa && qa.aExtra) texts.push(qa.aExtra);
  if ("examples" in qa && qa.examples) texts.push(...qa.examples);
  return texts;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 20,
          fontWeight: 500,
          color: "var(--tl-ink)",
          marginBottom: 14,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

export function GuidelinesModal({ onClose }: { onClose: () => void }) {
  const [search, setSearch] = useState("");
  const isMobile = window.innerWidth < 768;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const filteredRules = useMemo(
    () => RULES.filter((r) => !search || allItemTexts(r).some((t) => includesIgnoreCase(t, search))),
    [search],
  );
  const filteredFlags = useMemo(
    () => FLAG_CARDS.filter((f) => !search || allItemTexts(f).some((t) => includesIgnoreCase(t, search))),
    [search],
  );
  const filteredFaq = useMemo(
    () => FAQ_ITEMS.filter((f) => !search || allItemTexts(f).some((t) => includesIgnoreCase(t, search))),
    [search],
  );
  const filteredAdvanced = useMemo(
    () => ADVANCED_ITEMS.filter((a) => !search || allItemTexts(a).some((t) => includesIgnoreCase(t, search))),
    [search],
  );

  const hasResults =
    filteredRules.length > 0 ||
    filteredFlags.length > 0 ||
    filteredFaq.length > 0 ||
    filteredAdvanced.length > 0;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="הנחיות לתעתוק"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(30,22,12,0.45)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--tl-page)",
          borderRadius: isMobile ? 0 : 16,
          width: "100%",
          maxWidth: 640,
          maxHeight: isMobile ? "100vh" : "85vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 12px 60px rgba(30,22,12,0.25)",
        }}
      >
        <div
          style={{
            padding: isMobile ? "10px 12px" : "16px 22px 12px",
            borderBottom: "0.5px solid var(--tl-border)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div style={{ flex: 1, position: "relative" }}>
            <input
              type="text"
              dir="rtl"
              placeholder="חיפוש…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                fontFamily: "var(--font-ui)",
                fontSize: 15,
                color: "var(--tl-ink)",
                background: "var(--tl-surface)",
                border: "0.5px solid var(--tl-border)",
                borderRadius: 10,
                padding: "9px 12px",
                outline: "none",
                boxSizing: "border-box",
                direction: "rtl",
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                style={{
                  position: "absolute",
                  left: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--tl-muted)",
                  padding: 4,
                  lineHeight: 0,
                }}
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--tl-muted)",
              padding: 4,
              lineHeight: 0,
              flexShrink: 0,
            }}
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: isMobile ? "16px 14px" : "22px",
            direction: "rtl",
            fontFamily: "var(--font-ui)",
          }}
        >
          {!hasResults && (
            <div
              style={{
                textAlign: "center",
                color: "var(--tl-muted)",
                fontSize: 15,
                padding: "40px 0",
              }}
            >
              לא נמצאו תוצאות
            </div>
          )}

          {filteredRules.length > 0 && (
            <Section title="כללים">
              {filteredRules.map((r, i) => (
                <RuleRow key={i} {...r} />
              ))}
            </Section>
          )}

          {filteredFlags.length > 0 && (
            <Section title="מתי לדווח על שורה">
              {filteredFlags.map((f, i) => (
                <FlagCard key={i} {...f} />
              ))}
            </Section>
          )}

          {filteredFaq.length > 0 && (
            <Section title="שאלות נפוצות">
              {filteredFaq.map((item) => (
                <FaqItem key={item.q} {...item} />
              ))}
            </Section>
          )}

          {filteredAdvanced.length > 0 && (
            <Section title="למתקדמים">
              {filteredAdvanced.map((item) => (
                <FaqItem key={item.q} {...item} />
              ))}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function RuleRow({ t, d, ok }: { t: string; d: string; ok: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        marginBottom: 12,
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: 22,
          height: 22,
          borderRadius: 11,
          marginTop: 1,
          background: ok ? "oklch(0.92 0.05 150)" : "oklch(0.93 0.03 60)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon
          name={ok ? "check" : "close"}
          size={12}
          color={ok ? "oklch(0.5 0.1 150)" : "oklch(0.55 0.1 50)"}
          strokeWidth={2.5}
        />
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: 15, color: "var(--tl-ink)" }}>
          {t}
        </div>
        <div
          style={{
            fontSize: 13.5,
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

function FlagCard({ label, d }: { label: string; d: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        marginBottom: 10,
        alignItems: "flex-start",
      }}
    >
      <Icon name="flag" size={14} color="var(--tl-muted)" />
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--tl-ink)" }}>
          {label}
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--tl-muted)",
            marginTop: 1,
            lineHeight: 1.45,
          }}
        >
          {d}
        </div>
      </div>
    </div>
  );
}

function FaqItem({
  q,
  a,
  caption,
  examples,
  aExtra,
}: {
  q: string;
  a: string;
  caption?: string;
  examples?: string[];
  aExtra?: string;
}) {
  return (
    <div
      style={{
        marginBottom: 16,
        paddingBottom: 16,
        borderBottom: "0.5px solid var(--tl-border)",
      }}
    >
      <div
        style={{
          fontWeight: 600,
          fontSize: 14.5,
          color: "var(--tl-ink)",
          marginBottom: 4,
        }}
      >
        {q}
      </div>
      <div
        style={{
          fontSize: 13.5,
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
            fontSize: 13.5,
            color: "var(--tl-muted)",
            lineHeight: 1.6,
            marginTop: 8,
          }}
        >
          {aExtra}
        </div>
      )}
      {caption && (
        <div
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 14,
            color: "var(--tl-ink)",
            background: "var(--tl-surface)",
            border: "0.5px solid var(--tl-border)",
            borderRadius: 8,
            padding: "8px 12px",
            marginTop: 8,
            lineHeight: 1.6,
            direction: "rtl",
          }}
        >
          {caption}
        </div>
      )}
    </div>
  );
}
