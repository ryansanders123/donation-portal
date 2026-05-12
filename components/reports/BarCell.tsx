export function BarCell({ text, pct }: { text: string; pct: number }) {
  const width = Math.max(0, Math.min(1, pct)) * 100;
  return (
    <td className="bar-cell">
      <span className="bar-fill" style={{ width: `${width}%` }} />
      <span className="bar-text tabular-nums">{text}</span>
    </td>
  );
}
