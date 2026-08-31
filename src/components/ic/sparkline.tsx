type Props = {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
};

export function Sparkline({
  values,
  color = "var(--via-blue)",
  width = 80,
  height = 28,
}: Props) {
  if (!values || values.length === 0) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values
    .map((v, i) => `${i * step},${height - ((v - min) / range) * height}`)
    .join(" ");
  const lastIdx = values.length - 1;
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={lastIdx * step}
        cy={height - ((values[lastIdx] - min) / range) * height}
        r={2.5}
        fill={color}
      />
    </svg>
  );
}
