export function fmtTraffic(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(0) + "k";
  return n.toString();
}

export function fmtDelta(d: number, suffix: string = "%"): string {
  const sign = d > 0 ? "+" : "";
  return sign + d.toFixed(1) + suffix;
}
