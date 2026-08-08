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
  /** Drug class as free text, exactly as curated. Tooltip only. */
  drug_class: string | null

  /**
   * Tidy class from the controlled vocabulary, driving the class-by-phase grid.
   *
   * Distinct from drug_class, which is free text and was written thirty
   * different ways across forty-three entries. Combinations are their own
   * value ("Capsid inhibitor + INSTI"), so every entry is counted exactly
   * once and the grid totals match the entry count.
   */
  class_group: string | null

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
   * Route code -> tint colour for the chips. Optional: without it the chips
   * render in the neutral hairline style. Colour is redundant here, the code is
   * always printed, so a missing entry degrades rather than loses information.
   */
  route_colours?: Record<string, string>
  /** Wash colour for the compound / formulation tag, keyed by band. */
  band_colours?: Record<string, string>
  /** Clinical phases in order, least to most advanced. */
  phase_order?: string[]
  /**
   * Display overrides for phase values, e.g. Phase IV shown as "Marketed".
   * The stored value is unchanged; this only affects what a reader sees.
   */
  phase_labels?: Record<string, string>
  /** Row order for the class grid: single classes by frequency, then combinations. */
  class_order?: string[]
  /** The full controlled vocabulary, whether or not each value is in use. */
  class_vocabulary?: string[]
  /** Single (non-combination) classes, used to fold combinations in the charts. */
  class_singles?: string[]
  /**
   * Categorical colour per class for the count charts. Combination products
   * share a single "Combination" series. Keyed by a fixed vocabulary, never by
   * rank, so filtering never repaints the series that survive.
   */
  class_colours?: Record<string, string>
  /**
   * Phase -> chip tint. A single-hue ramp, light to dark, so a darker chip
   * reads as further along. Chip text is always ink, so a missing entry
   * degrades to a plain chip rather than losing the label.
   */
  phase_colours?: Record<string, string>
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

/**
 * How a phase should be shown.
 *
 * meta.phase_labels wins where it has an entry, so "Phase IV" can read as
 * "Marketed" without re-curating the workbook. `short` abbreviates the
 * remainder for tight spaces ("Phase III" -> "Ph III"), but never touches an
 * explicit override, which is already the wording the reader should see.
 */
export function phaseLabel(meta: Meta, phase: string, short = false): string {
  const override = meta.phase_labels?.[phase]
  if (override) return override
  return short ? phase.replace(/^Phase\s+/i, 'Ph ') : phase
}

/**
 * Short tag for the record band.
 *
 * Used by the agents table and the class grid, where the marks already encode
 * phase. Colouring those by development stage would be restating the same
 * thing, since stage is derived from phase; what the reader cannot otherwise
 * tell is whether a row is a finished formulation or the underlying molecule.
 */
export function bandTag(band: Band): { letter: string; label: string } {
  return band === 'compounds'
    ? { letter: 'C', label: 'Compound' }
    : { letter: 'F/R', label: 'Formulation or regimen' }
}
