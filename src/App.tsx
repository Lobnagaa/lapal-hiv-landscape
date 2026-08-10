/**
 * The dashboard.
 *
 * Three layers of "which entries do I see", kept deliberately separate:
 *
 *   1. CURATION   the curator's exclude column, applied in build_data.py. Those
 *                 entries are not in the data file at all.
 *   2. FILTERS    filters.ts. Which entries the reader is interested in.
 *   3. ARRANGEMENT viewState.ts. How the reader wants them ordered and which
 *                 they have hidden for a particular figure.
 *
 * Composition order follows the reading order, and the four views come FIRST.
 * A reader who lands on a wall of filters and keys does not know there is more
 * than one visualisation to be had; showing the choice at the top says what the
 * page can do before asking anything of them. Filters, the summary and the key
 * then sit immediately above whichever view they picked.
 */
import { useEffect, useMemo, useState } from 'react'
import { useDataset } from './data/useDataset'
import { ErrorScreen, LoadingScreen } from './components/DataState'
import { Footer, Header } from './components/Header'
import { Filters } from './components/Filters'
import { Summary } from './components/Summary'
import { Legend } from './components/Legend'
import { ViewBar } from './components/ViewBar'
import { Timeline } from './components/Timeline'
import { ClassGrid } from './components/ClassGrid'
import { AgentPhase } from './components/AgentPhase'
import { PhaseCharts } from './components/PhaseCharts'
import { Tooltip, type TooltipTarget } from './components/Tooltip'
import { accentFor, applyAccent } from './theme'
import { groupEntries, sortByAdminOrder } from './encoding'
import { type FilterState, applyFilters, defaultFilters, summarise } from './filters'
import {
  type ViewState,
  arrange,
  defaultView,
  isCustomOrder,
  moveEntry,
  nudge,
  hideMany,
  resetOrder,
  showAll,
  setClassOrder,
  setOrder,
  toggleHidden,
} from './viewState'

export default function App() {
  const state = useDataset()
  const [filters, setFilters] = useState<FilterState | null>(null)
  const [view, setView] = useState<ViewState>(defaultView)
  /** Which visualisation is on screen. */
  const [mode, setMode] = useState<'timeline' | 'agents' | 'grid' | 'charts'>('timeline')
  /** The grid's hover card. The timeline manages its own. */
  const [gridTip, setGridTip] = useState<TooltipTarget | null>(null)

  const meta = state.status === 'ready' ? state.data.meta : null

  useEffect(() => {
    if (meta && !filters) setFilters(defaultFilters(meta))
  }, [meta, filters])

  useEffect(() => {
    if (meta && filters) applyAccent(meta, filters.indications)
  }, [meta, filters])

  const entries = state.status === 'ready' ? state.data.entries : []

  /** After filtering, before the reader's arrangement. */
  const filtered = useMemo(
    () => (filters ? applyFilters(entries, filters) : []),
    [entries, filters],
  )
  /**
   * What is actually drawn, in render order, and what the PNG export contains.
   *
   * In the default view the rows are grouped by band and stage, so the render
   * order is NOT the data order. Flattening the same grouping here means the
   * reorder controls and the timeline agree on what row 5 is, and the first
   * drag starts from the arrangement the reader can see.
   */
  const adminManual = meta?.default_order_mode === 'manual'
  const visible = useMemo(() => {
    const shown = arrange(filtered, view)
    if (isCustomOrder(view) || !meta) return shown
    // The admin's flat order, when they have set one.
    if (meta.default_order_mode === 'manual') return sortByAdminOrder(shown)
    return groupEntries(shown, meta).flatMap((b) => b.groups.flatMap((g) => g.entries))
  }, [filtered, view, meta])

  // The summary describes the filtered set, not the arranged one: hiding a row
  // for a figure should not silently change what the dataset is reported to
  // contain. The ViewBar reports the hidden count separately.
  const summary = useMemo(() => (meta ? summarise(filtered, meta) : null), [filtered, meta])

  if (state.status === 'loading') return <LoadingScreen />
  if (state.status === 'error') return <ErrorScreen error={state.error} />
  if (!filters || !summary || !meta) return <LoadingScreen />

  const inScope = [...filters.indications]
  const indicationLabel =
    inScope.length === 2 ? 'Treatment and prevention' : (inScope[0] ?? 'No indication selected')

  return (
    <div className="mx-auto max-w-[1400px] px-6 md:px-10">
      <Header meta={meta} />

      <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-5">
        <span className="mr-1 text-[10px] font-semibold tracking-[0.16em] text-ink-soft uppercase">
          View
        </span>
        {(
          [
            ['timeline', 'Dosing timeline', 'Every entry on an ordinal dosing-interval axis'],
            ['agents', 'Agents by phase', 'One row per product, showing its most advanced trial phase'],
            ['grid', 'Class and phase', 'Agents by drug class and most advanced trial phase'],
            ['charts', 'Counts', 'Aggregate counts by class and by phase'],
          ] as const
        ).map(([key, label, hint]) => (
          <button
            key={key}
            type="button"
            aria-pressed={mode === key}
            title={hint}
            onClick={() => setMode(key)}
            className="rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors"
            style={{
              borderColor: mode === key ? 'var(--color-accent)' : 'var(--color-hairline)',
              background:
                mode === key ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'transparent',
              color: mode === key ? 'var(--color-accent)' : 'var(--color-ink-soft)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <Filters
        entries={entries}
        meta={meta}
        state={filters}
        setState={(update) => setFilters((f) => (f ? update(f) : f))}
      />

      <Summary
        data={summary}
        meta={meta}
        filters={filters}
        setFilters={(update) => setFilters((f) => (f ? update(f) : f))}
      />

      <Legend
        entries={visible}
        meta={meta}
        showIntervalKeys={mode === 'timeline'}
        showBandKey={mode !== 'charts'}
      />

      {(
        <ViewBar
          view={view}
          entries={visible}
          allEntries={filtered}
          meta={meta}
          indicationLabel={indicationLabel}
          accent={accentFor(meta, filters.indications)}
          onResetOrder={() => setView(resetOrder)}
          onShowAll={() => setView(showAll)}
          onUnhide={(id) => setView((v) => toggleHidden(v, id))}
          mode={mode}
        />
      )}

      <div className="mt-2">
        {mode !== 'timeline' ? (
          <>
            {mode === 'grid' && (
              <ClassGrid
                entries={visible}
                meta={meta}
                onHover={(entry, x, y) => setGridTip({ entry, x, y, pinned: false })}
                onLeave={() => setGridTip(null)}
                onHide={(id) => setView((v) => toggleHidden(v, id))}
                onReorder={(classes) => setView((v) => setClassOrder(v, classes))}
                onHideClass={(ids) => setView((v) => hideMany(v, ids))}
                order={view}
              />
            )}
            {mode === 'agents' && (
              <AgentPhase
                entries={visible}
                meta={meta}
                onHover={(entry, x, y) => setGridTip({ entry, x, y, pinned: false })}
                onLeave={() => setGridTip(null)}
                controls={{
                  custom: isCustomOrder(view),
                  onReorder: (ids) => setView((v) => setOrder(v, ids)),
                  onHide: (id) => setView((v) => toggleHidden(v, id)),
                }}
              />
            )}
            {mode === 'charts' && <PhaseCharts entries={visible} meta={meta} />}
            {gridTip && mode !== 'charts' && (
              <Tooltip target={gridTip} meta={meta} onDismiss={() => setGridTip(null)} />
            )}
          </>
        ) : (
        <Timeline
          entries={visible}
          meta={meta}
          controls={{
            // Flat rendering covers two cases: the reader has taken over the
            // order, or the admin has set an explicit one in the workbook.
            custom: isCustomOrder(view) || adminManual,
            readerCustom: isCustomOrder(view),
            onMove: (id, toIndex) => setView((v) => moveEntry(visible, v, id, toIndex)),
            onNudge: (id, delta) => setView((v) => nudge(visible, v, id, delta)),
            onHide: (id) => setView((v) => toggleHidden(v, id)),
          }}
        />
        )}
      </div>

      <Footer meta={meta} />
    </div>
  )
}
