/**
 * The live "at a glance" panel.
 *
 * Recomputed from the currently filtered set on every change, the indication
 * selection included, so the numbers always describe exactly the rows below.
 *
 * Each tile is also a shortcut to the filter that produces its count: clicking
 * "8 Approved" narrows the view to those eight, and clicking it again clears
 * that filter. The mapping lives in filters.ts alongside the counting logic, so
 * a tile can never show one number and filter to a different set.
 *
 * Two tiles are not clickable, and are rendered as plain figures: "In view" is
 * already the whole selection, and "Developers" counts organisations rather
 * than rows, so there is no set of entries it could select.
 */
import type { Meta } from '../types'
import {
  type FilterState,
  type Summary as SummaryData,
  type SummaryKey,
  clearSummaryFilter,
  summaryFilter,
} from '../filters'
import { LONG_INTERVAL_FROM } from '../encoding'

export function Summary({
  data,
  meta,
  filters,
  setFilters,
}: {
  data: SummaryData
  meta: Meta
  filters: FilterState
  setFilters: (update: (s: FilterState) => FilterState) => void
}) {
  const longLabel = meta.dosing_axis_labels[LONG_INTERVAL_FROM] ?? LONG_INTERVAL_FROM

  const tiles: { key: SummaryKey; label: string; hint: string }[] = [
    { key: 'total', label: 'In view', hint: 'Entries matching every filter, counted once each' },
    { key: 'approved', label: 'Approved', hint: 'Marketed in at least one jurisdiction' },
    {
      key: 'injectable',
      label: 'Injectable',
      hint: 'Has a subcutaneous, intramuscular or intravenous route',
    },
    {
      key: 'oral',
      label: 'Have oral route',
      hint: 'Has an oral route recorded, often alongside a long-acting one',
    },
    {
      key: 'longInterval',
      label: `Dosed ${LONG_INTERVAL_FROM} or longer`,
      hint: `At least one interval at or beyond ${longLabel.toLowerCase()}`,
    },
    {
      key: 'developers',
      label: 'Developers',
      hint: 'Distinct organisations across the entries in view',
    },
  ]

  return (
    <section
      aria-label="At a glance"
      className="grid grid-cols-2 gap-px border-y border-hairline bg-hairline sm:grid-cols-3 lg:grid-cols-6"
    >
      {tiles.map((t) => {
        const spec = summaryFilter(t.key, meta)
        const active = spec?.isActive(filters) ?? false
        const value = data[t.key]

        if (!spec) {
          return (
            <div key={t.key} className="bg-paper px-3 py-4" title={t.hint}>
              <TileBody label={t.label} value={value} />
            </div>
          )
        }

        return (
          <button
            key={t.key}
            type="button"
            aria-pressed={active}
            title={active ? `${t.hint}. Click to clear this filter.` : `${t.hint}. Click to filter.`}
            onClick={() =>
              setFilters((s) => (spec.isActive(s) ? clearSummaryFilter(t.key, s) : spec.apply(s)))
            }
            className="group bg-paper px-3 py-4 text-left transition-colors hover:bg-black/[0.035]"
            style={
              active
                ? { background: 'color-mix(in srgb, var(--color-accent) 9%, var(--color-paper))' }
                : undefined
            }
          >
            <TileBody label={t.label} value={value} active={active} interactive />
          </button>
        )
      })}
    </section>
  )
}

function TileBody({
  label,
  value,
  active,
  interactive,
}: {
  label: string
  value: number
  active?: boolean
  interactive?: boolean
}) {
  return (
    <>
      <div className="mb-1 flex items-baseline gap-1.5">
        <span
          className="text-[26px] leading-none font-semibold tabular-nums"
          style={{ color: active ? 'var(--color-accent)' : 'var(--color-ink)' }}
        >
          {value}
        </span>
        {interactive && (
          <span
            aria-hidden
            className={`text-[10px] transition-opacity ${
              active ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'
            }`}
            style={{ color: 'var(--color-accent)' }}
          >
            {active ? '✕' : '▸'}
          </span>
        )}
      </div>
      <p
        className="text-[10px] leading-tight font-semibold tracking-[0.1em] uppercase"
        style={{ color: active ? 'var(--color-accent)' : 'var(--color-ink-soft)' }}
      >
        {label}
      </p>
    </>
  )
}
