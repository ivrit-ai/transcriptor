import { useState, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api";
import { Icon } from "./shared";

export function ReportProblemModal({
  pageId,
  lineId,
  initialDescription = "",
  onClose,
}: {
  pageId?: string;
  lineId?: string;
  initialDescription?: string;
  onClose: () => void;
}) {
  const [description, setDescription] = useState(initialDescription);
  const [submitted, setSubmitted] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const isMobile = window.innerWidth < 768;

  useEffect(() => {
    taRef.current?.focus();
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const mutation = useMutation({
    mutationFn: () =>
      pageId
        ? api.reportProblem(pageId, { description: description.trim(), line_id: lineId })
        : api.reportGeneralProblem({ description: description.trim() }),
    onSuccess: () => {
      setSubmitted(true);
      setTimeout(onClose, 1400);
    },
  });

  const trimmed = description.trim();
  const canSubmit = trimmed.length >= 3 && !mutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    mutation.mutate();
  };

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="דיווח על בעיה"
      dir="rtl"
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
          maxWidth: 440,
          maxHeight: isMobile ? "100vh" : "auto",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 12px 60px rgba(30,22,12,0.25)",
        }}
      >
        <div
          style={{
            padding: isMobile ? "14px 16px" : "18px 22px 14px",
            borderBottom: "0.5px solid var(--tl-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 19,
              fontWeight: 500,
              color: "var(--tl-ink)",
            }}
          >
            דיווח על בעיה
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
            }}
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <div style={{ padding: isMobile ? "16px" : "20px 22px", fontFamily: "var(--font-ui)" }}>
          {submitted ? (
            <div
              style={{
                textAlign: "center",
                padding: "24px 0",
                color: "oklch(0.5 0.09 150)",
                fontWeight: 600,
                fontSize: 15,
              }}
            >
              תודה! הדיווח נשלח.
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label style={{ fontSize: 13, color: "var(--tl-muted)", lineHeight: 1.5 }}>
                מה הבעיה שנתקלת בה? (למשל: תמונה לא ברורה, תקלה טכנית, טעות בהנחיות)
              </label>
              <textarea
                ref={taRef}
                dir="rtl"
                lang="he"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="תארו את הבעיה בקצרה…"
                rows={5}
                maxLength={2000}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  resize: "vertical",
                  fontFamily: "var(--font-ui)",
                  fontSize: 14,
                  color: "var(--tl-ink)",
                  background: "var(--tl-surface)",
                  border: "0.5px solid var(--tl-border)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  outline: "none",
                }}
              />
              {mutation.isError && (
                <div style={{ fontSize: 12, color: "oklch(0.55 0.16 30)" }}>
                  שליחת הדיווח נכשלה. נסו שוב.
                </div>
              )}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "0.5px solid var(--tl-border)",
                    background: "var(--tl-muted-fill)",
                    color: "var(--tl-ink)",
                    cursor: "pointer",
                    fontFamily: "var(--font-ui)",
                    fontSize: 13,
                  }}
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 8,
                    border: "none",
                    background: canSubmit ? "var(--tl-accent)" : "var(--tl-muted-fill)",
                    color: canSubmit ? "#fff" : "var(--tl-muted)",
                    cursor: canSubmit ? "pointer" : "not-allowed",
                    fontFamily: "var(--font-ui)",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {mutation.isPending ? "שולח…" : "שלחו דיווח"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
