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
  Menu,
  Sun,
  Moon,
  LogOut,
  Filter,
  Image,
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
  menu: Menu,
  sun: Sun,
  moon: Moon,
  logout: LogOut,
  filter: Filter,
  image: Image,
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
