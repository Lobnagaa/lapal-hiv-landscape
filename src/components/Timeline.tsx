/**
 * The dosing-interval timeline: the signature view.
 *
 * Custom SVG rather than a chart library, because the encoding is an ordinal
 * axis with dots, range bars and an off-axis lane, which no off-the-shelf chart
 * type expresses. See encoding.ts for the rules; this file only draws them.
 *
 * Two display modes:
 *
 *   grouped  the default. Rows grouped by band, then by development stage,
 *            sorted within each stage by earliest interval.
 *   custom   once the reader drags a row, the grouping headings switch off and
 *            it becomes one flat list they control. Stage is then read from the
 *            coloured dot beside each name, which is present in both modes.
 *
 * Layout note: the whole table is one CSS grid, so every row's plot cell has
 * exactly the same width. That width is measured once from the header and
 * passed down, letting each row own a small SVG in real pixel coordinates.
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Entry, Meta } from '../types'
import { indicationBadge } from '../types'
import { AXIS_H, BAR_H, BAR_OPACITY, DOT_R, ROW_H, axisGeometry, groupEntries, rowMarks } from '../encoding'
import { stageVar } from '../theme'
import { useMediaQuery } from '../useMediaQuery'
import { Tooltip, type TooltipTarget } from './Tooltip'

/**
 * Only ever open a plain web address.
 *
 * The URL comes from the data file, which a curator can replace on the server
 * by hand. build_data.py validates the scheme, but this is the last line of
 * defence: a `javascript:` URL reaching window.open would execute in the page.
 */
function safeUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url, window.location.href)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

/**
 * Tint for one route chip.
 *
 * The colour is the chip's fill and border only; the letters stay in ink. That
 * keeps the code legible whatever the tint, so colour is a scanning aid rather
 * than something the reader has to decode. Falls back to the neutral hairline
 * style when meta carries no colour for a route.
 */
function routeChipStyle(meta: Meta, code: string) {
  const c = meta.route_colours?.[code]
  if (!c) return { borderColor: 'var(--color-hairline)', color: 'var(--color-ink-soft)' }
  return {
    background: `color-mix(in srgb, ${c} 14%, transparent)`,
    borderColor: `color-mix(in srgb, ${c} 45%, transparent)`,
    color: 'var(--color-ink)',
  }
}

/**
 * Chip for the highest clinical phase on record.
 *
 * Phase is an ordered progression, so meta.phase_colours is a single-hue ramp
 * rather than a set of categorical hues: a darker chip reads as further along
 * without needing a legend. The label is always ink, so the tint is a scanning
 * aid and never the only thing carrying the value.
 */
function PhaseChip({ meta, phase }: { meta: Meta; phase: string | null }) {
  if (!phase) return null
  const tint = meta.phase_colours?.[phase]
  return (
    <span
      title={`Most advanced trial on record: ${phase}`}
      className="shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold tracking-[0.04em] whitespace-nowrap"
      style={
        tint
          ? { background: tint, color: 'var(--color-ink)' }
          : { border: '1px solid var(--color-hairline)', color: 'var(--color-ink-soft)' }
      }
    >
      {phase.replace(/^Phase\s+/i, 'Ph ')}
    </span>
  )
}

const GRID_WIDE = '52px minmax(200px, 1.4fr) minmax(300px, 2.4fr) 108px minmax(120px, 0.9fr)'
const GRID_NARROW = '52px minmax(150px, 1.25fr) minmax(230px, 2.2fr) 96px'

export interface TimelineControls {
  /**
   * Render as one flat list rather than grouped. True when the reader has taken
   * over the ordering, and also when the admin has set an explicit default
   * order in the workbook.
   */
  custom: boolean
  /** True only for the reader's own rearrangement, not the admin's default. */
  readerCustom?: boolean
  onMove: (id: string, toIndex: number) => void
  onNudge: (id: string, delta: -1 | 1) => void
  onHide: (id: string) => void
}

export function Timeline({
  entries,
  meta,
  controls,
}: {
  entries: Entry[]
  meta: Meta
  controls: TimelineControls
}) {
  const wide = useMediaQuery('(min-width: 1024px)')
  const grid = wide ? GRID_WIDE : GRID_NARROW

  const plotRef = useRef<HTMLDivElement>(null)
  const [plotWidth, setPlotWidth] = useState(0)

  useLayoutEffect(() => {
    const el = plotRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setPlotWidth(entry.contentRect.width)
    })
    ro.observe(el)
    setPlotWidth(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  const [target, setTarget] = useState<TooltipTarget | null>(null)
  const dismiss = useCallback(() => setTarget(null), [])

  // Drag state is held in refs as well as state. The refs are what the drop
  // handler reads: drag events can arrive faster than React re-renders, and a
  // handler closing over stale state would then drop the move silently. The
  // state copies exist only to draw the insertion line.
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const dragIdRef = useRef<string | null>(null)
  const dropIndexRef = useRef<number | null>(null)

  const beginDrag = (id: string) => {
    dragIdRef.current = id
    setDragId(id)
  }
  const setDrop = (i: number) => {
    dropIndexRef.current = i
    setDropIndex(i)
  }
  const endDrag = () => {
    dragIdRef.current = null
    dropIndexRef.current = null
    setDragId(null)
    setDropIndex(null)
  }

  const geo = axisGeometry(plotWidth, meta.dosing_axis_order.length)

  if (entries.length === 0) {
    return (
      <div className="border-t border-hairline py-20 text-center">
        <p className="text-sm text-ink-soft">
          No entries match the current selection. Widen a filter, or unhide rows, to see the
          timeline again.
        </p>
      </div>
    )
  }

  const rowProps = (entry: Entry, flatIndex: number) => ({
    key: entry.id,
    entry,
    meta,
    geo,
    grid,
    wide,
    index: flatIndex,
    dragging: dragId === entry.id,
    dropBefore: dropIndex === flatIndex,
    dropAfter: dropIndex === flatIndex + 1 && flatIndex === entries.length - 1,
    controls,
    onDragStart: () => beginDrag(entry.id),
    onDragEnd: endDrag,
    onDragOverRow: (before: boolean) => setDrop(before ? flatIndex : flatIndex + 1),
    onDropRow: () => {
      const id = dragIdRef.current
      const to = dropIndexRef.current
      if (id && to !== null) controls.onMove(id, to)
      endDrag()
    },
    onHover: (x: number, y: number) =>
      setTarget((t) => (t?.pinned ? t : { entry, x, y, pinned: false })),
    onLeave: () => setTarget((t) => (t?.pinned ? t : null)),
    onPin: (x: number, y: number) =>
      setTarget((t) => (t?.pinned && t.entry.id === entry.id ? null : { entry, x, y, pinned: true })),
  })

  // Flat index across the whole rendered list, so drag positions are absolute
  // rather than relative to a group.
  let flat = -1

  return (
    <div className="relative">
      <AxisHeader meta={meta} geo={geo} grid={grid} plotRef={plotRef} wide={wide} />

      {controls.custom ? (
        <div>{entries.map((entry) => <EntryRow {...rowProps(entry, ++flat)} />)}</div>
      ) : (
        groupEntries(entries, meta).map((band) => (
          <section key={band.band} aria-label={band.label}>
            <div className="flex items-baseline gap-3 border-b border-hairline px-1 pt-8 pb-2">
              <h2 className="text-[13px] font-semibold tracking-[0.12em] text-ink uppercase">
                {band.band}
              </h2>
              <p className="text-[12px] text-ink-soft">{band.label}</p>
              <span className="flex-1" />
              <span className="font-mono text-[12px] tabular-nums text-ink-soft">{band.count}</span>
            </div>

            {band.groups.map((group) => (
              <div key={group.stage}>
                <div
                  className="sticky z-10 flex items-center gap-2 border-b border-hairline bg-paper/95 px-1 py-1.5 backdrop-blur-sm"
                  style={{ top: AXIS_H }}
                >
                  <span
                    aria-hidden
                    className="inline-block size-2.5 rounded-full"
                    style={{ background: stageVar(group.stage) }}
                  />
                  <h3 className="text-[12px] font-semibold tracking-wide text-ink">{group.stage}</h3>
                  <p className="text-[11px] text-ink-soft">
                    {meta.stage_tiers[group.stage]?.definition}
                  </p>
                  <span className="flex-1" />
                  <span className="font-mono text-[11px] tabular-nums text-ink-soft">
                    {group.entries.length}
                  </span>
                </div>
                {group.entries.map((entry) => <EntryRow {...rowProps(entry, ++flat)} />)}
              </div>
            ))}
          </section>
        ))
      )}

      {target && <Tooltip target={target} meta={meta} onDismiss={dismiss} />}
    </div>
  )
}

/* ---------------------------------------------------------------- axis head */

function AxisHeader({
  meta,
  geo,
  grid,
  plotRef,
  wide,
}: {
  meta: Meta
  geo: ReturnType<typeof axisGeometry>
  grid: string
  plotRef: RefObject<HTMLDivElement | null>
  wide: boolean
}) {
  return (
    <div
      className="sticky top-0 z-20 grid items-end gap-x-4 border-b border-ink bg-paper/95 px-1 pb-1.5 backdrop-blur-sm"
      style={{ gridTemplateColumns: grid, height: AXIS_H }}
    >
      <div />
      <div className="text-[10px] font-semibold tracking-[0.14em] text-ink-soft uppercase">
        Product
      </div>

      <div ref={plotRef} className="relative h-full">
        {geo.width > 0 && (
          <>
            <p className="absolute top-0 left-0 text-[10px] font-semibold tracking-[0.14em] text-ink-soft uppercase">
              Dosing interval
              <span className="ml-1.5 font-normal normal-case opacity-70">
                W = weeks, M = months · ordinal, not to scale
              </span>
            </p>
            {meta.dosing_axis_order.map((code, i) => (
              <span
                key={code}
                title={meta.dosing_axis_labels[code]}
                className="absolute bottom-0 -translate-x-1/2 font-mono text-[11px] tabular-nums text-ink"
                style={{ left: geo.centre(i) }}
              >
                {code}
              </span>
            ))}
            <span
              className="absolute bottom-0 -translate-x-1/2 text-[10px] whitespace-nowrap text-ink-soft"
              style={{ left: geo.notStatedCentre }}
            >
              no interval
              <br />
              stated
            </span>
          </>
        )}
      </div>

      <div className="text-[10px] leading-tight font-semibold tracking-[0.14em] text-ink-soft uppercase">
        Route
        <span className="block text-[9px] font-normal tracking-normal normal-case opacity-80">
          approved or investigated
        </span>
      </div>
      {wide && (
        <div className="text-[10px] font-semibold tracking-[0.14em] text-ink-soft uppercase">
          Developer
        </div>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------------- row */

interface RowProps {
  entry: Entry
  meta: Meta
  geo: ReturnType<typeof axisGeometry>
  grid: string
  wide: boolean
  index: number
  dragging: boolean
  dropBefore: boolean
  dropAfter: boolean
  controls: TimelineControls
  onDragStart: () => void
  onDragEnd: () => void
  onDragOverRow: (before: boolean) => void
  onDropRow: () => void
  onHover: (x: number, y: number) => void
  onLeave: () => void
  onPin: (x: number, y: number) => void
}

function EntryRow({
  entry,
  meta,
  geo,
  grid,
  wide,
  index,
  dragging,
  dropBefore,
  dropAfter,
  controls,
  onDragStart,
  onDragEnd,
  onDragOverRow,
  onDropRow,
  onHover,
  onLeave,
  onPin,
}: RowProps) {
  const marks = rowMarks(entry, meta)
  const badge = indicationBadge(entry)
  const href = safeUrl(entry.lapal_url)
  // A drag ends with a click event in some browsers; that must not navigate.
  const dragged = useRef(false)
  /**
   * The row is only draggable while the pointer is on the grip.
   *
   * The row is also a link, so if the whole thing were permanently draggable a
   * press-and-move would race between "start a drag" and "follow the link", and
   * in practice opened a new tab instead of reordering. Arming from the grip
   * makes the two gestures unambiguous: grip to move, anywhere else to open.
   */
  const [armed, setArmed] = useState(false)

  const open = () => {
    if (!href) return
    // noopener and noreferrer: the opened page must not get a handle back to
    // this window, and must not receive the referrer.
    window.open(href, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      data-entry-row
      data-index={index}
      tabIndex={0}
      role={href ? 'link' : 'button'}
      aria-label={
        href
          ? `${entry.name_full}, ${entry.stage}, ${badge}. Opens on LAPaL in a new tab.`
          : `${entry.name_full}, ${entry.stage}, ${badge}`
      }
      draggable={armed}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        // Firefox requires data to be set for a drag to start at all.
        e.dataTransfer.setData('text/plain', entry.id)
        dragged.current = true
        onDragStart()
      }}
      onDragEnd={() => {
        setArmed(false)
        onDragEnd()
        // Clear on the next tick, after any trailing click has been swallowed.
        setTimeout(() => {
          dragged.current = false
        }, 0)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        const r = e.currentTarget.getBoundingClientRect()
        onDragOverRow(e.clientY < r.top + r.height / 2)
      }}
      onDrop={(e) => {
        e.preventDefault()
        onDropRow()
      }}
      className={`group relative grid items-center gap-x-4 px-1 outline-offset-[-2px] hover:bg-black/[0.035] focus-visible:bg-black/[0.035] ${
        href ? 'cursor-pointer' : 'cursor-default'
      } ${dragging ? 'opacity-40' : ''}`}
      style={{ gridTemplateColumns: grid, height: ROW_H }}
      onMouseMove={(e) => onHover(e.clientX, e.clientY)}
      onMouseLeave={onLeave}
      onClick={(e) => {
        if (dragged.current) return
        if (href) open()
        else onPin(e.clientX, e.clientY)
      }}
      onFocus={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        onHover(r.left + 40, r.bottom)
      }}
      onBlur={onLeave}
      onKeyDown={(e) => {
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault()
          controls.onNudge(entry.id, e.key === 'ArrowUp' ? -1 : 1)
          return
        }
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (href) {
            open()
          } else {
            const r = e.currentTarget.getBoundingClientRect()
            onPin(r.left + 40, r.bottom)
          }
        }
      }}
    >
      {(dropBefore || dropAfter) && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-0 left-0 h-0.5 bg-accent"
          style={dropBefore ? { top: -1 } : { bottom: -1 }}
        />
      )}

      {/* reorder and hide controls, revealed on hover or focus */}
      <div className="flex items-center gap-0.5 opacity-35 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <span
          role="button"
          tabIndex={-1}
          aria-label={`Drag to reorder ${entry.name_full}`}
          title="Drag to reorder. With the row focused, Alt and the arrow keys also work."
          onMouseDown={() => setArmed(true)}
          onMouseUp={() => setArmed(false)}
          onClick={(e) => e.stopPropagation()}
          className="cursor-grab px-1 text-ink-soft active:cursor-grabbing"
        >
          <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
            <circle cx="2" cy="2" r="1.2" /><circle cx="8" cy="2" r="1.2" />
            <circle cx="2" cy="7" r="1.2" /><circle cx="8" cy="7" r="1.2" />
            <circle cx="2" cy="12" r="1.2" /><circle cx="8" cy="12" r="1.2" />
          </svg>
        </span>
        <button
          type="button"
          title={`Hide ${entry.name_full} from this view`}
          aria-label={`Hide ${entry.name_full} from this view`}
          onClick={(e) => {
            e.stopPropagation()
            controls.onHide(entry.id)
          }}
          className="rounded px-1 py-0.5 text-ink-soft hover:text-ink"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" />
            <path d="M9.4 5.2A9.5 9.5 0 0112 5c5 0 9 4.5 9 7a12 12 0 01-2.4 3.3M6.2 6.7C3.9 8.2 3 10.4 3 12c0 2.5 4 7 9 7a9.6 9.6 0 003.6-.7" />
          </svg>
        </button>
      </div>

      {/* name, with the stage dot that carries stage identity in custom order */}
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          aria-hidden
          title={entry.stage}
          className="inline-block size-2 shrink-0 rounded-full"
          style={{ background: stageVar(entry.stage) }}
        />
        <span className="line-clamp-2 text-[13px] leading-tight text-ink" title={entry.name_full}>
          {entry.name_full}
        </span>
        <IndicationBadge badge={badge} />
        <PhaseChip meta={meta} phase={entry.highest_phase} />
        {href && (
          <button
            type="button"
            title={`Open ${entry.name_full} on LAPaL in a new tab`}
            aria-label={`Open ${entry.name_full} on LAPaL in a new tab`}
            onClick={(e) => {
              e.stopPropagation()
              open()
            }}
            className="shrink-0 rounded p-0.5 text-ink-soft opacity-45 transition-opacity hover:text-accent hover:opacity-100 group-hover:opacity-80"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
            </svg>
          </button>
        )}
      </div>

      {/* plot */}
      <svg width={Math.max(geo.width, 0)} height={ROW_H} className="block overflow-visible" aria-hidden>
        {meta.dosing_axis_order.map((code, i) => (
          <line
            key={code}
            x1={geo.centre(i)}
            x2={geo.centre(i)}
            y1={0}
            y2={ROW_H}
            stroke="var(--color-hairline)"
            strokeWidth={1}
            opacity={0.7}
          />
        ))}
        <line
          x1={geo.dividerX}
          x2={geo.dividerX}
          y1={0}
          y2={ROW_H}
          stroke="var(--color-hairline)"
          strokeWidth={1}
          strokeDasharray="2 3"
        />

        {marks.span && (
          <rect
            x={geo.centre(marks.span.from)}
            y={(ROW_H - BAR_H) / 2}
            width={Math.max(0, geo.centre(marks.span.to) - geo.centre(marks.span.from))}
            height={BAR_H}
            rx={BAR_H / 2}
            fill={marks.colour}
            opacity={BAR_OPACITY}
          />
        )}

        {marks.dotIndices.map((i) => (
          <circle key={i} cx={geo.centre(i)} cy={ROW_H / 2} r={DOT_R} fill={marks.colour} />
        ))}

        {marks.notStated && (
          <circle
            cx={geo.notStatedCentre}
            cy={ROW_H / 2}
            r={DOT_R}
            fill="var(--color-paper)"
            stroke={marks.colour}
            strokeWidth={1.6}
          />
        )}
      </svg>

      {/* routes */}
      <div className="flex flex-wrap items-center gap-1">
        {entry.routes.map((r, i) => (
          <span
            key={r}
            title={entry.routes_full[i] ?? meta.route_legend[r]}
            className="rounded-sm border px-1 py-px font-mono text-[10px] tracking-wide"
            style={routeChipStyle(meta, r)}
          >
            {r}
          </span>
        ))}
      </div>

      {/* developer */}
      {wide && (
        <div
          className="line-clamp-2 text-[12px] leading-tight text-ink-soft"
          title={entry.developers_full.join('; ')}
        >
          {entry.developers_full[0] ?? ''}
          {entry.developers_full.length > 1 && (
            <span className="opacity-60"> +{entry.developers_full.length - 1}</span>
          )}
        </div>
      )}
    </div>
  )
}

function IndicationBadge({ badge }: { badge: 'Treatment' | 'Prevention' | 'Both' }) {
  const t = 'var(--color-treatment)'
  const p = 'var(--color-prevention)'
  const style =
    badge === 'Both'
      ? {
          background: `linear-gradient(90deg, color-mix(in srgb, ${t} 14%, transparent) 0 50%, color-mix(in srgb, ${p} 14%, transparent) 50% 100%)`,
          color: 'var(--color-ink)',
        }
      : {
          background: `color-mix(in srgb, ${badge === 'Treatment' ? t : p} 12%, transparent)`,
          color: badge === 'Treatment' ? t : p,
        }

  return (
    <span
      className="shrink-0 rounded-full px-1.5 py-px text-[9px] font-semibold tracking-[0.08em] uppercase"
      style={style}
    >
      {badge === 'Treatment' ? 'Tx' : badge === 'Prevention' ? 'Prev' : 'Both'}
    </span>
  )
}
