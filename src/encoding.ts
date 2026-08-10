/**
 * THE VISUAL ENCODING, in one place.
 *
 * Everything about how data becomes marks lives here, so the rule can be read
 * without reading the renderer, and changed without hunting through JSX.
 *
 * ---------------------------------------------------------------------------
 * THE ENCODING
 * ---------------------------------------------------------------------------
 * Horizontal position  ordinal dosing interval, in meta.dosing_axis_order.
 *                      NOT to scale: 1W to 2W occupies the same width as 6M to
 *                      12M. The axis is a ranking, not a number line.
 *
 * Filled dot           one per interval the entry is actually recorded at.
 *
 * Connecting bar       drawn from the earliest to the latest recorded interval
 *                      when an entry has more than one. It spans the whole
 *                      range including any interval in between that is NOT
 *                      recorded, so a gap reads as bar-without-dot rather than
 *                      being hidden. Four entries in the HIV dataset are like
 *                      this: Cabotegravir and VH-184 (1M, 2M, 4M, no 3M),
 *                      Islatravir (1W, 1M, 12M) and Dapivirine (1W, 1M).
 *                      The bar is drawn at low opacity so the dots stay primary.
 *
 * Open circle          an entry with no recorded interval, placed in a separate
 *                      not-stated lane to the right of the axis, past a gap and
 *                      a divider so it does not read as "longer than yearly".
 *                      These entries are never dropped from the view.
 *
 * Colour               development stage, always, via meta.stage_tiers. Colour
 *                      never encodes indication; the chrome accent does that.
 *
 * Flag dot             a small mark in meta.palette.flag at the row's left edge
 *                      when any data-quality flag is active.
 *
 * Dagger               appended to the name when the interval was derived from
 *                      trials and still needs curator confirmation.
 */
import type { Entry, Meta, StageName } from './types'
import { stageVar } from './theme'

/* ------------------------------------------------------------------ layout */

/**
 * Height of one entry row, in px. Tall enough for a long product name to wrap
 * to two lines, so nothing is truncated on a projected screen.
 */
export const ROW_H = 44
/** Radius of an interval dot. */
export const DOT_R = 4.5
/** Thickness of the connecting bar. */
export const BAR_H = 3
/** Opacity of the connecting bar, so dots read as the primary mark. */
export const BAR_OPACITY = 0.32
/** Width reserved at the right of the plot for the not-stated lane. */
export const NOT_STATED_W = 64
/** Gap between the end of the ordinal axis and the not-stated lane. */
export const LANE_GAP = 22
/** Height of the sticky axis header, in px. Stage headers stick below it. */
export const AXIS_H = 46

export interface AxisGeometry {
  /** Total plot width in px, including the not-stated lane. */
  width: number
  /** Width of the ordinal part alone. */
  axisWidth: number
  /** Centre x of the interval column at index i. */
  centre: (i: number) => number
  /** Centre x of the not-stated lane. */
  notStatedCentre: number
  /** x of the divider between the axis and the not-stated lane. */
  dividerX: number
}

/**
 * Column centres are evenly spaced across the ordinal part. Half a column of
 * padding at each end keeps the first and last dots off the edges.
 */
export function axisGeometry(width: number, laneCount: number): AxisGeometry {
  const axisWidth = Math.max(0, width - LANE_GAP - NOT_STATED_W)
  const step = laneCount > 0 ? axisWidth / laneCount : 0
  return {
    width,
    axisWidth,
    centre: (i: number) => step * (i + 0.5),
    notStatedCentre: axisWidth + LANE_GAP + NOT_STATED_W / 2,
    dividerX: axisWidth + LANE_GAP / 2,
  }
}

/* -------------------------------------------------------------------- marks */

export interface RowMarks {
  /** Colour for every mark on this row: the entry's development stage. */
  colour: string
  /** Axis indices to draw a filled dot at, ascending. */
  dotIndices: number[]
  /** Axis index range to draw the connecting bar across, or null. */
  span: { from: number; to: number } | null
  /** True when the entry belongs in the not-stated lane. */
  notStated: boolean
  /** True when the span crosses an interval that is not recorded. */
  hasGap: boolean
}

/**
 * Turn one entry into its marks. Unknown interval codes are ignored rather
 * than throwing: a newer data file may add a code this build does not know,
 * and the rest of the row should still render.
 */
export function rowMarks(entry: Entry, meta: Meta): RowMarks {
  const order = meta.dosing_axis_order
  const dotIndices = entry.frequencies
    .map((f) => order.indexOf(f))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)

  const first = dotIndices[0]
  const last = dotIndices[dotIndices.length - 1]
  const span =
    dotIndices.length > 1 && first !== undefined && last !== undefined
      ? { from: first, to: last }
      : null

  const hasGap = span !== null && span.to - span.from + 1 !== dotIndices.length

  return {
    colour: stageVar(entry.stage),
    dotIndices,
    span,
    // Trust the flag from the build step, and fall back to the marks so a row
    // is never left with nothing drawn on it.
    notStated: entry.flags.missing_frequency || dotIndices.length === 0,
    hasGap,
  }
}

/* ------------------------------------------------- summary-panel vocabulary */

/**
 * ASSUMPTION, stated explicitly because it is not in the data file: these route
 * codes count as "injectable" in the at-a-glance summary. meta.route_legend
 * expands them as subcutaneous, intramuscular and intravenous; it does not
 * classify them, so this grouping is ours. Change it here if a future dataset
 * adds another parenteral route.
 */
export const INJECTABLE_ROUTES = new Set(['SC', 'IM', 'IV'])

/** The oral route code, counted separately in the summary. */
export const ORAL_ROUTE = 'PO'

/**
 * ASSUMPTION: "dosed six-monthly or less often" means an interval at or beyond
 * this position on the ordinal axis. Expressed as a code rather than an index
 * so it survives a change to meta.dosing_axis_order.
 */
export const LONG_INTERVAL_FROM = '6M'

/** Data-quality flags that are currently active on an entry, as readable labels. */
export const FLAG_LABELS: Record<string, string> = {
  missing_frequency: 'No dosing interval recorded',
  frequency_derived_from_trials: 'Interval derived from linked trials',
  derived_frequency_needs_review: 'Derived interval awaiting curator confirmation',
  conventional_approval_only: 'Approved only in a conventional, non-long-acting form',
  no_linked_trials: 'No clinical trials linked in LAPaL',
  approved_but_no_regulatory_rows: 'Approved but missing structured regulatory rows',
}

export function activeFlags(entry: Entry): string[] {
  return Object.entries(entry.flags)
    .filter(([, on]) => on)
    .map(([key]) => key)
}

export function isFlagged(entry: Entry): boolean {
  return activeFlags(entry).length > 0
}

/** The dagger is reserved for the one flag that asks the curator to act. */
export function needsDagger(entry: Entry): boolean {
  return entry.flags.derived_frequency_needs_review
}

/* ------------------------------------------------------- grouping & sorting */

export interface StageGroup {
  stage: StageName
  entries: Entry[]
}

export interface BandGroup {
  band: string
  /** Human label from meta.record_bands. */
  label: string
  groups: StageGroup[]
  /** Total entries in this band, after filtering. */
  count: number
}

/**
 * Within a stage, rows are ordered by their earliest recorded interval, then by
 * span, then by name. That makes the timeline cascade from short to long
 * intervals inside each colour block, which is the comparison the view exists
 * to support. Not-stated rows sort to the end of their stage.
 */
function compareWithinStage(a: Entry, b: Entry, meta: Meta): number {
  // The curator's `order` column wins wherever it is set. Rows without a number
  // keep the automatic order and fall in behind the ones that have one, so a
  // partial ordering is useful on its own: number the few that matter and leave
  // the rest alone.
  const oa = a.display_order
  const ob = b.display_order
  if (oa !== null && ob !== null && oa !== ob) return oa - ob
  if (oa !== null && ob === null) return -1
  if (oa === null && ob !== null) return 1

  const ma = rowMarks(a, meta)
  const mb = rowMarks(b, meta)
  const ka = ma.notStated ? Number.MAX_SAFE_INTEGER : (ma.dotIndices[0] ?? 0)
  const kb = mb.notStated ? Number.MAX_SAFE_INTEGER : (mb.dotIndices[0] ?? 0)
  if (ka !== kb) return ka - kb

  const la = ma.span ? ma.span.to : (ma.dotIndices[0] ?? 0)
  const lb = mb.span ? mb.span.to : (mb.dotIndices[0] ?? 0)
  if (la !== lb) return la - lb

  return a.name_full.localeCompare(b.name_full, 'en-GB')
}

/**
 * Order every entry by its dosing interval alone, ignoring band, stage and
 * everything else. This is the reading a reader wants when they ask "what is
 * dosed every twelve months, no matter what it is or how far along it is":
 * the stage-grouped default deliberately buries that comparison inside each
 * colour block, and this flattens it back out.
 *
 * ASSUMPTION, stated because the data does not resolve it: when an entry has
 * more than one interval on record, its LONGEST one decides its position. A
 * reader sorting this way is asking "how infrequently can this be dosed", and
 * the longest interval is the honest answer to that; the shortest one is
 * already visible on the entry's own row regardless of where the row sits.
 * Not-stated entries sort last, as they do everywhere else in this file.
 *
 * Used both to build the default view (meta.default_timeline_order ===
 * 'interval') and by the reader's own "Order by dosing interval" control.
 */
export function sortEntriesByInterval(entries: Entry[], meta: Meta): Entry[] {
  return [...entries].sort((a, b) => {
    const ma = rowMarks(a, meta)
    const mb = rowMarks(b, meta)
    const ka = ma.notStated ? -1 : (ma.dotIndices[ma.dotIndices.length - 1] ?? -1)
    const kb = mb.notStated ? -1 : (mb.dotIndices[mb.dotIndices.length - 1] ?? -1)
    if (ka !== kb) return kb - ka
    return a.name_full.localeCompare(b.name_full, 'en-GB')
  })
}

/** As above, but ids, ready for setOrder, exactly like the agents table's own sort. */
export function sortByInterval(entries: Entry[], meta: Meta): string[] {
  return sortEntriesByInterval(entries, meta).map((e) => e.id)
}

/**
 * Order the entries as one flat list, for meta.default_order_mode === 'manual'.
 *
 * Band and stage grouping is switched off entirely and the curator's `order`
 * column decides. Rows without a number go last, alphabetically, so a new entry
 * appears predictably at the end rather than in an arbitrary place.
 */
export function sortByAdminOrder(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => {
    const oa = a.display_order
    const ob = b.display_order
    if (oa !== null && ob !== null && oa !== ob) return oa - ob
    if (oa !== null && ob === null) return -1
    if (oa === null && ob !== null) return 1
    return a.name_full.localeCompare(b.name_full, 'en-GB')
  })
}

/**
 * Band is the outer grouping, development stage the inner one. Both orders come
 * from meta (record_bands and stage_tiers key order), so the workbook and build
 * step stay authoritative. Empty groups are dropped so filtering does not leave
 * orphaned headings.
 */
export function groupEntries(entries: Entry[], meta: Meta): BandGroup[] {
  const bandOrder = Object.keys(meta.record_bands)
  const stages = Object.keys(meta.stage_tiers)

  return bandOrder
    .map((band) => {
      const inBand = entries.filter((e) => e.band === band)
      const groups = stages
        .map((stage) => ({
          stage,
          entries: inBand
            .filter((e) => e.stage === stage)
            .sort((a, b) => compareWithinStage(a, b, meta)),
        }))
        .filter((g) => g.entries.length > 0)
      return {
        band,
        label: meta.record_bands[band] ?? band,
        groups,
        count: inBand.length,
      }
    })
    .filter((b) => b.count > 0)
}
