/**
 * Tiny line chart. `values` are raw numbers; `max` scales the y-axis so a
 * goal at 70% of target draws 70% of the height.
 */
function Sparkline({ values = [], max, width = 36, height = 16, color = "currentColor" }) {
  if (values.length < 2) return null;

  const top = max ?? Math.max(...values, 1);
  const stepX = width / (values.length - 1);
  const points = values.map((value, index) => {
    const x = index * stepX;
    const y = height - (Math.min(value, top) / top) * (height - 2) - 1;
    return [x, y];
  });

  const path = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${path} L${width},${height} L0,${height} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={area} fill={color} opacity="0.12" />
      <path d={path} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default Sparkline;
