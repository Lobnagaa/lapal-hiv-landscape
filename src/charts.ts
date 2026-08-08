/**
 * Aggregation for the count charts, shared by the on-screen version and the
 * exported one.
 *
 * Kept out of the components on purpose. The same numbers are drawn twice, in
 * React and on a canvas, and every time this project has computed the same
 * thing in two places they have drifted. One module, two renderers.
 */
import type { Entry, Meta } from './types'
import { phaseLabel } from './types'

export interface Segment {
  key: string
  /** The entries in this segment, so a hover can list them by name. */
  items: Entry[]
  colour: string
}

export interface Column {
  label: string
  total: number
  items: Entry[]
  segments: Segment[]
}

/**
 * Fold every combination class into one series.
 *
 * Thirteen stacked segments are unreadable, and the combination classes are
 * mostly single entries. Folding keeps the stack at seven.
 */
export function foldClass(meta: Meta, cls: string | null): string {
  if (!cls) return 'Not stated'
  return (meta.class_singles ?? []).includes(cls) ? cls : 'Combination'
}

/** The class series present, in fixed vocabulary order so colours never move. */
export function classSeries(entries: Entry[], meta: Meta): string[] {
  return [...(meta.class_singles ?? []), 'Combination', 'Not stated'].filter((c) =>
    entries.some((e) => foldClass(meta, e.class_group) === c),
  )
}

/** One column per class, stacked by phase. */
export function columnsByClass(entries: Entry[], meta: Meta): Column[] {
  const phases = meta.phase_order ?? []
  return classSeries(entries, meta).map((cls) => {
    const items = entries.filter((e) => foldClass(meta, e.class_group) === cls)
    const segments: Segment[] = []
    for (const ph of phases) {
      const inPh = items.filter((e) => e.highest_phase === ph)
      if (inPh.length)
        segments.push({ key: ph, items: inPh, colour: meta.phase_colours?.[ph] ?? '#CCCCCC' })
    }
    const none = items.filter((e) => !e.highest_phase)
    if (none.length) segments.push({ key: 'Phase not stated', items: none, colour: '#E4E7EB' })
    return { label: cls, total: items.length, items, segments }
  })
}

/** One column per phase, stacked by class. */
export function columnsByPhase(entries: Entry[], meta: Meta): Column[] {
  const phases = meta.phase_order ?? []
  const series = classSeries(entries, meta)
  const cols = [
    ...phases.filter((p) => entries.some((e) => e.highest_phase === p)),
    ...(entries.some((e) => !e.highest_phase) ? ['__none__'] : []),
  ]
  return cols.map((p) => {
    const items = entries.filter((e) =>
      p === '__none__' ? !e.highest_phase : e.highest_phase === p,
    )
    const segments: Segment[] = []
    for (const cls of series) {
      const inCls = items.filter((e) => foldClass(meta, e.class_group) === cls)
      if (inCls.length)
        segments.push({ key: cls, items: inCls, colour: meta.class_colours?.[cls] ?? '#9AA3AE' })
    }
    return {
      label: p === '__none__' ? 'Not stated' : phaseLabel(meta, p, true),
      total: items.length,
      items,
      segments,
    }
  })
}

/** Legend entries for each chart, in the order the segments stack. */
export function phaseLegend(entries: Entry[], meta: Meta) {
  const phases = meta.phase_order ?? []
  return [
    ...phases
      .filter((p) => entries.some((e) => e.highest_phase === p))
      .map((p) => ({ key: phaseLabel(meta, p, true), colour: meta.phase_colours?.[p] ?? '#CCCCCC' })),
    ...(entries.some((e) => !e.highest_phase)
      ? [{ key: 'Not stated', colour: '#E4E7EB' }]
      : []),
  ]
}

export function classLegend(entries: Entry[], meta: Meta) {
  return classSeries(entries, meta).map((c) => ({
    key: c,
    colour: meta.class_colours?.[c] ?? '#9AA3AE',
  }))
}

/** A tidy axis top and step, so gridlines land on whole numbers. */
export function axisScale(max: number): { top: number; step: number } {
  const m = Math.max(1, max)
  const step = m <= 6 ? 1 : m <= 12 ? 2 : 5
  return { top: Math.ceil(m / step) * step, step }
}
