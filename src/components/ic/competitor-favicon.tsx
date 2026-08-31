import type { Competitor } from "@/lib/ic-mock";

type Props = {
  comp: Competitor;
  size?: number;
};

export function CompetitorFavicon({ comp, size = 36 }: Props) {
  return (
    <div
      className="ic-comp-favicon"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: comp.color,
      }}
    >
      {comp.favicon}
    </div>
  );
}
