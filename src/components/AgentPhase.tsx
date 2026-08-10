/**
 * One row per agent, a dot in the column for its most advanced trial phase.
 *
 * This is the per-agent dot matrix from the static reference set, made live.
 * Where the class grid answers "which classes are where", this answers "where
 * is this particular product", which is the question you ask when you arrive
 * looking for a specific name.
 *
 * Sorted alphabetically by default, because the reader is scanning for a name
 * rather than reading a ranking. The dot carries development stage, so the
 * colour language matches the timeline and the class grid; the column tint
 * carries phase, so the progression still reads left to right.
 */
import { useMemo, useRef, useState } from 'react'
import type { Entry, Meta } from '../types'
import { indicationBadge, phaseLabel } from '../types'
import { BandTag } from './BandTag'

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

type SortKey = 'name' | 'phase' | 'class' | 'stage' | 'band'

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'A to Z' },
  { key: 'phase', label: 'Most advanced' },
  { key: 'class', label: 'Class' },
  { key: 'stage', label: 'Stage' },
  { key: 'band', label: 'Entry type' },
]

export function AgentPhase({
  entries,
  meta,
  onHover,
  onLeave,
  controls,
}: {
  entries: Entry[]
  meta: Meta
  onHover: (entry: Entry, x: number, y: number) => void
  onLeave: () => void
  controls: {
    /** True once the reader has dragged something. Their order then wins. */
    custom: boolean
    /**
     * Receives the FULL rendered order as ids. This view sorts itself, so only
     * it knows what row 3 actually is; handing over an index computed
     * elsewhere moves the wrong row.
     */
    onReorder: (orderedIds: string[]) => void
    onHide: (id: string) => void
  }
}) {
  const [sort, setSort] = useState<SortKey>('name')
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const dragIdRef = useRef<string | null>(null)
  const dropIndexRef = useRef<number | null>(null)
  /** The row is only draggable while the grip is held; see Timeline.tsx. */
  const [armedId, setArmedId] = useState<string | null>(null)
  /**
   * A drag ends with a click in some browsers. Without this the release opened
   * the LAPaL entry instead of finishing the reorder, which read as "dragging
   * does not work". Same guard the timeline already had.
   */
  const draggedRef = useRef(false)

  const phases = meta.phase_order ?? []
  const phasesPresent = phases.filter((p) => entries.some((e) => e.highest_phase === p))
  const anyNoPhase = entries.some((e) => !e.highest_phase)
  const cols = [...phasesPresent, ...(anyNoPhase ? ['__none__'] : [])]

  const rows = useMemo(() => {
    // A manual arrangement always wins: the reader has said what they want, and
    // silently re-sorting under them would undo it.
    if (controls.custom) return entries
    const byName = (a: Entry, b: Entry) => a.name_full.localeCompare(b.name_full, 'en-GB')
    const phaseRank = (e: Entry) => (e.highest_phase ? phases.indexOf(e.highest_phase) : -1)
    const stageRank = (e: Entry) => Object.keys(meta.stage_tiers).indexOf(e.stage)
    // Same order record_bands is defined in, so this agrees with the Entry
    // type filter buttons and the F/R chip's own precedence.
    const bandOrder = Object.keys(meta.record_bands)
    const bandRank = (e: Entry) => bandOrder.indexOf(e.band)
    const sorted = [...entries]
    switch (sort) {
      case 'phase':
        return sorted.sort((a, b) => phaseRank(b) - phaseRank(a) || byName(a, b))
      case 'class':
        return sorted.sort(
          (a, b) =>
            (a.class_group ?? 'zzz').localeCompare(b.class_group ?? 'zzz', 'en-GB') || byName(a, b),
        )
      case 'stage':
        return sorted.sort((a, b) => stageRank(a) - stageRank(b) || byName(a, b))
      case 'band':
        return sorted.sort((a, b) => bandRank(a) - bandRank(b) || byName(a, b))
      default:
        return sorted.sort(byName)
    }
  }, [entries, sort, phases, meta.stage_tiers, controls.custom])

  if (entries.length === 0) {
    return (
      <div className="border-t border-hairline py-20 text-center">
        <p className="text-sm text-ink-soft">
          No entries match the current selection. Widen a filter to see the agents again.
        </p>
      </div>
    )
  }

  const template = `48px minmax(230px, 1.5fr) repeat(${cols.length}, minmax(78px, 1fr))`

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 py-2">
        <span className="text-[12px] text-ink-soft">
          {rows.length} {rows.length === 1 ? 'agent' : 'agents'}. Click one to open it on LAPaL.
        </span>
        <span className="flex-1" />
        <span className="text-[10px] font-semibold tracking-[0.14em] text-ink-soft uppercase">
          Sort
        </span>
        {SORTS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            aria-pressed={!controls.custom && sort === key}
            disabled={controls.custom}
            title={controls.custom ? 'Reset the order to sort again' : undefined}
            onClick={() => setSort(key)}
            className="rounded-full border px-2.5 py-1 text-[11px] transition-colors"
            style={{
              borderColor:
                !controls.custom && sort === key ? 'var(--color-accent)' : 'var(--color-hairline)',
              background:
                !controls.custom && sort === key
                  ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)'
                  : 'transparent',
              color: !controls.custom && sort === key ? 'var(--color-accent)' : 'var(--color-ink-soft)',
              opacity: controls.custom ? 0.45 : 1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[860px]">
          {/* header */}
          <div
            className="sticky top-0 z-20 grid gap-px border-b border-ink bg-paper"
            style={{ gridTemplateColumns: template }}
          >
            <div />
            <div className="px-2 pt-3 pb-2 text-[10px] font-semibold tracking-[0.14em] text-ink-soft uppercase">
              Agent
            </div>
            {cols.map((p) => {
              const n = entries.filter((e) =>
                p === '__none__' ? !e.highest_phase : e.highest_phase === p,
              ).length
              return (
                <div key={p} className="px-2 pt-3 pb-2 text-center">
                  <div className="text-[11px] leading-tight font-semibold text-ink">
                    {p === '__none__' ? 'Not stated' : phaseLabel(meta, p)}
                  </div>
                  <div className="font-mono text-[10px] tabular-nums text-ink-soft">{n}</div>
                </div>
              )
            })}
          </div>

          {/* rows */}
          {rows.map((e, rowIndex) => {
            const href = safeUrl(e.lapal_url)
            const badge = indicationBadge(e)
            return (
              <div
                key={e.id}
                data-agent-row
                role={href ? 'link' : undefined}
                tabIndex={0}
                draggable={armedId === e.id}
                onDragStart={(ev) => {
                  ev.dataTransfer.effectAllowed = 'move'
                  ev.dataTransfer.setData('text/plain', e.id)
                  dragIdRef.current = e.id
                  draggedRef.current = true
                  setDragId(e.id)
                }}
                onDragEnd={() => {
                  setArmedId(null)
                  dragIdRef.current = null
                  dropIndexRef.current = null
                  setDragId(null)
                  setDropIndex(null)
                  // Clear on the next tick, after any trailing click is swallowed.
                  setTimeout(() => {
                    draggedRef.current = false
                  }, 0)
                }}
                onDragOver={(ev) => {
                  ev.preventDefault()
                  const r = ev.currentTarget.getBoundingClientRect()
                  const i = ev.clientY < r.top + r.height / 2 ? rowIndex : rowIndex + 1
                  dropIndexRef.current = i
                  setDropIndex(i)
                }}
                onDrop={(ev) => {
                  ev.preventDefault()
                  const id = dragIdRef.current
                  const to = dropIndexRef.current
                  if (id && to !== null) {
                    const ids = rows.map((r) => r.id)
                    const from = ids.indexOf(id)
                    if (from >= 0) {
                      const next = [...ids]
                      next.splice(from, 1)
                      // The drop index counts the list BEFORE removal, so shift
                      // down when the row is travelling forwards.
                      next.splice(to > from ? to - 1 : to, 0, id)
                      controls.onReorder(next)
                    }
                  }
                  setArmedId(null)
                  dragIdRef.current = null
                  dropIndexRef.current = null
                  setDragId(null)
                  setDropIndex(null)
                }}
                aria-label={
                  href
                    ? `${e.name_full}, ${e.highest_phase ?? 'phase not stated'}, ${e.stage}. Opens on LAPaL in a new tab.`
                    : `${e.name_full}, ${e.highest_phase ?? 'phase not stated'}, ${e.stage}`
                }
                onMouseMove={(ev) => onHover(e, ev.clientX, ev.clientY)}
                onMouseLeave={onLeave}
                onFocus={(ev) => {
                  const r = ev.currentTarget.getBoundingClientRect()
                  onHover(e, r.left + 40, r.bottom)
                }}
                onBlur={onLeave}
                onClick={() => {
                  if (draggedRef.current) return
                  if (href) window.open(href, '_blank', 'noopener,noreferrer')
                }}
                onKeyDown={(ev) => {
                  if (ev.altKey && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) {
                    ev.preventDefault()
                    const ids = rows.map((r) => r.id)
                    const i = ids.indexOf(e.id)
                    const target = i + (ev.key === 'ArrowUp' ? -1 : 1)
                    if (i >= 0 && target >= 0 && target < ids.length) {
                      const next = [...ids]
                      const [moved] = next.splice(i, 1)
                      if (moved) next.splice(target, 0, moved)
                      controls.onReorder(next)
                    }
                    return
                  }
                  if ((ev.key === 'Enter' || ev.key === ' ') && href) {
                    ev.preventDefault()
                    window.open(href, '_blank', 'noopener,noreferrer')
                  }
                }}
                className={`group relative grid items-center gap-px border-b border-hairline hover:bg-black/[0.035] focus-visible:bg-black/[0.035] ${
                  href ? 'cursor-pointer' : ''
                } ${dragId === e.id ? 'opacity-40' : ''}`}
                style={{ gridTemplateColumns: template }}
              >
                {dropIndex === rowIndex && (
                  <span aria-hidden className="pointer-events-none absolute inset-x-0 -top-px h-0.5 bg-accent" />
                )}
                {dropIndex === rowIndex + 1 && rowIndex === rows.length - 1 && (
                  <span aria-hidden className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 bg-accent" />
                )}

                {/* grip to reorder, eye to hide. Same gesture split as the timeline:
                    the row is inert until the grip is pressed, so a click still
                    opens the LAPaL entry rather than starting a drag. */}
                <div className="flex items-center gap-0.5 pl-1 opacity-35 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Drag to reorder ${e.name_full}`}
                    title="Drag to reorder. With the row focused, Alt and the arrow keys also work."
                    onMouseDown={() => setArmedId(e.id)}
                    onMouseUp={() => setArmedId(null)}
                    onClick={(ev) => ev.stopPropagation()}
                    className="cursor-grab px-0.5 text-ink-soft active:cursor-grabbing"
                  >
                    <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
                      <circle cx="2" cy="2" r="1.2" /><circle cx="8" cy="2" r="1.2" />
                      <circle cx="2" cy="7" r="1.2" /><circle cx="8" cy="7" r="1.2" />
                      <circle cx="2" cy="12" r="1.2" /><circle cx="8" cy="12" r="1.2" />
                    </svg>
                  </span>
                  <button
                    type="button"
                    aria-label={`Hide ${e.name_full} from this view`}
                    title={`Hide ${e.name_full} from this view`}
                    onClick={(ev) => {
                      ev.stopPropagation()
                      controls.onHide(e.id)
                    }}
                    className="rounded px-0.5 py-0.5 text-ink-soft hover:text-ink"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8" />
                      <path d="M9.4 5.2A9.5 9.5 0 0112 5c5 0 9 4.5 9 7a12 12 0 01-2.4 3.3M6.2 6.7C3.9 8.2 3 10.4 3 12c0 2.5 4 7 9 7a9.6 9.6 0 003.6-.7" />
                    </svg>
                  </button>
                </div>

                <div className="flex min-w-0 items-center gap-1.5 px-2 py-2">
                  <BandTag band={e.band} meta={meta} />
                  <span className="line-clamp-2 text-[12px] leading-tight text-ink">
                    {e.name_full}
                  </span>
                  <span className="shrink-0 text-[9px] font-semibold tracking-[0.06em] text-ink-soft uppercase">
                    {badge === 'Treatment' ? 'Tx' : badge === 'Prevention' ? 'Prev' : 'Both'}
                  </span>
                </div>

                {cols.map((p) => {
                  const here =
                    p === '__none__' ? !e.highest_phase : e.highest_phase === p
                  const tint = p === '__none__' ? undefined : meta.phase_colours?.[p]
                  return (
                    <div
                      key={p}
                      className="flex h-full items-center justify-center py-2"
                      style={
                        tint ? { background: `color-mix(in srgb, ${tint} 28%, transparent)` } : undefined
                      }
                    >
                      {here && (
                        <span
                          aria-hidden
                          className="inline-block size-2.5 rounded-full"
                          style={{ background: 'var(--color-ink)' }}
                        />
                      )}
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
