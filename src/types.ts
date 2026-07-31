/**
 * Schema of hiv_dashboard_data.json.
 *
 * ---------------------------------------------------------------------------
 * WHERE THIS COMES FROM
 * ---------------------------------------------------------------------------
 * hiv_curation.xlsx (Entries tab)   <- the source of truth, edited by a curator
 *   |  python build_data.py hiv_curation.xlsx public/hiv_dashboard_data.json
 *   v
 * hiv_dashboard_data.json           <- a BUILD ARTEFACT, fetched at runtime
 *   |  fetch()
 *   v
 * this dashboard
 *
 * Never edit the JSON by hand and never read the xlsx from the browser. The
 * build step is what validates the data, so it must always run first.
 *
 * If you add a field here, add it in build_data.py and in the workbook too, or
 * the round-trip breaks silently on the next rebuild.
 *
 * ---------------------------------------------------------------------------
 * EXTENDING TO ANOTHER THERAPEUTIC AREA
 * ---------------------------------------------------------------------------
 * Nothing in these types is HIV-specific except the vocabularies, and all of
 * those arrive in `meta` at runtime rather than being hard-coded:
 *   - dosing_axis_order   defines the timeline's ordinal axis
 *   - route_legend        defines the route codes and their expansions
 *   - stage_tiers         defines the development stages and their colours
 *   - palette             defines the chrome colours
 * A dataset for a different area needs only a `meta` block of the same shape.
 * The one genuinely HIV-shaped assumption is the treatment/prevention split;
 * see `is_treatment` / `is_prevention` below.
 */

/** Route of administration. Codes are data, not a closed set: see meta.route_legend. */
export type RouteCode = string

/** Dosing interval code, e.g. '1W', '2M', '12M'. Ordered by meta.dosing_axis_order. */
export type FrequencyCode = string

/** Development stage. Keys of meta.stage_tiers; drives row colour and grouping. */
export type StageName = string

/** Which of the two record bands an entry belongs to. */
export type Band = 'formulations' | 'compounds'

/**
 * Data-quality flags, all computed by build_data.py. The dashboard surfaces
 * these rather than hiding them: a flagged entry is never dropped from the view.
 */
export interface EntryFlags {
  /** No dosing interval recorded. The entry goes in the not-stated lane. */
  missing_frequency: boolean
  /** Interval was filled from a linked trial rather than a LAPaL record. */
  frequency_derived_from_trials: boolean
  /** Same condition as above, awaiting curator confirmation. Shown with a dagger. */
  derived_frequency_needs_review: boolean
  /** Approved, but only in a conventional non-long-acting (oral) form. */
  conventional_approval_only: boolean
  /** No clinical trials linked in LAPaL. */
  no_linked_trials: boolean
  /** Marked approved but missing the structured regulatory rows. */
  approved_but_no_regulatory_rows: boolean
}

export interface Entry {
  /** Stable id from the workbook, e.g. 'f001', 'c033'. Unique across the file. */
  id: string
  /** 'formulations' = a discrete long-acting product. 'compounds' = an underlying molecule. */
  band: Band
  /** Display name. */
  name_full: string

  /** Route codes, e.g. ['PO','SC']. May be empty. */
  routes: RouteCode[]
  /** Expanded route names, index-aligned with `routes`. */
  routes_full: string[]

  /** Interval codes, e.g. ['1M','2M','4M']. Empty when missing_frequency is true. */
  frequencies: FrequencyCode[]
  /** Expanded interval names, index-aligned with `frequencies`. */
  frequencies_full: string[]
  /** Where the interval came from: 'LAPaL record' | 'derived from trials' | 'manually confirmed' | 'not stated'. */
  frequency_provenance: string

  /** One of the keys of meta.stage_tiers. */
  stage: StageName
  /** Highest clinical phase on record, or null. Tooltip only. */
  highest_phase: string | null

  /** One or more developers. Feeds the developer filter and the row-end label. */
  developers_full: string[]
  /** Drug class. Tooltip only. */
  drug_class: string | null

  /**
   * Link to this entry on lapal.ch. Clicking the row opens it in a new tab.
   *
   * Validated in build_data.py to be an http or https address. The dashboard
   * checks the scheme again before opening, because the JSON on the server can
   * be replaced by hand and a `javascript:` URL here would otherwise execute in
   * the page.
   */
  lapal_url: string | null

  /**
   * Admin-controlled position in the DEFAULT view, from the `order` column.
   *
   * Null means "no opinion": the entry falls to the end of its group, in the
   * automatic order. How this interacts with the band and stage grouping is
   * decided by meta.default_order_mode.
   *
   * Distinct from anything in viewState.ts: this is the curator setting what
   * everyone sees first, not a reader rearranging their own screen.
   */
  display_order: number | null

  /**
   * Therapeutic area. A plain string in this dataset ('HIV'), not an array,
   * because every row shares one value. This is the natural hook for a
   * multi-area build: widen it to string[] here and in build_data.py together.
   */
  therapeutic_areas: string

  /** The raw workbook value: 'Treatment' | 'Prevention' | 'Both'. */
  use_case_raw: string
  /**
   * An entry can be indicated for both. When it is, it appears ONCE and is
   * tagged 'Both'. Filtering is a union, never a concatenation, so the two
   * indications can be shown together without duplicating rows.
   */
  is_treatment: boolean
  is_prevention: boolean

  flags: EntryFlags
}

/** Colour and definition for one development stage. */
export interface StageTier {
  colour: string
  definition: string
}

export interface Palette {
  /** Header/chrome accent when Treatment is in scope. */
  treatment_accent: string
  /** Header/chrome accent when only Prevention is selected. */
  prevention_accent: string
  ink: string
  ink_soft: string
  hairline: string
  paper: string
  /** Used for data-quality markers. */
  flag: string
}

/** One entry the curator has withheld from the dashboard. */
export interface ExcludedEntry {
  id: string
  name_full: string
  /** Free text from the workbook's exclude_reason column, or null. */
  reason: string | null
}

/**
 * Editorial selection. The dashboard is a curated view, not every HIV record
 * in the source. Excluded entries are absent from `entries` entirely, so they
 * appear in no count and draw no row, but they are named here so the
 * data-quality panel can report that the view is curated and by how much.
 *
 * Optional, so a data file produced before this field existed still loads.
 */
export interface Curation {
  excluded_count: number
  excluded: ExcludedEntry[]
}

/** One acknowledgement group, e.g. "With support from" and its logos. */
export interface AcknowledgementGroup {
  heading: string
  logos: { file: string; alt: string }[]
}

export interface Meta {
  title: string
  /** Standfirst under the title. Optional so older data files still load. */
  intro?: string
  /** Attribution line, rendered in the footer. */
  source: string
  /**
   * Funders and partners, rendered on the page and in every export. Paths are
   * relative to public/logos/. Optional, and a missing file is skipped rather
   * than breaking the render.
   */
  acknowledgements?: AcknowledgementGroup[]
  /** Path to the LAPaL logo, relative to the static folder. */
  brand_logo?: string
  /** Shown beside the logo in exports. */
  brand_url?: string
  /** Human-readable description of each band. */
  record_bands: Record<string, string>
  /** THE ordinal axis, in order, e.g. ['1W','2W','1M','2M','3M','4M','6M','12M']. */
  dosing_axis_order: FrequencyCode[]
  /** Code -> full label, e.g. '2M' -> 'Every 2 months'. */
  dosing_axis_labels: Record<string, string>
  /** Explains the W and M codes and the not-stated lane. Shown in the legend. */
  dosing_axis_note?: string
  /** Code -> full label, e.g. 'SC' -> 'subcutaneous'. */
  route_legend: Record<string, string>
  /** Heading for the route key, e.g. "Investigated and/or approved routes...". */
  route_legend_label?: string
  /**
   * How the default view is ordered.
   *   'grouped' (default) band and stage grouping, `order` decides within a stage.
   *   'manual'  no grouping, one flat list in `order` sequence.
   * Set in build_data.py.
   */
  default_order_mode?: 'grouped' | 'manual'
  /** Stage name -> colour and definition. Also defines the stage sort order. */
  stage_tiers: Record<string, StageTier>
  palette: Palette
  typeface: string
  /** Rendered in the "how to read this" panel. */
  encoding_notes: string[]
  /** Rendered alongside the indication selector. */
  dual_use_note: string
  /** Shown at the foot of the page and on every export. */
  disclaimer?: string
  /** Rendered in the data-quality panel. Computed fresh by each build. */
  known_data_issues: string[]
  /** Editorial selection. Absent in data files built before this was added. */
  curation?: Curation
}

export interface Dataset {
  meta: Meta
  entries: Entry[]
}

/**
 * Order stages are grouped and sorted in. Taken from the ORDER OF KEYS in
 * meta.stage_tiers, so the workbook and build step stay authoritative: to
 * reorder the groups, reorder STAGES in build_data.py.
 */
export function stageOrder(meta: Meta): StageName[] {
  return Object.keys(meta.stage_tiers)
}

/** The indication selector is multi-select; both may be active at once. */
export type Indication = 'Treatment' | 'Prevention'

/** Badge shown on each row, derived from is_treatment / is_prevention. */
export type IndicationBadge = 'Treatment' | 'Prevention' | 'Both'

export function indicationBadge(e: Entry): IndicationBadge {
  if (e.is_treatment && e.is_prevention) return 'Both'
  return e.is_treatment ? 'Treatment' : 'Prevention'
}
