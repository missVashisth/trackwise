import { Zap } from "lucide-react";
import { IMPACT_OPTIONS } from "../goals.constants.js";
import { cn } from "../../../lib/cn.js";

const BOLTS_BY_IMPACT = Object.fromEntries(IMPACT_OPTIONS.map((o) => [o.value, o.bolts]));
const LABEL_BY_IMPACT = Object.fromEntries(IMPACT_OPTIONS.map((o) => [o.value, o.label]));

function ImpactBolts({ impact }) {
  const filled = BOLTS_BY_IMPACT[impact] ?? 0;

  return (
    <span className="inline-flex items-center gap-0.5" title={`${LABEL_BY_IMPACT[impact] ?? "No"} impact`}>
      {[0, 1, 2].map((index) => (
        <Zap
          key={index}
          className={cn("h-3.5 w-3.5", index < filled ? "fill-brand-500 text-brand-500" : "text-slate-200")}
          aria-hidden="true"
        />
      ))}
      <span className="sr-only">{LABEL_BY_IMPACT[impact]} impact</span>
    </span>
  );
}

export default ImpactBolts;
