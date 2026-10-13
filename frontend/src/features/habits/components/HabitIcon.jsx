import { Repeat } from "lucide-react";
import { HABIT_ICONS } from "../habitIcons.js";
import { cn } from "../../../lib/cn.js";
import { COLOR_HEX } from "../../goals/goals.constants.js";

function HabitIcon({ icon, color, size = "md", className }) {
  const Icon = HABIT_ICONS[icon] ?? Repeat;
  const hex = COLOR_HEX[color] ?? "#4f46e5";
  const box = size === "lg" ? "h-11 w-11" : size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const glyph = size === "lg" ? "h-5 w-5" : size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-xl", box, className)} style={{ backgroundColor: `${hex}1a`, color: hex }} aria-hidden="true">
      <Icon className={glyph} />
    </span>
  );
}

export default HabitIcon;
