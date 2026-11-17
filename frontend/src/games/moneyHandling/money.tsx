/**
 * Simplified ₹ tokens (docs/games/research.md D5): the right colour family and a large value,
 * with no portraits, emblems or security features, so they can never pass for real money.
 */

const NOTE_LOOK: Record<number, { fill: string; text: string }> = {
  10: { fill: "var(--color-note-10)", text: "var(--color-surface)" },
  20: { fill: "var(--color-note-20)", text: "var(--color-ink)" },
  50: { fill: "var(--color-note-50)", text: "var(--color-ink)" },
  100: { fill: "var(--color-note-100)", text: "var(--color-ink)" },
  200: { fill: "var(--color-note-200)", text: "var(--color-ink)" },
};

export function NoteArt({ value, className = "" }: { value: number; className?: string }) {
  const look = NOTE_LOOK[value] ?? NOTE_LOOK[10]!;
  return (
    <svg viewBox="0 0 120 60" aria-hidden="true" className={className}>
      <rect x={2} y={2} width={116} height={56} rx={6} fill={look.fill} stroke="var(--color-ink)" strokeWidth={3} />
      <rect x={9} y={9} width={102} height={42} rx={3} fill="none" stroke={look.text} strokeOpacity={0.45} strokeWidth={2} />
      <circle cx={96} cy={30} r={11} fill="none" stroke={look.text} strokeOpacity={0.45} strokeWidth={2} />
      <text x={50} y={31} textAnchor="middle" dominantBaseline="central" fill={look.text} fontSize={26} fontWeight={800}>
        ₹{value}
      </text>
    </svg>
  );
}

export function CoinArt({ value, className = "" }: { value: number; className?: string }) {
  return (
    <svg viewBox="0 0 60 60" aria-hidden="true" className={className}>
      <circle cx={30} cy={30} r={27} fill="var(--color-coin)" stroke="var(--color-ink)" strokeWidth={3} />
      <circle cx={30} cy={30} r={21} fill="none" stroke="var(--color-ink)" strokeOpacity={0.35} strokeWidth={2} />
      <text x={30} y={31} textAnchor="middle" dominantBaseline="central" fill="var(--color-ink)" fontSize={20} fontWeight={800}>
        ₹{value}
      </text>
    </svg>
  );
}
