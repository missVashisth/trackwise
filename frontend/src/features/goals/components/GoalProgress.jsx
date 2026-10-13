import { ProgressRing, Sparkline } from "../../../components/ui/index.js";
import { formatMetricValue, getProgress } from "../goals.selectors.js";

function GoalProgress({ goal, colorHex }) {
  const progress = getProgress(goal);
  const history = goal.progress?.history ?? [];
  const useRing = history.length < 2;
  const done = progress >= 100;
  const color = done ? "#16a34a" : colorHex;
  const today = goal.progress?.today ?? 0;
  const title = [`${progress}% from completed tasks`, today > 0 && `+${today}% today`, formatMetricValue(goal.metric)]
    .filter(Boolean)
    .join(" · ");

  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-700" title={title}>
      {useRing ? (
        <ProgressRing value={progress} color={color} />
      ) : (
        <Sparkline values={history} max={100} color={color} />
      )}
      <span className={done ? "font-medium text-green-700" : ""}>{progress}%</span>
    </span>
  );
}

export default GoalProgress;
