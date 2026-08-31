import { Tag, Sparkles, Type, Palette, FileText, Circle } from "lucide-react";
import type { ChangeType } from "@/lib/ic-mock";

type Props = {
  type: ChangeType;
  size?: number;
};

const MAP = {
  pricing: Tag,
  feature: Sparkles,
  copy: Type,
  design: Palette,
  content: FileText,
} as const;

export function ChangeTypeIcon({ type, size = 14 }: Props) {
  const C = MAP[type] ?? Circle;
  return <C size={size} />;
}
