import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronRight } from "lucide-react";
import type { GameTrend, IndexStatus, Trend } from "../../api/client";
import { formatGameZ, formatZ, STATUS_SCALE_TEXT, StatusBadge, statusDifference } from "./Status";

// Dataviz reference palette: one series hue, neutral reference marks, recessive grid/axes.
const SERIES = "#2a78d6";
const REFERENCE = "#52514e";
const BAND = "#e9e8e3";
const GRID = "#e5e4df";
const AXIS = { fontSize: 12, fill: "#52514e" };
const BAND_Z = 1.5;

const shortDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export const GAME_NAMES = {
  memory_match: "Memory Match",
  sequence_recall: "Sequence Recall",
  word_recall: "Word Recall",
  daily_orientation: "About Today",
  reaction_tap: "Reaction Tap",
} as const;

/** Rolling mean of the last `n` values at each point (the same 5-session average alerts use). */
export function rollingMean(values: readonly number[], n = 5): number[] {
  return values.map((_, i) => {
    const window = values.slice(Math.max(0, i + 1 - n), i + 1);
    return window.reduce((a, b) => a + b, 0) / window.length;
  });
}

/** The chart's element id, so alerts can link to it. */
export const trendChartId = (game: GameTrend["game_type"]) => `trend-${game}`;

/** Games on Watch or Declining open by default; the others start collapsed. */
export const opensByDefault = (trend: GameTrend) => trend.trend_status === "watch" || trend.trend_status === "declining";

/**
 * A collapsible card per game: the 5-session average (bold), each session (faint dots), the
 * baseline mean (dashed) and a ±1.5 std band. The closed card still shows name, z and status.
 * `highlighted` briefly rings the card when an alert links to it.
 */
export function GameTrendChart({
  trend,
  overall,
  highlighted = false,
}: {
  trend: GameTrend;
  overall: IndexStatus;
  highlighted?: boolean;
}) {
  const averages = rollingMean(trend.points.map((p) => p.composite));
  const data = trend.points.map((p, i) => ({ t: Date.parse(p.started_at), composite: p.composite, average: averages[i]! }));
  const { baseline_mean: mean, baseline_std: std } = trend;
  const top = Math.max(1, ...data.map((d) => d.composite), mean !== null && std !== null ? mean + BAND_Z * std : 0);
  const name = GAME_NAMES[trend.game_type];

  return (
    <details
      id={trendChartId(trend.game_type)}
      tabIndex={-1}
      open={opensByDefault(trend)}
      aria-label={`${name} trend`}
      className={
        "group/card scroll-mt-24 rounded-lg border bg-surface transition-shadow duration-300 " +
        (highlighted ? "border-accent-strong shadow-[0_0_0_4px_var(--color-accent)]" : "border-line")
      }
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 font-semibold">
          <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-muted transition-transform group-open/card:rotate-90" />
          {name}
        </span>
        <span className="flex items-center gap-3 text-sm">
          {trend.z !== null && <span className="text-ink-muted">{formatGameZ(trend.z, trend.z_raw)}</span>}
          <StatusBadge status={trend.trend_status} scope="This game" />
        </span>
      </summary>
      <figure className="px-4 pb-4" aria-label={`${name} chart`}>
      <p className="text-sm text-ink-soft">{trend.explanation}</p>
      {statusDifference(trend.trend_status, overall) && (
        <p className="mt-1 text-sm text-ink-muted">{statusDifference(trend.trend_status, overall)}</p>
      )}
      <div className="mb-2" />
      {data.length < 2 ? (
        <p className="py-8 text-center text-sm text-ink-muted">Not enough completed sessions to draw a trend.</p>
      ) : (
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={shortDate}
                tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
              <YAxis domain={[0, Math.ceil(top * 10) / 10]} tick={AXIS} tickLine={false} axisLine={false} width={44} />
              {mean !== null && std !== null && (
                <>
                  <ReferenceArea y1={Math.max(0, mean - BAND_Z * std)} y2={mean + BAND_Z * std} fill={BAND} fillOpacity={0.8}
                    stroke="none" ifOverflow="extendDomain" />
                  <ReferenceLine y={mean} stroke={REFERENCE} strokeDasharray="6 4" strokeWidth={1.5}
                    label={{ value: `baseline ${mean.toFixed(2)}`, position: "insideTopRight", fontSize: 11, fill: REFERENCE }} />
                </>
              )}
              <Tooltip
                labelFormatter={(t) => new Date(Number(t)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                formatter={(value, key) => [Number(value).toFixed(2), key === "average" ? "5-session average" : "This session"]}
                cursor={{ stroke: REFERENCE, strokeWidth: 1 }}
              />
              {/* Each session as a faint dot; the bold line is the 5-session average the alerts use. */}
              <Line type="monotone" dataKey="composite" stroke="none" isAnimationActive={false} legendType="none"
                dot={{ r: 2.5, fill: SERIES, fillOpacity: 0.3, stroke: "none" }} activeDot={{ r: 4, fill: SERIES }} />
              <Line type="monotone" dataKey="average" stroke={SERIES} strokeWidth={3} dot={false}
                activeDot={{ r: 5, stroke: "#fcfcfb", strokeWidth: 2 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
      </figure>
    </details>
  );
}

/** Overall cognitive index over time, with the Watch and Declining thresholds marked. */
export function IndexChart({ trend }: { trend: Trend }) {
  const data = trend.index_history.map((p) => ({ t: Date.parse(p.date), index: p.index }));
  const values = data.map((d) => d.index);
  const lo = Math.floor(Math.min(-3, ...values));
  const hi = Math.ceil(Math.max(1, ...values));

  return (
    <figure className="rounded-lg border border-line bg-surface p-4" aria-label="Overall cognitive index trend">
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">Overall cognitive index</span>
        <span className="flex items-center gap-3">
          <span className="text-2xl font-semibold">
            {trend.cognitive_index === null ? "—" : formatZ(trend.cognitive_index)}
          </span>
          <StatusBadge status={trend.cognitive_status} scope="Overall" />
        </span>
      </figcaption>
      <p className="mb-2 text-sm text-ink-muted">
        Mean of the latest z-score across games with a baseline. One scale for each game and overall: {STATUS_SCALE_TEXT}
      </p>
      {data.length < 2 ? (
        <p className="py-8 text-center text-sm text-ink-muted">The index appears once a game has 15 completed sessions.</p>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={shortDate}
                tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
              <YAxis domain={[lo, hi]} tick={AXIS} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
              <ReferenceLine y={0} stroke={GRID} strokeWidth={1.5} />
              <ReferenceLine y={-0.5} stroke={REFERENCE} strokeDasharray="3 3"
                label={{ value: "Watch", position: "insideBottomRight", fontSize: 11, fill: REFERENCE }} />
              <ReferenceLine y={-1.5} stroke={REFERENCE} strokeDasharray="6 4"
                label={{ value: "Declining", position: "insideBottomRight", fontSize: 11, fill: REFERENCE }} />
              <Tooltip
                labelFormatter={(t) => new Date(Number(t)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                formatter={(value) => [formatZ(Number(value)), "Index"]}
                cursor={{ stroke: REFERENCE, strokeWidth: 1 }}
              />
              <Line type="monotone" dataKey="index" stroke={SERIES} strokeWidth={2} dot={false}
                activeDot={{ r: 5, stroke: "#fcfcfb", strokeWidth: 2 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}
