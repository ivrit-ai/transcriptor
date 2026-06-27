import {
  ChevronLeft,
  ChevronRight,
  Check,
  Flag,
  X,
  Sparkles,
  PencilOff,
  CheckLine,
  ListTodo,
  ListChecks,
} from "lucide-react";

const icons = {
  forward: ChevronLeft,
  back: ChevronRight,
  check: Check,
  flag: Flag,
  close: X,
  spark: Sparkles,
  "pencil-off": PencilOff,
  "check-line": CheckLine,
  "list-todo": ListTodo,
  "list-checks": ListChecks,
} as const;

interface IconProps {
  name: keyof typeof icons;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({
  name,
  size = 18,
  color = "currentColor",
  strokeWidth = 1.6,
}: IconProps) {
  const Component = icons[name];
  return <Component size={size} color={color} strokeWidth={strokeWidth} />;
}
