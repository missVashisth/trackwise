import { cn } from "../../../lib/cn.js";

function LifeAreaAvatar({ lifeArea, size = "md" }) {
  const box = size === "sm" ? "h-5 w-5 text-[11px]" : "h-7 w-7 text-sm";
  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-md", box)}
      style={{ backgroundColor: `${lifeArea?.colorHex ?? "#64748b"}1f` }}
      aria-hidden="true"
    >
      {lifeArea?.emoji ?? "•"}
    </span>
  );
}

export default LifeAreaAvatar;
