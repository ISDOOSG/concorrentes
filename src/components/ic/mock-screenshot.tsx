import type { Competitor } from "@/lib/ic-mock";

type Block = { x: number; y: number; w: number; h: number; hl?: boolean };

type Props = {
  comp: Competitor;
  variant?: "home" | "pricing" | "features";
  highlight?: number | null;
};

export function MockScreenshot({
  comp,
  variant = "home",
  highlight = null,
}: Props) {
  const c = comp.color;
  const blocks: Block[] =
    variant === "pricing"
      ? [
          { x: 8, y: 8, w: 32, h: 4 },
          { x: 8, y: 16, w: 60, h: 6 },
          { x: 8, y: 28, w: 24, h: 32 },
          { x: 36, y: 28, w: 24, h: 32 },
          { x: 64, y: 28, w: 24, h: 32, hl: true },
        ]
      : variant === "features"
        ? [
            { x: 8, y: 8, w: 30, h: 4 },
            { x: 8, y: 14, w: 70, h: 8 },
            { x: 8, y: 28, w: 18, h: 18 },
            { x: 30, y: 28, w: 18, h: 18 },
            { x: 52, y: 28, w: 18, h: 18 },
            { x: 74, y: 28, w: 18, h: 18 },
            { x: 8, y: 50, w: 84, h: 14 },
          ]
        : [
            { x: 8, y: 6, w: 22, h: 3 },
            { x: 8, y: 14, w: 60, h: 8 },
            { x: 8, y: 26, w: 50, h: 4 },
            { x: 8, y: 36, w: 22, h: 6, hl: true },
            { x: 8, y: 50, w: 84, h: 28 },
          ];
  return (
    <div className="ic-shot-canvas">
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(135deg, #fff 0%, #F5F7FA 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "8%",
          background: "#fff",
          borderBottom: "0.5px solid rgba(0,0,0,0.08)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "2%",
          left: "4%",
          width: "14%",
          height: "4%",
          background: c,
          borderRadius: 2,
        }}
      />
      {blocks.map((b, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${b.x}%`,
            top: `${b.y + 8}%`,
            width: `${b.w}%`,
            height: `${b.h}%`,
            background: b.hl ? c : "rgba(2,22,42,0.08)",
            borderRadius: 2,
            opacity: b.hl ? 0.85 : 1,
            ...(highlight === i && {
              outline: "2px solid var(--via-danger)",
              outlineOffset: 1,
            }),
          }}
        />
      ))}
    </div>
  );
}
