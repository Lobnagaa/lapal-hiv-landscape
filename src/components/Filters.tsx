/**
 * The filter bar.
 *
 * Two rows. Search and the facet dropdowns (Stage, Route, Interval, Developer)
 * come first, directly under the view switcher, since narrowing what is on
 * screen is the more frequent action. Indication and Entry type sit below:
 * both drive scope too, but each is a two-way toggle rather than a search or a
 * long facet list, so they read as a smaller, second decision rather than
 * competing with the row above for attention.
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Band, Entry, Indication, Meta } from '../types'
import {
  type FacetKey,
  type FilterState,
  activeCount,
  defaultFilters,
  facetOptions,
} from '../filters'
import { stageVar } from '../theme'

const FACETS: { key: FacetKey; label: string }[] = [
  { key: 'stages', label: 'Stage' },
  { key: 'routes', label: 'Route' },
  { key: 'frequencies', label: 'Interval' },
  { key: 'developers', label: 'Developer' },
]

/**
 * Display label for the two bands, matching the F/R and C letters the chip
 * uses elsewhere so a reader can connect this toggle to that tag.
 */
const BAND_LABEL: Record<Band, string> = { formulations: 'Formulations/Regimens', compounds: 'Compounds' }

export function Filters({
  entries,
  meta,
  state,
  setState,
}: {
  entries: Entry[]
  meta: Meta
  state: FilterState
  /**
   * Takes an updater rather than a value, so two changes landing in the same
   * tick compose instead of the second clobbering the first with a stale copy.
   */
  setState: (update: (s: FilterState) => FilterState) => void
}) {
  const active = activeCount(state, meta)

  const toggleIn = <T,>(set: Set<T>, v: T): Set<T> => {
    const next = new Set(set)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    return next
  }

  return (
    <div className="space-y-3 py-6">
      {/* search and the facet dropdowns: narrowing the current selection */}
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox
          value={state.search}
          onChange={(search) => setState((s) => ({ ...s, search }))}
        />

        {FACETS.map(({ key, label }) => (
          <FacetSelect
            key={key}
            label={label}
            options={facetOptions(entries, state, meta, key)}
            showSwatch={key === 'stages'}
            onToggle={(v) => setState((s) => ({ ...s, [key]: toggleIn(s[key], v) }))}
            onClear={() => setState((s) => ({ ...s, [key]: new Set<string>() }))}
          />
        ))}
      </div>

      {/*
        Indication and Entry type: two-way toggles rather than a search or a
        long list, so they sit apart from the row above as a smaller decision.
        Indication used to stand alone as a hero section, sized well above
        everything else; it decides the chrome accent and what is in scope, but
        functionally it is one more toggle, so it is now sized like Entry type
        beside it rather than announcing itself as a different kind of control.
      */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          title={meta.dual_use_note}
          className="text-[10px] font-semibold tracking-[0.14em] text-ink-soft uppercase"
        >
          Indication
        </span>
        {(['Treatment', 'Prevention'] as Indication[]).map((ind) => {
          const on = state.indications.has(ind)
          const colour = ind === 'Treatment' ? 'var(--color-treatment)' : 'var(--color-prevention)'
          return (
            <Toggle
              key={ind}
              on={on}
              accent={colour}
              onClick={() => setState((s) => ({ ...s, indications: toggleIn(s.indications, ind) }))}
            >
              {ind}
            </Toggle>
          )
        })}
        {state.indications.size === 0 && (
          <span className="text-[11px] text-flag">Select at least one indication to see entries.</span>
        )}

        <span className="mx-1 hidden h-5 w-px bg-hairline sm:block" />

        <span className="text-[10px] font-semibold tracking-[0.14em] text-ink-soft uppercase">
          Entry type
        </span>
        {(Object.keys(meta.record_bands) as Band[]).map((band) => (
          <Toggle
            key={band}
            on={state.bands.has(band)}
            // Same wash the C / F/R chip uses elsewhere, so the colour means
            // the same thing here as it does on every row it filters.
            accent={meta.band_colours?.[band] ?? 'var(--color-accent)'}
            onClick={() => setState((s) => ({ ...s, bands: toggleIn(s.bands, band) }))}
          >
            {BAND_LABEL[band] ?? band}
          </Toggle>
        ))}

        <span className="flex-1" />

        {active > 0 && (
          <button
            type="button"
            onClick={() => setState(() => defaultFilters(meta))}
            className="text-[12px] text-accent underline underline-offset-4 hover:opacity-70"
          >
            Clear {active} {active === 1 ? 'filter' : 'filters'}
          </button>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ pieces */

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search product or developer"
        aria-label="Search product or developer"
        className="w-56 rounded-full border border-hairline bg-white px-4 py-1.5 text-[13px] text-ink placeholder:text-ink-soft/70"
      />
    </div>
  )
}

function Toggle({
  on,
  onClick,
  accent = 'var(--color-accent)',
  children,
}: {
  on: boolean
  onClick: () => void
  accent?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="rounded-full border px-3 py-1.5 text-[12px] transition-colors"
      style={{
        borderColor: on ? accent : 'var(--color-hairline)',
        background: on ? `color-mix(in srgb, ${accent} 10%, transparent)` : 'transparent',
        color: on ? accent : 'var(--color-ink-soft)',
      }}
    >
      {children}
    </button>
  )
}

function FacetSelect({
  label,
  options,
  showSwatch,
  onToggle,
  onClear,
}: {
  label: string
  options: ReturnType<typeof facetOptions>
  showSwatch?: boolean
  onToggle: (value: string) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const chosen = options.filter((o) => o.selected).length

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-full border px-3 py-1.5 text-[12px] transition-colors"
        style={{
          borderColor: chosen ? 'var(--color-accent)' : 'var(--color-hairline)',
          background: chosen ? 'color-mix(in srgb, var(--color-accent) 10%, transparent)' : 'transparent',
          color: chosen ? 'var(--color-accent)' : 'var(--color-ink-soft)',
        }}
      >
        {label}
        {chosen > 0 && <span className="ml-1.5 font-semibold tabular-nums">{chosen}</span>}
        <span className="ml-1.5 opacity-60">{open ? '⌃' : '⌄'}</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 z-30 mt-1 max-h-80 w-72 overflow-y-auto rounded-md border border-hairline bg-white p-1.5 shadow-lg">
          {chosen > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="mb-1 w-full px-2 py-1 text-left text-[11px] text-accent hover:underline"
            >
              Clear {label.toLowerCase()}
            </button>
          )}
          {options.map((o) => (
            <label
              key={o.value}
              className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-black/[0.04] ${
                o.count === 0 && !o.selected ? 'opacity-40' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={o.selected}
                disabled={o.count === 0 && !o.selected}
                onChange={() => onToggle(o.value)}
                className="size-3.5 shrink-0 accent-[var(--color-accent)]"
              />
              {showSwatch && (
                <span
                  aria-hidden
                  className="inline-block size-2.5 shrink-0 rounded-full"
                  style={{ background: stageVar(o.value) }}
                />
              )}
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink" title={o.label}>
                {o.label}
              </span>
              <span className="font-mono text-[11px] tabular-nums text-ink-soft">{o.count}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
