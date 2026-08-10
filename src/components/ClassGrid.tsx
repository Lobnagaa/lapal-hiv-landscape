/**
 * The class-by-phase grid: drug class down, clinical phase across, with the
 * agents themselves sitting in the cells.
 *
 * ---------------------------------------------------------------------------
 * WHY A GRID RATHER THAN A BAR CHART
 * ---------------------------------------------------------------------------
 * The static reference figures split this message across four objects: a
 * class-by-phase table listing names, a per-agent dot matrix, and two stacked
 * bar charts of the same counts with the axes swapped. This one grid carries
 * all of it. The agent names are present, which the bars lose, and the counts
 * are readable from how full each cell is, which is what the bars were for.
 *
 * Every agent is a chip: hover for the detail card, click to open its LAPaL
 * entry. Empty cells are left genuinely empty rather than drawn with a zero,
 * so the shape of the pipeline reads at a glance.
 *
 * Counting: `class_group` puts a combination product in its own class row, so
 * each entry appears exactly ONCE and the row and column totals both sum to
 * the number of entries in view. That is the whole reason the tidy class
 * vocabulary exists alongside the free-text drug_class.
 */
import { useRef, useState } from 'react'
import type { Entry, Meta } from '../types'
import { indicationBadge, phaseLabel } from '../types'
import { BandTag } from './BandTag'
import { foldClass } from '../charts'
import { arrangeCell, arrangeClasses, cellKey } from '../viewState'
import type { ViewState } from '../viewState'

export interface ClassGridProps {
  entries: Entry[]
  meta: Meta
  onHover: (entry: Entry, x: number, y: number) => void
  onLeave: () => void
  /** Hide one agent. */
  onHide: (id: string) => void
  /**
   * Row controls.
   *
   * A chip cannot be dragged anywhere, because its position is decided by its
   * class and phase. The ROWS can: drag a class by its grip to bring it up the
   * grid, or hide the class outright, which hides every agent in it.
   *
   * `onReorder` takes the full list of class names in their new order, not an
   * index, for the same reason the agents table does: this component decides
   * its own row order, so only it knows what row 5 is.
   */
  onReorder: (classes: string[]) => void
  onHideClass: (ids: string[]) => void
  /**
   * Reorder the chips inside one cell. `key` identifies the cell (see
   * viewState.cellKey); `ids` is that cell's chips in their new order. Scoped
   * to the cell, not the whole grid, because a chip's cell is fixed by its
   * class and phase and there is nowhere else for it to go.
   */
  onReorderCell: (key: string, ids: string[]) => void
  /** The reader's arrangement, for the row order and every cell's order. */
  order: ViewState
}

/**
 * Move `from` next to `target` within `list`, on the side the drag direction
 * implies. Shared by the row drag and the within-cell chip drag; the same
 * before/after rule applies whichever axis is being reordered.
 */
function reorderList(list: string[], from: string, target: string): string[] {
  const fromIdx = list.indexOf(from)
  const targetIdx = list.indexOf(target)
  if (fromIdx < 0 || targetIdx < 0) return list
  const next = list.filter((id) => id !== from)
  const insertAt = targetIdx > fromIdx ? next.indexOf(target) + 1 : next.indexOf(target)
  next.splice(insertAt, 0, from)
  return next
}

/** Only ever open a plain web address. Mirrors the guard in Timeline.tsx. */
function safeUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url, window.location.href)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

export function ClassGrid({
  entries,
  meta,
  onHover,
  onLeave,
  onHide,
  onReorder,
  onHideClass,
  onReorderCell,
  order,
}: ClassGridProps) {
  const [sort, setSort] = useState<'default' | 'az'>('default')
  const phases = meta.phase_order ?? []
  // Only the classes and phases actually present, so the grid does not carry
  // empty rows or columns for vocabulary that is not in the current selection.
  const classes = (meta.class_order ?? []).filter((c) =>
    entries.some((e) => e.class_group === c),
  )
  const unclassified = entries.filter((e) => !e.class_group)
  const phasesPresent = phases.filter((p) => entries.some((e) => e.highest_phase === p))
  const noPhase = entries.filter((e) => !e.highest_phase)

  const cols = [...phasesPresent, ...(noPhase.length ? ['__none__'] : [])]
  const baseRows = [...classes, ...(unclassified.length ? ['__none__'] : [])]
  // A dragged row always wins, same rule the agents table's sort uses: once
  // the reader has taken over the order, silently re-sorting under them would
  // undo it. Otherwise the preset decides: build_data.py's own class_order
  // (most agents first), or alphabetical.
  const customRows = order.classOrder.length > 0
  const rows = customRows
    ? arrangeClasses(baseRows, order)
    : sort === 'az'
      ? [...baseRows].sort((a, b) =>
          (a === '__none__' ? 'Class not stated' : a).localeCompare(
            b === '__none__' ? 'Class not stated' : b,
            'en-GB',
          ),
        )
      : baseRows

  // Drag state lives in refs, not state: dragover fires far faster than React
  // re-renders, and reading a stale copy is what broke the reorder in the other
  // two views.
  const dragged = useRef<string | null>(null)
  const [overRow, setOverRow] = useState<string | null>(null)

  const drop = (target: string) => {
    const from = dragged.current
    dragged.current = null
    setOverRow(null)
    if (!from || from === target) return
    onReorder(reorderList(rows, from, target))
  }

  // Chip drag, within one cell only: a second ref/state pair, kept separate
  // from the row drag above so the two gestures can never be read as each
  // other's drop target.
  const draggedItem = useRef<{ id: string; key: string } | null>(null)
  const [armedItem, setArmedItem] = useState<string | null>(null)
  const [dragItemId, setDragItemId] = useState<string | null>(null)
  const [overItem, setOverItem] = useState<{ key: string; id: string } | null>(null)
  // A drag ends with a click in some browsers; without this the release opened
  // the chip's LAPaL link instead of finishing the reorder. Same guard the
  // timeline and the agents table already use.
  const chipClickGuard = useRef(false)

  const cell = (cls: string, phase: string) =>
    entries.filter(
      (e) =>
        (cls === '__none__' ? !e.class_group : e.class_group === cls) &&
        (phase === '__none__' ? !e.highest_phase : e.highest_phase === phase),
    )

  if (entries.length === 0) {
    return (
      <div className="border-t border-hairline py-20 text-center">
        <p className="text-sm text-ink-soft">
          No entries match the current selection. Widen a filter to see the grid again.
        </p>
      </div>
    )
  }

  // Product names here run long ("Tenofovir-Lamivudine-Dolutegravir (TLD) -
  // long-acting injectable (LAI)"), so the cells need real width and the chips
  // wrap to two lines rather than truncating to nothing.
  const gridTemplate = `minmax(150px, 180px) repeat(${cols.length}, minmax(155px, 1fr))`

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 py-2">
        <span className="flex-1" />
        <span className="text-[10px] font-bold tracking-[0.14em] text-ink-soft uppercase">
          Sort
        </span>
        {(
          [
            ['default', 'Most agents'],
            ['az', 'A to Z'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={!customRows && sort === key}
            disabled={customRows}
            title={customRows ? 'Reset the row order to sort again' : undefined}
            onClick={() => setSort(key)}
            className="rounded-full border px-2.5 py-1 text-[11px] transition-colors"
            style={{
              borderColor: !customRows && sort === key ? 'var(--color-accent)' : 'var(--color-hairline)',
              background:
                !customRows && sort === key
                  ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)'
                  : 'transparent',
              color: !customRows && sort === key ? 'var(--color-accent)' : 'var(--color-ink-soft)',
              opacity: customRows ? 0.45 : 1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
      <div className="min-w-[1150px]">
        {/* column headers */}
        <div
          className="sticky top-0 z-20 grid gap-px border-b border-ink bg-paper"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div className="px-2 pt-3 pb-2 text-[10px] font-semibold tracking-[0.14em] text-ink-soft uppercase">
            Class
          </div>
          {cols.map((p) => {
            const n = entries.filter((e) =>
              p === '__none__' ? !e.highest_phase : e.highest_phase === p,
            ).length
            return (
              <div key={p} className="px-2 pt-3 pb-2">
                <div className="text-[11px] font-semibold text-ink">
                  {p === '__none__' ? 'Phase not stated' : phaseLabel(meta, p)}
                </div>
                <div className="font-mono text-[10px] tabular-nums text-ink-soft">{n}</div>
              </div>
            )
          })}
        </div>

        {/* body */}
        {rows.map((cls) => {
          const rowEntries = entries.filter((e) =>
            cls === '__none__' ? !e.class_group : e.class_group === cls,
          )
          const rowTotal = rowEntries.length
          const rowIds = rowEntries.map((e) => e.id)
          // The same colour the counts view gives this class, so the two views
          // read as one system rather than two unrelated pictures.
          const swatch = cls === '__none__' ? null : meta.class_colours?.[foldClass(meta, cls)]
          return (
            <div
              key={cls}
              className="grid gap-px border-b border-hairline"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <div
                className="group/row flex items-start gap-1 px-2 py-2.5"
                onDragOver={(ev) => {
                  if (!dragged.current) return
                  ev.preventDefault()
                  setOverRow(cls)
                }}
                onDrop={(ev) => {
                  ev.preventDefault()
                  drop(cls)
                }}
                style={
                  overRow === cls && dragged.current !== cls
                    ? { boxShadow: 'inset 0 2px 0 var(--color-accent)' }
                    : undefined
                }
              >
                <span
                  // Only the grip arms the drag. Making the whole row draggable
                  // would fight the chips inside it, which are links.
                  draggable
                  onDragStart={() => {
                    dragged.current = cls
                  }}
                  onDragEnd={() => {
                    dragged.current = null
                    setOverRow(null)
                  }}
                  title={`Drag to move ${cls === '__none__' ? 'Class not stated' : cls}`}
                  aria-label={`Drag to move ${cls === '__none__' ? 'Class not stated' : cls}`}
                  className="mt-px cursor-grab text-ink-soft opacity-0 transition-opacity group-hover/row:opacity-60 active:cursor-grabbing"
                >
                  <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden fill="currentColor">
                    <circle cx="2" cy="2" r="1.2" />
                    <circle cx="8" cy="2" r="1.2" />
                    <circle cx="2" cy="7" r="1.2" />
                    <circle cx="8" cy="7" r="1.2" />
                    <circle cx="2" cy="12" r="1.2" />
                    <circle cx="8" cy="12" r="1.2" />
                  </svg>
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    {swatch && (
                      <span
                        aria-hidden
                        title="Colour used for this class in the counts view"
                        className="inline-block size-2.5 shrink-0 rounded-sm"
                        style={{ background: swatch }}
                      />
                    )}
                    <span className="text-[12px] leading-tight font-semibold text-ink">
                      {cls === '__none__' ? 'Class not stated' : cls}
                    </span>
                  </div>
                  <div className="font-mono text-[10px] tabular-nums text-ink-soft">{rowTotal}</div>
                </div>

                <span
                  role="button"
                  tabIndex={0}
                  title={`Hide all ${rowTotal} in this class`}
                  aria-label={`Hide all ${rowTotal} in this class`}
                  onClick={() => onHideClass(rowIds)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') onHideClass(rowIds)
                  }}
                  className="mt-px shrink-0 cursor-pointer text-ink-soft opacity-0 transition-opacity group-hover/row:opacity-60 hover:opacity-100"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" />
                    <path d="M9.4 5.2A9.5 9.5 0 0112 5c5 0 9 4.5 9 7a12 12 0 01-2.4 3.3M6.2 6.7C3.9 8.2 3 10.4 3 12c0 2.5 4 7 9 7a9.6 9.6 0 003.6-.7" />
                  </svg>
                </span>
              </div>

              {cols.map((phase) => {
                const key = cellKey(cls, phase)
                const items = arrangeCell(cell(cls, phase), order, key)
                const ids = items.map((e) => e.id)
                const tint = phase === '__none__' ? undefined : meta.phase_colours?.[phase]
                return (
                  <div
                    key={phase}
                    className="min-h-[52px] px-1.5 py-2"
                    // A faint wash of the phase tint, so the columns read as a
                    // progression left to right even where cells are sparse.
                    style={
                      tint && items.length
                        ? { background: `color-mix(in srgb, ${tint} 40%, transparent)` }
                        : undefined
                    }
                  >
                    <div className="flex flex-wrap gap-1">
                      {items.map((e) => (
                        <AgentChip
                          key={e.id}
                          entry={e}
                          meta={meta}
                          onHover={onHover}
                          onLeave={onLeave}
                          onHide={onHide}
                          armed={armedItem === e.id}
                          dragging={dragItemId === e.id}
                          over={overItem?.key === key && overItem?.id === e.id}
                          clickGuard={chipClickGuard}
                          onArm={() => setArmedItem(e.id)}
                          onDisarm={() => setArmedItem(null)}
                          onDragStart={() => {
                            draggedItem.current = { id: e.id, key }
                            chipClickGuard.current = true
                            setDragItemId(e.id)
                          }}
                          onDragEnd={() => {
                            setArmedItem(null)
                            setDragItemId(null)
                            setOverItem(null)
                            draggedItem.current = null
                            setTimeout(() => {
                              chipClickGuard.current = false
                            }, 0)
                          }}
                          onDragOver={() => {
                            if (!draggedItem.current || draggedItem.current.key !== key) return
                            setOverItem({ key, id: e.id })
                          }}
                          onDrop={() => {
                            const from = draggedItem.current
                            setOverItem(null)
                            if (!from || from.key !== key || from.id === e.id) return
                            onReorderCell(key, reorderList(ids, from.id, e.id))
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      </div>
    </div>
  )
}

/**
 * One agent. The leading tag says whether this is a formulation or the
 * underlying compound: the cell already encodes phase, so repeating stage here
 * would say the same thing twice.
 *
 * The grip arms a drag that can only land on another chip in the SAME cell,
 * since a chip's cell is fixed by its class and phase; the drop handlers above
 * enforce that. The whole chip stays a link, so the grip and the eye icon are
 * the only parts that intercept a click, exactly as in the timeline row.
 */
function AgentChip({
  entry,
  meta,
  onHover,
  onLeave,
  onHide,
  armed,
  dragging,
  over,
  clickGuard,
  onArm,
  onDisarm,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  entry: Entry
  meta: Meta
  onHover: (e: Entry, x: number, y: number) => void
  onLeave: () => void
  onHide: (id: string) => void
  /** True while this chip's grip is held, which is what arms `draggable`. */
  armed: boolean
  /** True while this specific chip is the one being dragged. */
  dragging: boolean
  /** True while a dragged chip is over this one, as the drop target. */
  over: boolean
  /** Shared with every chip in the grid: true for one tick after any drop. */
  clickGuard: { current: boolean }
  onArm: () => void
  onDisarm: () => void
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: () => void
  onDrop: () => void
}) {
  const href = safeUrl(entry.lapal_url)
  const badge = indicationBadge(entry)

  return (
    <button
      type="button"
      role={href ? 'link' : 'button'}
      aria-label={
        href
          ? `${entry.name_full}, ${entry.stage}, ${badge}. Opens on LAPaL in a new tab.`
          : `${entry.name_full}, ${entry.stage}, ${badge}`
      }
      title={entry.name_full}
      draggable={armed}
      onDragStart={(ev) => {
        ev.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onDragOver={(ev) => {
        ev.preventDefault()
        onDragOver()
      }}
      onDrop={(ev) => {
        ev.preventDefault()
        onDrop()
      }}
      onMouseMove={(ev) => onHover(entry, ev.clientX, ev.clientY)}
      onMouseLeave={onLeave}
      onFocus={(ev) => {
        const r = ev.currentTarget.getBoundingClientRect()
        onHover(entry, r.left, r.bottom)
      }}
      onBlur={onLeave}
      onClick={() => {
        if (clickGuard.current) return
        if (href) window.open(href, '_blank', 'noopener,noreferrer')
      }}
      className={`group/chip flex max-w-full items-start gap-1 rounded border bg-white px-1.5 py-1 text-left transition-colors hover:border-accent ${
        href ? 'cursor-pointer' : 'cursor-default'
      } ${dragging ? 'opacity-40' : ''}`}
      style={{
        borderColor: over ? 'var(--color-accent)' : 'var(--color-hairline)',
        boxShadow: over ? 'inset 0 0 0 1px var(--color-accent)' : undefined,
      }}
    >
      <span
        role="button"
        tabIndex={-1}
        aria-label={`Drag to reorder ${entry.name_full} within this cell`}
        title="Drag to reorder within this cell"
        onMouseDown={(ev) => {
          ev.stopPropagation()
          onArm()
        }}
        onMouseUp={onDisarm}
        onClick={(ev) => ev.stopPropagation()}
        className="mt-px shrink-0 cursor-grab text-ink-soft opacity-0 transition-opacity group-hover/chip:opacity-60 active:cursor-grabbing"
      >
        <svg width="7" height="11" viewBox="0 0 7 11" aria-hidden fill="currentColor">
          <circle cx="1.5" cy="1.5" r="1.1" /><circle cx="5.5" cy="1.5" r="1.1" />
          <circle cx="1.5" cy="5.5" r="1.1" /><circle cx="5.5" cy="5.5" r="1.1" />
          <circle cx="1.5" cy="9.5" r="1.1" /><circle cx="5.5" cy="9.5" r="1.1" />
        </svg>
      </span>
      <span className="mt-px">
        <BandTag band={entry.band} meta={meta} />
      </span>
      <span className="line-clamp-2 flex-1 text-[11px] leading-tight text-ink">{entry.name_full}</span>
      <span
        role="button"
        tabIndex={-1}
        aria-label={`Hide ${entry.name_full} from this view`}
        title={`Hide ${entry.name_full} from this view`}
        onClick={(ev) => {
          ev.stopPropagation()
          onHide(entry.id)
        }}
        className="mt-0.5 shrink-0 text-ink-soft opacity-0 transition-opacity group-hover/chip:opacity-70 hover:opacity-100"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" />
          <path d="M9.4 5.2A9.5 9.5 0 0112 5c5 0 9 4.5 9 7a12 12 0 01-2.4 3.3M6.2 6.7C3.9 8.2 3 10.4 3 12c0 2.5 4 7 9 7a9.6 9.6 0 003.6-.7" />
        </svg>
      </span>
    </button>
  )
}
