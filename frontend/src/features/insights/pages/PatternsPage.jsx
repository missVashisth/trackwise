// /insights/patterns — "What is working for me, and what should I improve?"
// A few evidence-based statements, grouped; each one states the numbers it is based on.

import { useOutletContext } from "react-router";
import { AlertTriangle, Lightbulb, ThumbsUp } from "lucide-react";
import { ReportGate } from "../components/InsightsShell.jsx";
import { EmptyNote, InsightList, Section } from "../components/InsightParts.jsx";
import { WeekdayChart } from "../components/InsightCharts.jsx";

const LIMIT = 3;

function PatternsPage() {
  const { overview } = useOutletContext();
  return (
    <ReportGate report={overview}>
      {(data) => {
        const n = data.narrative;
        if (!n.hasData) return <Section title="My patterns"><EmptyNote>{n.message}</EmptyNote></Section>;
        // Comparisons and weekday facts read as strengths or attention points; avoid saying them twice.
        const strengths = n.strengths.slice(0, LIMIT);
        const attention = n.weaknesses.slice(0, LIMIT);
        const facts = n.observations.filter((o) => o.id.startsWith("weekday-best") || o.id.startsWith("habit-weekend") || o.id === "habit-compare").slice(0, 2);
        return (
          <>
            <div className="grid gap-5 lg:grid-cols-3">
              <Section title="Strengths" description="Patterns supported by your recorded activity.">
                <InsightList items={strengths} icon={ThumbsUp} tone="text-green-600" empty="No clear strengths yet — they appear once there is enough history." />
              </Section>
              <Section title="Needs attention" description="Declining consistency or little recent progress.">
                <InsightList items={attention} icon={AlertTriangle} tone="text-amber-500" empty="Nothing needs attention in this period." />
              </Section>
              <Section title="Suggestions" description="Ideas based on the numbers — not conclusions about you.">
                <InsightList items={n.recommendations.slice(0, LIMIT)} icon={Lightbulb} tone="text-amber-500" empty="No suggestions for this period." />
              </Section>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <Section title="When you complete most" description="Share of everything scheduled on each weekday in this period.">
                <WeekdayChart weekdays={data.charts.weekdays} minObservations={data.thresholds.MIN_WEEKDAY_OBSERVATIONS} />
              </Section>
              <Section title="Day patterns">
                <InsightList items={facts} empty="Not enough data yet to compare days." />
              </Section>
            </div>
          </>
        );
      }}
    </ReportGate>
  );
}

export default PatternsPage;
