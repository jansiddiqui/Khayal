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
import type { GameTrend, Trend } from "../../api/client";
import { formatZ, GameStatusBadge, IndexStatusBadge } from "./Status";

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

/** Composite per completed session, the baseline mean (dashed) and a ±1.5 std band. */
export function GameTrendChart({ trend }: { trend: GameTrend }) {
  const data = trend.points.map((p) => ({ t: Date.parse(p.started_at), composite: p.composite }));
  const { baseline_mean: mean, baseline_std: std } = trend;
  const top = Math.max(1, ...data.map((d) => d.composite), mean !== null && std !== null ? mean + BAND_Z * std : 0);
  const name = GAME_NAMES[trend.game_type];

  return (
    <figure className="rounded-lg border border-gray-200 bg-white p-4" aria-label={`${name} trend`}>
      <figcaption className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{name}</span>
        <span className="flex items-center gap-3 text-sm">
          {trend.z !== null && <span className="text-gray-600">z = {formatZ(trend.z)}</span>}
          <GameStatusBadge status={trend.status} />
        </span>
      </figcaption>
      <p className="mb-2 text-sm text-gray-600">{trend.explanation}</p>
      {data.length < 2 ? (
        <p className="py-8 text-center text-sm text-gray-500">Not enough completed sessions to draw a trend.</p>
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
                labelFormatter={(t) => new Date(Number(t)).toLocaleDateString()}
                formatter={(value) => [Number(value).toFixed(2), "Composite"]}
                cursor={{ stroke: REFERENCE, strokeWidth: 1 }}
              />
              <Line type="monotone" dataKey="composite" stroke={SERIES} strokeWidth={2} dot={false}
                activeDot={{ r: 5, stroke: "#fcfcfb", strokeWidth: 2 }} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}

/** Overall cognitive index over time, with the Watch and Declining thresholds marked. */
export function IndexChart({ trend }: { trend: Trend }) {
  const data = trend.index_history.map((p) => ({ t: Date.parse(p.date), index: p.index }));
  const values = data.map((d) => d.index);
  const lo = Math.floor(Math.min(-3, ...values));
  const hi = Math.ceil(Math.max(1, ...values));

  return (
    <figure className="rounded-lg border border-gray-200 bg-white p-4" aria-label="Overall cognitive index trend">
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">Overall cognitive index</span>
        <span className="flex items-center gap-3">
          <span className="text-2xl font-semibold">
            {trend.cognitive_index === null ? "—" : formatZ(trend.cognitive_index)}
          </span>
          <IndexStatusBadge status={trend.cognitive_status} />
        </span>
      </figcaption>
      <p className="mb-2 text-sm text-gray-600">
        Mean of the latest z-score across games with a baseline. Below −0.5 is Watch; below −1.5 is Declining.
      </p>
      {data.length < 2 ? (
        <p className="py-8 text-center text-sm text-gray-500">The index appears once a game has 10 completed sessions.</p>
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
                labelFormatter={(t) => new Date(Number(t)).toLocaleDateString()}
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
