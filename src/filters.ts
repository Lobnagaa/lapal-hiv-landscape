/**
 * Filter state, the filter predicate, facet counts and the live summary.
 *
 * All pure functions over (entries, state, meta), with no React in sight, so
 * the behaviour can be reasoned about and tested independently of the UI.
 *
 * ---------------------------------------------------------------------------
 * THE RULES
 * ---------------------------------------------------------------------------
 * Indication  an entry is in scope when (Treatment selected AND is_treatment)
 *             OR (Prevention selected AND is_prevention). This is a UNION over
 *             the selection, so an entry indicated for both is matched once and
 *             appears once, tagged Both. It is never counted or drawn twice.
 *
 * Every other facet  an EMPTY selection means "no constraint", not "nothing".
 *                    A non-empty selection matches an entry that has ANY of the
 *                    selected values (OR within a facet). Facets combine with
 *                    AND between them.
 *
 * Bands       unlike the other facets, both bands start ON and the toggles turn
 *             them off, because the bands are a view structure rather than a
 *             filter over a long tail of values.
 *
 * Status      the same two-way toggle shape as bands: Active and On hold /
 *             discontinued both start ON, and turning one off hides those
 *             entries. Kept apart from the phase filter on purpose, because
 *             on_hold is independent of highest_phase: a Phase III programme
 *             can be on hold.
 */
import type { Entry, Indication, Meta } from './types'
import { LONG_INTERVAL_FROM, INJECTABLE_ROUTES, ORAL_ROUTE } from './encoding'

/**
 * Sentinel used in the dosing-interval facet to mean "no interval recorded".
 * It lets the not-stated lane be filtered like any other axis position, which
 * is the point of giving those entries a lane instead of dropping them.
 */
export const NOT_STATED = '__not_stated__'

/** Whether an entry is still being pursued. Derived from Entry.on_hold. */
export type StatusKey = 'active' | 'on_hold'

export const STATUS_KEYS: StatusKey[] = ['active', 'on_hold']

export function statusOf(e: Entry): StatusKey {
  return e.on_hold ? 'on_hold' : 'active'
}

export interface FilterState {
  indications: Set<Indication>
  bands: Set<string>
  /** Both start ON; see the Status note above. */
  statuses: Set<StatusKey>
  stages: Set<string>
  routes: Set<string>
  /** Interval codes, plus possibly NOT_STATED. */
  frequencies: Set<string>
  developers: Set<string>
  search: string
}

/** Facets that are plain "empty means all" multi-selects. */
export type FacetKey = 'stages' | 'routes' | 'frequencies' | 'developers'

export function defaultFilters(meta: Meta): FilterState {
  return {
    indications: new Set<Indication>(['Treatment', 'Prevention']),
    bands: new Set(Object.keys(meta.record_bands)),
    statuses: new Set<StatusKey>(STATUS_KEYS),
    stages: new Set(),
    routes: new Set(),
    frequencies: new Set(),
    developers: new Set(),
    search: '',
  }
}

export function isDefault(s: FilterState, meta: Meta): boolean {
  return (
    s.indications.size === 2 &&
    s.bands.size === Object.keys(meta.record_bands).length &&
    s.statuses.size === STATUS_KEYS.length &&
    s.stages.size === 0 &&
    s.routes.size === 0 &&
    s.frequencies.size === 0 &&
    s.developers.size === 0 &&
    s.search.trim() === ''
  )
}

/** Number of active narrowing choices, for the "clear all" affordance. */
export function activeCount(s: FilterState, meta: Meta): number {
  return (
    (s.indications.size < 2 ? 1 : 0) +
    (s.bands.size < Object.keys(meta.record_bands).length ? 1 : 0) +
    (s.statuses.size < STATUS_KEYS.length ? 1 : 0) +
    s.stages.size +
    s.routes.size +
    s.frequencies.size +
    s.developers.size +
    (s.search.trim() ? 1 : 0)
  )
}

/* ---------------------------------------------------------------- predicate */

type Dimension = 'indications' | 'bands' | 'statuses' | FacetKey | 'search'

function matchesDimension(e: Entry, s: FilterState, dim: Dimension): boolean {
  switch (dim) {
    case 'indications':
      return (
        (s.indications.has('Treatment') && e.is_treatment) ||
        (s.indications.has('Prevention') && e.is_prevention)
      )
    case 'bands':
      return s.bands.has(e.band)
    case 'statuses':
      return s.statuses.has(statusOf(e))
    case 'stages':
      return s.stages.size === 0 || s.stages.has(e.stage)
    case 'routes':
      return s.routes.size === 0 || e.routes.some((r) => s.routes.has(r))
    case 'frequencies': {
      if (s.frequencies.size === 0) return true
      if (s.frequencies.has(NOT_STATED) && e.flags.missing_frequency) return true
      return e.frequencies.some((f) => s.frequencies.has(f))
    }
    case 'developers':
      return s.developers.size === 0 || e.developers_full.some((d) => s.developers.has(d))
    case 'search': {
      const q = s.search.trim().toLowerCase()
      if (!q) return true
      return (
        e.name_full.toLowerCase().includes(q) ||
        e.developers_full.some((d) => d.toLowerCase().includes(q))
      )
    }
  }
}

const ALL_DIMENSIONS: Dimension[] = [
  'indications',
  'bands',
  'statuses',
  'stages',
  'routes',
  'frequencies',
  'developers',
  'search',
]

/**
 * Apply the filters. `except` omits one dimension, which is what facet counts
 * need: the options offered for Route are counted against everything EXCEPT the
 * current route selection, so selecting one route does not collapse the other
 * route options to zero.
 */
export function applyFilters(entries: Entry[], s: FilterState, except?: Dimension): Entry[] {
  const dims = except ? ALL_DIMENSIONS.filter((d) => d !== except) : ALL_DIMENSIONS
  return entries.filter((e) => dims.every((d) => matchesDimension(e, s, d)))
}

/* -------------------------------------------------------------------- facets */

export interface FacetOption {
  value: string
  label: string
  count: number
  selected: boolean
}

export function facetOptions(
  entries: Entry[],
  s: FilterState,
  meta: Meta,
  facet: FacetKey,
): FacetOption[] {
  const pool = applyFilters(entries, s, facet)
  const tally = (values: (e: Entry) => string[], order?: string[], label?: (v: string) => string) => {
    const counts = new Map<string, number>()
    for (const e of pool) for (const v of new Set(values(e))) counts.set(v, (counts.get(v) ?? 0) + 1)
    // Keep every value that exists anywhere in the dataset, so an option never
    // vanishes mid-interaction; a zero count is shown and disabled instead.
    const universe = order ?? [...new Set(entries.flatMap(values))].sort((a, b) => a.localeCompare(b, 'en-GB'))
    return universe.map((v) => ({
      value: v,
      label: label ? label(v) : v,
      count: counts.get(v) ?? 0,
      selected: s[facet].has(v),
    }))
  }

  switch (facet) {
    case 'stages':
      return tally((e) => [e.stage], Object.keys(meta.stage_tiers))
    case 'routes':
      return tally(
        (e) => e.routes,
        Object.keys(meta.route_legend),
        (v) => `${v} · ${meta.route_legend[v] ?? ''}`,
      )
    case 'frequencies': {
      const opts = tally(
        (e) => e.frequencies,
        meta.dosing_axis_order,
        (v) => `${v} · ${meta.dosing_axis_labels[v] ?? ''}`,
      )
      return [
        ...opts,
        {
          value: NOT_STATED,
          label: 'not stated',
          count: pool.filter((e) => e.flags.missing_frequency).length,
          selected: s.frequencies.has(NOT_STATED),
        },
      ]
    }
    case 'developers':
      return tally((e) => e.developers_full)
  }
}

/* ------------------------------------------------------------------ summary */

export interface Summary {
  total: number
  approved: number
  injectable: number
  oral: number
  longInterval: number
  developers: number
}

/**
 * Recomputed from the currently filtered set on every change, including the
 * indication selection. Entries are counted once each; an entry indicated for
 * both treatment and prevention contributes one to `total`, never two.
 */
export type SummaryKey = keyof Summary

/**
 * Each summary tile is also a shortcut to the filter that produces its count.
 *
 * The definitions here MUST agree with summarise() below, or a tile would show
 * one number and filter to a different set. Both are driven by the same
 * constants (INJECTABLE_ROUTES, ORAL_ROUTE, LONG_INTERVAL_FROM) and by
 * meta.dosing_axis_order, so they cannot drift apart.
 *
 * Returns null for tiles that do not correspond to a subset of entries:
 * "In view" is already everything, and "Developers" counts organisations
 * rather than rows, so there is no set of entries it could select.
 */
export function summaryFilter(
  key: SummaryKey,
  meta: Meta,
): { apply: (s: FilterState) => FilterState; isActive: (s: FilterState) => boolean } | null {
  const longFrom = meta.dosing_axis_order.indexOf(LONG_INTERVAL_FROM)
  const longCodes = longFrom < 0 ? [] : meta.dosing_axis_order.slice(longFrom)
  const injectable = Object.keys(meta.route_legend).filter((r) => INJECTABLE_ROUTES.has(r))

  const sameSet = (a: Set<string>, b: string[]) =>
    a.size === b.length && b.every((v) => a.has(v))

  switch (key) {
    case 'approved':
      return {
        apply: (s) => ({ ...s, stages: new Set(['Approved']) }),
        isActive: (s) => sameSet(s.stages, ['Approved']),
      }
    case 'injectable':
      return {
        apply: (s) => ({ ...s, routes: new Set(injectable) }),
        isActive: (s) => sameSet(s.routes, injectable),
      }
    case 'oral':
      return {
        apply: (s) => ({ ...s, routes: new Set([ORAL_ROUTE]) }),
        isActive: (s) => sameSet(s.routes, [ORAL_ROUTE]),
      }
    case 'longInterval':
      return {
        apply: (s) => ({ ...s, frequencies: new Set(longCodes) }),
        isActive: (s) => sameSet(s.frequencies, longCodes),
      }
    case 'total':
    case 'developers':
      return null
  }
}

/** Clicking an active tile clears its facet rather than reapplying it. */
export function clearSummaryFilter(key: SummaryKey, s: FilterState): FilterState {
  switch (key) {
    case 'approved':
      return { ...s, stages: new Set() }
    case 'injectable':
    case 'oral':
      return { ...s, routes: new Set() }
    case 'longInterval':
      return { ...s, frequencies: new Set() }
    default:
      return s
  }
}

export function summarise(entries: Entry[], meta: Meta): Summary {
  const longFrom = meta.dosing_axis_order.indexOf(LONG_INTERVAL_FROM)
  const isLong = (e: Entry) =>
    longFrom >= 0 &&
    e.frequencies.some((f) => {
      const i = meta.dosing_axis_order.indexOf(f)
      return i >= 0 && i >= longFrom
    })

  return {
    total: entries.length,
    approved: entries.filter((e) => e.stage === 'Approved').length,
    injectable: entries.filter((e) => e.routes.some((r) => INJECTABLE_ROUTES.has(r))).length,
    oral: entries.filter((e) => e.routes.includes(ORAL_ROUTE)).length,
    longInterval: entries.filter(isLong).length,
    developers: new Set(entries.flatMap((e) => e.developers_full)).size,
  }
}
