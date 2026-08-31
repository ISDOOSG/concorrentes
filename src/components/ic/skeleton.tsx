// Skeleton primitives — DS-aligned, dark-mode friendly.

type Props = {
  width?: number | string;
  height?: number | string;
  rounded?: number | string;
  className?: string;
  style?: React.CSSProperties;
};

export function Skeleton({
  width = "100%",
  height = 16,
  rounded = 6,
  className,
  style,
}: Props) {
  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        width,
        height,
        borderRadius: rounded,
        background:
          "linear-gradient(90deg, var(--via-bg-2) 0%, rgba(2,22,42,0.04) 50%, var(--via-bg-2) 100%)",
        backgroundSize: "200% 100%",
        animation: "ac-shimmer 1.4s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

export function SkeletonRow({ height = 64 }: { height?: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 20px",
        borderBottom: "1px solid var(--via-navy-15)",
        height,
      }}
    >
      <Skeleton width={36} height={36} rounded="50%" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <Skeleton width="40%" height={14} />
        <Skeleton width="65%" height={11} />
      </div>
      <Skeleton width={72} height={28} rounded={6} />
      <Skeleton width={70} height={26} rounded={4} />
      <Skeleton width={14} height={14} rounded={4} />
    </div>
  );
}

export function SkeletonAlertRow() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "24px 90px 1fr 100px 80px",
        alignItems: "center",
        gap: 14,
        padding: "14px 20px",
        borderBottom: "1px solid var(--via-navy-15)",
      }}
    >
      <Skeleton width={8} height={8} rounded="50%" />
      <Skeleton width={80} height={20} rounded={4} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Skeleton width="55%" height={13} />
        <Skeleton width="80%" height={11} />
      </div>
      <Skeleton width={40} height={11} />
      <Skeleton width={50} height={11} />
    </div>
  );
}

export function SkeletonSwot() {
  return (
    <div className="ic-swot">
      {(["s", "w", "o", "t"] as const).map((k) => (
        <div key={k} className={`ic-swot-cell ${k}`}>
          <div className="ic-swot-head">
            <Skeleton width={26} height={26} rounded={6} />
            <Skeleton width={120} height={16} />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="ic-swot-item">
              <Skeleton width="70%" height={13} style={{ marginBottom: 6 }} />
              <Skeleton width="100%" height={11} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
