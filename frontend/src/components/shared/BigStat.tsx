interface BigStatProps {
  value: string | number
  label: string
  accent?: string
  size?: number
  sub?: string
}

export function BigStat({ value, label, accent = 'var(--tl-ink)', size = 40, sub }: BigStatProps) {
  return (
    <div>
      <div style={{
        fontFamily: 'var(--font-serif)',
        fontSize: size,
        fontWeight: 700,
        color: accent,
        lineHeight: 1,
        direction: 'ltr',
        textAlign: 'right',
      }}>
        {value}
      </div>
      <div style={{
        fontFamily: 'var(--font-ui)',
        fontSize: 14,
        color: 'var(--tl-muted)',
        marginTop: 6,
      }}>
        {label}
      </div>
      {sub && (
        <div style={{
          fontFamily: 'var(--font-ui)',
          fontSize: 12,
          color: 'var(--tl-muted)',
          marginTop: 2,
          opacity: 0.8,
        }}>
          {sub}
        </div>
      )}
    </div>
  )
}
