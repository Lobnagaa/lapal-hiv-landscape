/**
 * The two count charts: agents by class stacked by phase, and by phase stacked
 * by class.
 *
 * These are the same contingency table read along its two axes, which is what
 * the static reference figures did. Kept as two charts rather than one because
 * they answer different questions: the first is "how deep is each class into
 * development", the second is "what makes up each phase".
 *
 * Encoding decisions, both deliberate:
 *
 *   Stacking by PHASE uses the single-hue phase ramp, because phase is ordered.
 *   A sequential ramp makes a taller dark section read as "further along"
 *   without consulting the legend.
 *
 *   Stacking by CLASS uses a categorical palette, because class has no order.
 *   Every combination class folds into one "Combination" series: thirteen
 *   stacked segments are unreadable, and folding keeps the stack to seven.
 *   Colours are assigned to a fixed vocabulary order, never to rank, so
 *   filtering never repaints the surviving series.
 *
 * Both charts share one y-axis scale each, gridlines are recessive, and every
 * segment is hoverable. Counts are labelled only on the column total, not on
 * every segment, which would be noise.
 */
import { useMemo, useState } from 'react'
import type { Entry, Meta } from '../types'

const H = 260
const PAD = { top: 16, right: 12, bottom: 56, left: 34 }
/** Gap between stacked segments, so they read as separate blocks. */
const SEG_GAP = 2

interface Segment {
  key: string
  value: number
  colour: string
}
interface Column {
  label: string
  total: number
  segments: Segment[]
}

/** Fold every combination class into one series, and keep unclassified visible. */
function foldClass(meta: Meta, cls: string | null): string {
  if (!cls) return 'Not stated'
  return (meta.class_singles ?? []).includes(cls) ? cls : 'Combination'
}

export function PhaseCharts({ entries, meta }: { entries: Entry[]; meta: Meta }) {
  const phases = meta.phase_order ?? []

  /** Chart 1: one column per class, stacked by phase. */
  const byClass = useMemo<Column[]>(() => {
    const order = (meta.class_singles ?? []).filter((c) =>
      entries.some((e) => foldClass(meta, e.class_group) === c),
    )
    const extra = ['Combination', 'Not stated'].filter((c) =>
      entries.some((e) => foldClass(meta, e.class_group) === c),
    )
    return [...order, ...extra].map((cls) => {
      const inCls = entries.filter((e) => foldClass(meta, e.class_group) === cls)
      const segments: Segment[] = []
      for (const p of phases) {
        const n = inCls.filter((e) => e.highest_phase === p).length
        if (n) segments.push({ key: p, value: n, colour: meta.phase_colours?.[p] ?? '#CCC' })
      }
      const none = inCls.filter((e) => !e.highest_phase).length
      if (none) segments.push({ key: 'Phase not stated', value: none, colour: '#E4E7EB' })
      return { label: cls, total: inCls.length, segments }
    })
  }, [entries, meta, phases])

  /** Chart 2: one column per phase, stacked by class. */
  const byPhase = useMemo<Column[]>(() => {
    const classOrder = [
      ...(meta.class_singles ?? []),
      'Combination',
      'Not stated',
    ].filter((c) => entries.some((e) => foldClass(meta, e.class_group) === c))
    const cols = [
      ...phases.filter((p) => entries.some((e) => e.highest_phase === p)),
      ...(entries.some((e) => !e.highest_phase) ? ['__none__'] : []),
    ]
    return cols.map((p) => {
      const inP = entries.filter((e) =>
        p === '__none__' ? !e.highest_phase : e.highest_phase === p,
      )
      const segments: Segment[] = []
      for (const cls of classOrder) {
        const n = inP.filter((e) => foldClass(meta, e.class_group) === cls).length
        if (n) segments.push({ key: cls, value: n, colour: meta.class_colours?.[cls] ?? '#9AA3AE' })
      }
      return {
        label: p === '__none__' ? 'Not stated' : p.replace(/^Phase\s+/, 'Ph '),
        total: inP.length,
        segments,
      }
    })
  }, [entries, meta, phases])

  if (entries.length === 0) {
    return (
      <div className="border-t border-hairline py-20 text-center">
        <p className="text-sm text-ink-soft">
          No entries match the current selection. Widen a filter to see the charts again.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-10 pt-2 lg:grid-cols-2">
      <StackedBars
        title="Agents by class"
        subtitle="Each bar split by most advanced trial phase. Darker is further along."
        columns={byClass}
        legend={[
          ...phases
            .filter((p) => entries.some((e) => e.highest_phase === p))
            .map((p) => ({ key: p.replace(/^Phase\s+/, 'Ph '), colour: meta.phase_colours?.[p] ?? '#CCC' })),
          ...(entries.some((e) => !e.highest_phase)
            ? [{ key: 'Not stated', colour: '#E4E7EB' }]
            : []),
        ]}
      />
      <StackedBars
        title="Agents by phase"
        subtitle="Each bar split by drug class. Combination products are grouped."
        columns={byPhase}
        legend={[...(meta.class_singles ?? []), 'Combination', 'Not stated']
          .filter((c) => entries.some((e) => foldClass(meta, e.class_group) === c))
          .map((c) => ({ key: c, colour: meta.class_colours?.[c] ?? '#9AA3AE' }))}
      />
    </div>
  )
}

function StackedBars({
  title,
  subtitle,
  columns,
  legend,
}: {
  title: string
  subtitle: string
  columns: Column[]
  legend: { key: string; colour: string }[]
}) {
  const [hover, setHover] = useState<{ col: string; seg: string; n: number } | null>(null)

  const width = 560
  const max = Math.max(1, ...columns.map((c) => c.total))
  // A tidy axis: step up in ones until it gets tall, then twos.
  const step = max <= 6 ? 1 : max <= 12 ? 2 : 5
  const top = Math.ceil(max / step) * step
  const plotH = H - PAD.top - PAD.bottom
  const plotW = width - PAD.left - PAD.right
  const bandW = plotW / Math.max(1, columns.length)
  const barW = Math.min(52, bandW * 0.62)
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH

  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step)

  return (
    <figure className="m-0">
      <figcaption className="mb-1">
        <div className="text-[13px] font-semibold text-ink">{title}</div>
        <div className="text-[11px] text-ink-soft">{subtitle}</div>
      </figcaption>

      <svg viewBox={`0 0 ${width} ${H}`} className="w-full" role="img" aria-label={`${title}. ${subtitle}`}>
        {/* recessive gridlines and y labels */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--color-hairline)"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 7}
              y={y(t) + 3}
              textAnchor="end"
              className="fill-[var(--color-ink-soft)] text-[9px] tabular-nums"
            >
              {t}
            </text>
          </g>
        ))}

        {columns.map((col, i) => {
          const cx = PAD.left + bandW * i + bandW / 2
          let cursor = 0
          return (
            <g key={col.label}>
              {col.segments.map((seg) => {
                const y0 = y(cursor + seg.value)
                const y1 = y(cursor)
                cursor += seg.value
                const h = Math.max(1, y1 - y0 - SEG_GAP)
                const active = hover?.col === col.label && hover?.seg === seg.key
                return (
                  <rect
                    key={seg.key}
                    x={cx - barW / 2}
                    y={y0}
                    width={barW}
                    height={h}
                    rx={2}
                    fill={seg.colour}
                    stroke={active ? 'var(--color-ink)' : 'none'}
                    strokeWidth={active ? 1.5 : 0}
                    onMouseEnter={() => setHover({ col: col.label, seg: seg.key, n: seg.value })}
                    onMouseLeave={() => setHover(null)}
                  >
                    <title>{`${col.label} · ${seg.key}: ${seg.value}`}</title>
                  </rect>
                )
              })}
              {/* column total, the one number worth labelling directly */}
              <text
                x={cx}
                y={y(col.total) - 6}
                textAnchor="middle"
                className="fill-[var(--color-ink)] text-[10px] font-semibold tabular-nums"
              >
                {col.total}
              </text>
              <text
                x={cx}
                y={H - PAD.bottom + 14}
                textAnchor="end"
                transform={`rotate(-35 ${cx} ${H - PAD.bottom + 14})`}
                className="fill-[var(--color-ink-soft)] text-[9px]"
              >
                {col.label}
              </text>
            </g>
          )
        })}

        <line
          x1={PAD.left}
          x2={width - PAD.right}
          y1={y(0)}
          y2={y(0)}
          stroke="var(--color-ink-soft)"
          strokeWidth={1}
        />
      </svg>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        {legend.map((l) => (
          <span key={l.key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-sm"
              style={{ background: l.colour, outline: '1px solid var(--color-hairline)' }}
            />
            <span className="text-[11px] text-ink-soft">{l.key}</span>
          </span>
        ))}
      </div>

      <p className="mt-1 min-h-[16px] text-[11px] text-ink">
        {hover ? `${hover.col} · ${hover.seg}: ${hover.n}` : ''}
      </p>
    </figure>
  )
}
