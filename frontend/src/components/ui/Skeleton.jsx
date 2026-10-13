import { cn } from "../../lib/cn.js";

function Skeleton({ className }) {
  return <div className={cn("animate-pulse rounded-md bg-slate-200/70", className)} />;
}

export default Skeleton;
