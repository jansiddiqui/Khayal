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
import type { GameTrend, GameType, IndexStatus, Trend } from "../../api/client";
import { dateTimeText, LOCALE, serverText, t } from "../../t";
import { formatGameZ, formatZ, STATUS_SCALE_TEXT, StatusBadge, statusDifference } from "./Status";

// One series hue (the brand teal), neutral reference marks, recessive grid/axes; all from theme.css.
const SERIES = "var(--color-teal-600)";
const REFERENCE = "var(--color-ink-soft)";
const BAND = "var(--color-sunken)";
const GRID = "var(--color-line)";
const AXIS = { fontSize: 12, fill: "var(--color-ink-soft)" };
const BAND_Z = 1.5;

const shortDate = (t: number) => new Date(t).toLocaleDateString(LOCALE, { day: "numeric", month: "short" });

/** Caregiver game names in the caregiver's language (src/i18n/caregiver/sections/common.ts). */
export const GAME_NAMES: Record<GameType, string> = t.common.games;

/** Rolling mean of the last `n` values at each point (the same 5-session average alerts use). */
/**
 * The overall index line draws itself in once, when the chart first appears (not under reduced
 * motion). The per-game charts stay still: drawing five at once is heavy on a slow phone.
 */
const DRAW_IN = typeof window !== "undefined" && typeof window.matchMedia === "function" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function rollingMean(values: readonly number[], n = 5): number[] {
  return values.map((_, i) => {
    const window = values.slice(Math.max(0, i + 1 - n), i + 1);
    return window.reduce((a, b) => a + b, 0) / window.length;
  });
}

/** The chart's element id, so alerts can link to it. */
export const trendChartId = (game: GameTrend["game_type"]) => `trend-${game}`;

/** Only a Declining game's chart opens by default; the closed card still shows its status and z. */
export const opensByDefault = (trend: GameTrend) => trend.trend_status === "declining";

/**
 * A collapsible card per game: the 5-session average (bold), each session (faint dots), the
 * baseline mean (dashed) and a ±1.5 std band. The closed card still shows name, z and status.
 * `highlighted` briefly rings the card when an alert links to it.
 */
const MAX_TICKS = 6;

/** Session numbers (1-based) to label: each day's first session, at most MAX_TICKS, spread evenly. */
export function sessionTicks(times: readonly number[]): number[] {
  const firsts: number[] = [];
  let lastDay = "";
  times.forEach((t, i) => {
    const day = new Date(t).toDateString();
    if (day !== lastDay) firsts.push(i + 1);
    lastDay = day;
  });
  if (firsts.length <= MAX_TICKS) return firsts;
  const step = (firsts.length - 1) / (MAX_TICKS - 1);
  return Array.from({ length: MAX_TICKS }, (_, k) => firsts[Math.round(k * step)]!);
}

/** "Session 12 · 9 Nov 2026, 4:30 pm" for the tooltip. */
export function sessionLabel(n: number, at: number | undefined): string {
  if (at === undefined) return t.elderPanels.charts.session(n);
  const when = dateTimeText(new Date(at), true);
  return `${t.elderPanels.charts.session(n)} · ${when}`;
}

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
  // One step per session (several can share a day); the date sits under each day's first session.
  const data = trend.points.map((p, i) => ({ x: i + 1, t: Date.parse(p.started_at), composite: p.composite, average: averages[i]! }));
  const ticks = sessionTicks(data.map((d) => d.t));
  const { baseline_mean: mean, baseline_std: std } = trend;
  // The axis fits the scores: low-level games (score = accuracy × level / 10) aren't squashed at the bottom.
  const top = Math.max(0.1, ...data.map((d) => d.composite), mean !== null && std !== null ? mean + BAND_Z * std : 0);
  const name = GAME_NAMES[trend.game_type];

  return (
    <details
      id={trendChartId(trend.game_type)}
      tabIndex={-1}
      open={opensByDefault(trend)}
      aria-label={t.elderPanels.charts.trend(name)}
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
      <figure className="px-4 pb-4" aria-label={t.elderPanels.charts.chart(name)}>
      <p className="text-sm text-ink-soft">{serverText(trend.explanation, trend.explanation_i18n)}</p>
      {statusDifference(trend.trend_status, overall) && (
        <p className="mt-1 text-sm text-ink-muted">{statusDifference(trend.trend_status, overall)}</p>
      )}
      <div className="mb-2" />
      {data.length < 2 ? (
        <p className="py-8 text-center text-sm text-ink-muted">{t.elderPanels.charts.notEnough}</p>
      ) : (
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis dataKey="x" type="number" domain={[1, Math.max(2, data.length)]} ticks={ticks}
                tickFormatter={(x: number) => shortDate(data[x - 1]?.t ?? 0)}
                tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis domain={[0, Math.ceil(top * 10) / 10]} tick={AXIS} tickLine={false} axisLine={false} width={44} />
              {mean !== null && std !== null && (
                <>
                  <ReferenceArea y1={Math.max(0, mean - BAND_Z * std)} y2={mean + BAND_Z * std} fill={BAND} fillOpacity={0.8}
                    stroke="none" ifOverflow="extendDomain" />
                  <ReferenceLine y={mean} stroke={REFERENCE} strokeDasharray="6 4" strokeWidth={1.5}
                    label={{ value: t.elderPanels.charts.baseline(mean.toFixed(2)), position: "insideTopRight", fontSize: 11, fill: REFERENCE }} />
                </>
              )}
              <Tooltip
                labelFormatter={(x) => sessionLabel(Number(x), data[Number(x) - 1]?.t)}
                formatter={(value, key) => [Number(value).toFixed(2), key === "average" ? t.elderPanels.charts.average : t.elderPanels.charts.thisSession]}
                cursor={{ stroke: REFERENCE, strokeWidth: 1 }}
              />
              {/* Each session as a faint dot; the bold line is the 5-session average the alerts use. */}
              <Line type="monotone" dataKey="composite" stroke="none" isAnimationActive={false} legendType="none"
                dot={{ r: 2.5, fill: SERIES, fillOpacity: 0.3, stroke: "none" }} activeDot={{ r: 4, fill: SERIES }} />
              <Line type="monotone" dataKey="average" stroke={SERIES} strokeWidth={3} dot={false}
                activeDot={{ r: 5, stroke: "var(--color-surface)", strokeWidth: 2 }} isAnimationActive={false} />
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
    <figure className="rounded-lg border border-line bg-surface p-4" aria-label={t.elderPanels.charts.indexAria}>
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">{t.elderPanels.charts.indexTitle}</span>
        <span className="flex items-center gap-3">
          <span className="text-2xl font-semibold">
            {trend.cognitive_index === null ? "—" : formatZ(trend.cognitive_index)}
          </span>
          <StatusBadge status={trend.cognitive_status} scope="Overall" />
        </span>
      </figcaption>
      <p className="mb-2 text-sm text-ink-muted">
        {t.elderPanels.charts.indexIntro(STATUS_SCALE_TEXT)}
      </p>
      {data.length < 2 ? (
        <p className="py-8 text-center text-sm text-ink-muted">{t.elderPanels.charts.indexNotYet}</p>
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
                label={{ value: t.common.status.watch, position: "insideBottomRight", fontSize: 11, fill: REFERENCE }} />
              <ReferenceLine y={-1.5} stroke={REFERENCE} strokeDasharray="6 4"
                label={{ value: t.common.status.declining, position: "insideBottomRight", fontSize: 11, fill: REFERENCE }} />
              <Tooltip
                labelFormatter={(t) => new Date(Number(t)).toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" })}
                formatter={(value) => [formatZ(Number(value)), t.elderPanels.charts.index]}
                cursor={{ stroke: REFERENCE, strokeWidth: 1 }}
              />
              <Line type="monotone" dataKey="index" stroke={SERIES} strokeWidth={2} dot={false}
                activeDot={{ r: 5, stroke: "var(--color-surface)", strokeWidth: 2 }} isAnimationActive={DRAW_IN} animationDuration={700} animationEasing="ease-out" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}
