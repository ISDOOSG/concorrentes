import { cn } from "@/lib/utils";

type Props = {
  values: number[];
  color?: string;
};

export function MicroBars({ values, color = "var(--via-blue)" }: Props) {
  const max = Math.max(...values);
  const last = values.length - 1;
  return (
    <div className="ic-spark">
      {values.map((v, i) => (
        <div
          key={i}
          className={cn("ic-spark-bar", i === last && "last")}
          style={{ height: `${(v / max) * 100}%`, background: color }}
        />
      ))}
    </div>
  );
}
