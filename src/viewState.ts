/**
 * The reader's own arrangement of the view: their ordering and what they have
 * hidden.
 *
 * ---------------------------------------------------------------------------
 * THIS IS NOT CURATION
 * ---------------------------------------------------------------------------
 * Two different things can remove an entry from the timeline, and they must not
 * be confused:
 *
 *   meta.curation  the CURATOR withheld it, in hiv_curation.xlsx. It is absent
 *                  from the data file entirely and no reader can bring it back.
 *
 *   this module    a READER hid it, here, now, in their browser. It affects
 *                  nothing but their screen and their export, and survives
 *                  nothing: a refresh restores the default view.
 *
 * Keeping reader state out of the data file is deliberate. An arrangement made
 * for one figure must never leak into what the next person sees.
 */
import type { Entry } from './types'

export interface ViewState {
  /**
   * Entry ids in the reader's chosen order. Empty until they drag something,
   * which is what distinguishes the default grouped view from a custom one.
   */
  order: string[]
  /** Entry ids the reader has hidden. */
  hidden: Set<string>
  /**
   * Class names in the reader's chosen row order, for the class grid.
   *
   * Separate from `order` because the grid arranges CLASSES, not entries: a
   * chip's position inside the grid is decided by its class and phase, so there
   * is nothing an entry-level order could move. Empty until they drag a row.
   */
  classOrder: string[]
}

export function defaultView(): ViewState {
  return { order: [], hidden: new Set(), classOrder: [] }
}

/** True once the reader has taken control of the ordering. */
export function isCustomOrder(v: ViewState): boolean {
  return v.order.length > 0
}

export function isArranged(v: ViewState): boolean {
  return isCustomOrder(v) || v.hidden.size > 0 || v.classOrder.length > 0
}

/** Put the class grid's rows in the order given, which is the order it drew. */
export function setClassOrder(v: ViewState, classes: string[]): ViewState {
  return { ...v, classOrder: classes }
}

/** Apply that order to the classes actually present, unknown ones last. */
export function arrangeClasses(classes: string[], v: ViewState): string[] {
  if (v.classOrder.length === 0) return classes
  const rank = new Map(v.classOrder.map((c, i) => [c, i]))
  const known = classes.filter((c) => rank.has(c))
  const rest = classes.filter((c) => !rank.has(c))
  known.sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0))
  return [...known, ...rest]
}

/** Hide several entries at once, which is what hiding a whole class row means. */
export function hideMany(v: ViewState, ids: string[]): ViewState {
  const hidden = new Set(v.hidden)
  for (const id of ids) hidden.add(id)
  return { ...v, hidden }
}

/**
 * Apply the reader's arrangement to an already-filtered list.
 *
 * Ordering is stored as a list of ids rather than indices so it survives
 * filtering: entries the reader has never seen simply fall to the end in their
 * original order, and ids that no longer exist are ignored rather than leaving
 * a hole.
 */
export function arrange(entries: Entry[], v: ViewState): Entry[] {
  const visible = entries.filter((e) => !v.hidden.has(e.id))
  if (!isCustomOrder(v)) return visible

  const rank = new Map(v.order.map((id, i) => [id, i]))
  const known = visible.filter((e) => rank.has(e.id))
  const rest = visible.filter((e) => !rank.has(e.id))
  known.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
  return [...known, ...rest]
}

/**
 * Move one entry to a new position.
 *
 * `displayed` MUST be the list exactly as rendered, in render order. That is
 * not the same as `arrange(filtered, view)` before the first drag: in the
 * default view the rows are grouped by band and stage, so the on-screen order
 * differs from the data order. Seeding from the wrong baseline scrambles the
 * list on the very first move, which is what happened before this took the
 * rendered list as its argument.
 */
export function moveEntry(
  displayed: Entry[],
  v: ViewState,
  fromId: string,
  toIndex: number,
): ViewState {
  const ids = displayed.map((e) => e.id)
  const from = ids.indexOf(fromId)
  if (from < 0) return v

  const next = [...ids]
  next.splice(from, 1)
  // A drop index is measured against the list BEFORE removal, so shift it down
  // when the row is moving forwards. Clamp too: a drop past the last row is common.
  const adjusted = toIndex > from ? toIndex - 1 : toIndex
  next.splice(Math.max(0, Math.min(next.length, adjusted)), 0, fromId)
  return { ...v, order: next }
}

/** Move an entry by one position, for the keyboard controls. */
export function nudge(displayed: Entry[], v: ViewState, id: string, delta: -1 | 1): ViewState {
  const ids = displayed.map((e) => e.id)
  const i = ids.indexOf(id)
  if (i < 0) return v
  const target = i + delta
  if (target < 0 || target >= ids.length) return v
  // Express as a raw swap rather than routing through moveEntry, whose index
  // is a drop position rather than a final position.
  const next = [...ids]
  const [moved] = next.splice(i, 1)
  if (moved) next.splice(target, 0, moved)
  return { ...v, order: next }
}

/**
 * Replace the order outright with a list of ids.
 *
 * A view that renders its own arrangement (the agents table sorts itself) must
 * compute the move against the rows IT drew and hand the result over. Passing
 * an index computed against some other list is how the reorder silently moved
 * the wrong row twice in this project.
 */
export function setOrder(v: ViewState, ids: string[]): ViewState {
  return { ...v, order: ids }
}

export function toggleHidden(v: ViewState, id: string): ViewState {
  const hidden = new Set(v.hidden)
  if (hidden.has(id)) hidden.delete(id)
  else hidden.add(id)
  return { ...v, hidden }
}

export function showAll(v: ViewState): ViewState {
  return { ...v, hidden: new Set() }
}

export function resetOrder(v: ViewState): ViewState {
  return { ...v, order: [], classOrder: [] }
}
