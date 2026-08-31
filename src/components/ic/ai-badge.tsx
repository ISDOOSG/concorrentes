import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  children?: React.ReactNode;
  dark?: boolean;
};

export function AIBadge({ children = "Gerado por IA", dark = false }: Props) {
  return (
    <span className={cn("ic-ai-badge", dark && "dark")}>
      <Sparkles size={10} strokeWidth={2} />
      {children}
    </span>
  );
}
