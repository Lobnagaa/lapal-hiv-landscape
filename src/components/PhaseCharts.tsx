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
import { useRef, useState } from 'react'
import type { Entry, Meta } from '../types'
import {
  type Column,
  classLegend,
  classSeries,
  columnsByClass,
  columnsByPhase,
  foldClass,
  phaseLegend,
  axisScale,
} from '../charts'
import type { ViewState } from '../viewState'

const H = 260
const PAD = { top: 16, right: 12, bottom: 56, left: 34 }
/** Gap between stacked segments, so they read as separate blocks. */
const SEG_GAP = 2

export function PhaseCharts({
  entries,
  meta,
  order,
  onReorderClasses,
  onHideClass,
}: {
  entries: Entry[]
  meta: Meta
  /** The reader's class order, shared with the class-and-phase grid's rows. */
  order: ViewState
  onReorderClasses: (classes: string[]) => void
  /** Hides every entry in a class, which is what removing its column means. */
  onHideClass: (ids: string[]) => void
}) {
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
    <div className="pt-2">
      <ClassControls entries={entries} meta={meta} order={order} onReorder={onReorderClasses} onHide={onHideClass} />
      <div className="grid gap-10 lg:grid-cols-2">
        <StackedBars
          title="Agents by class"
          subtitle="Each bar split by most advanced trial phase. Darker is further along."
          columns={columnsByClass(entries, meta, order)}
          legend={phaseLegend(entries, meta)}
        />
        <StackedBars
          title="Agents by phase"
          subtitle="Each bar split by drug class. Combination products are grouped."
          columns={columnsByPhase(entries, meta, order)}
          legend={classLegend(entries, meta, order)}
        />
      </div>
    </div>
  )
}

/**
 * Hide or reorder the classes both charts share.
 *
 * One control for both charts rather than one per chart, because it is the
 * same class order and the same hidden entries either way: dragging a class
 * here changes the "Agents by class" columns directly and the "Agents by
 * phase" stacking order and legend to match, so the two charts never disagree
 * about which class comes first. Hiding a class hides every entry in it,
 * which is the same action the class-and-phase grid's row eye icon performs,
 * reached from wherever is convenient.
 */
function ClassControls({
  entries,
  meta,
  order,
  onReorder,
  onHide,
}: {
  entries: Entry[]
  meta: Meta
  order: ViewState
  onReorder: (classes: string[]) => void
  onHide: (ids: string[]) => void
}) {
  const classes = classSeries(entries, meta, order)
  const dragged = useRef<string | null>(null)
  const [overClass, setOverClass] = useState<string | null>(null)

  const drop = (target: string) => {
    const from = dragged.current
    dragged.current = null
    setOverClass(null)
    if (!from || from === target) return
    const next = classes.filter((c) => c !== from)
    next.splice(
      classes.indexOf(target) > classes.indexOf(from) ? next.indexOf(target) + 1 : next.indexOf(target),
      0,
      from,
    )
    onReorder(next)
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[10px] font-bold tracking-[0.14em] text-ink-soft uppercase">
        Classes
      </span>
      {classes.map((cls) => {
        const swatch = cls === 'Not stated' ? undefined : meta.class_colours?.[cls]
        const ids = entries.filter((e) => foldClass(meta, e.class_group) === cls).map((e) => e.id)
        return (
          <span
            key={cls}
            draggable
            onDragStart={() => {
              dragged.current = cls
            }}
            onDragEnd={() => {
              dragged.current = null
              setOverClass(null)
            }}
            onDragOver={(ev) => {
              if (!dragged.current) return
              ev.preventDefault()
              setOverClass(cls)
            }}
            onDrop={(ev) => {
              ev.preventDefault()
              drop(cls)
            }}
            title={`Drag to reorder ${cls}. Hide removes it from both charts.`}
            className="group/cls flex cursor-grab items-center gap-1 rounded-full border bg-white py-0.5 pr-1 pl-2 text-[11px] active:cursor-grabbing"
            style={{
              borderColor: overClass === cls ? 'var(--color-accent)' : 'var(--color-hairline)',
            }}
          >
            {swatch && (
              <span aria-hidden className="inline-block size-2 shrink-0 rounded-sm" style={{ background: swatch }} />
            )}
            <span className="text-ink">{cls}</span>
            <button
              type="button"
              title={`Hide ${cls} from the charts`}
              aria-label={`Hide ${cls} from the charts`}
              onClick={(ev) => {
                ev.stopPropagation()
                onHide(ids)
              }}
              className="rounded p-0.5 text-ink-soft opacity-0 transition-opacity group-hover/cls:opacity-70 hover:!opacity-100"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" />
                <path d="M9.4 5.2A9.5 9.5 0 0112 5c5 0 9 4.5 9 7a12 12 0 01-2.4 3.3M6.2 6.7C3.9 8.2 3 10.4 3 12c0 2.5 4 7 9 7a9.6 9.6 0 003.6-.7" />
              </svg>
            </button>
          </span>
        )
      })}
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
  // Hovering a segment names the agents in it. The counts alone answer "how
  // many"; the reader's next question is always "which ones", and until now
  // that meant leaving the chart for another view.
  const [hover, setHover] = useState<{ col: string; seg: string; items: Entry[] } | null>(null)

  const width = 560
  const max = Math.max(1, ...columns.map((c) => c.total))
  const { top, step } = axisScale(max)
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
                const y0 = y(cursor + seg.items.length)
                const y1 = y(cursor)
                cursor += seg.items.length
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
                    onMouseEnter={() =>
                      setHover({ col: col.label, seg: seg.key, items: seg.items })
                    }
                    onMouseLeave={() => setHover(null)}
                  >
                    <title>{`${col.label} · ${seg.key}: ${seg.items.length}`}</title>
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

      {/* Reserve the space so the chart does not jump as the pointer moves. */}
      <div className="mt-1 min-h-[74px] rounded border border-transparent px-1">
        {hover && (
          <>
            <p className="text-[11px] font-semibold text-ink">
              {hover.col} · {hover.seg}: {hover.items.length}
            </p>
            <p className="text-[11px] leading-snug text-ink-soft">
              {hover.items.map((e) => e.name_full).join(', ')}
            </p>
          </>
        )}
      </div>
    </figure>
  )
}
