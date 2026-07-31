/**
 * Runtime loading of hiv_dashboard_data.json.
 *
 * The file is fetched from the static folder at runtime, NOT bundled by Vite.
 * That is deliberate: a curator can rebuild the JSON, drop it on the server and
 * see the change on a refresh, with no rebuild of the app.
 *
 * Because the file can be replaced by hand, we assume nothing about it and
 * validate before handing it to the UI. A malformed file must produce a clear
 * message, never a blank screen or a half-rendered chart.
 */
import type { Dataset, Entry, Meta } from '../types'

/** Name of the data file inside the static folder. */
export const DATA_FILE = 'hiv_dashboard_data.json'

/**
 * How a load failed. The UI shows a different message for each, because the
 * fix is different: a missing file is a deployment problem, a malformed file
 * is a build problem.
 */
export type LoadFailureKind = 'network' | 'not-found' | 'malformed' | 'invalid'

export class DataLoadError extends Error {
  readonly kind: LoadFailureKind
  /** Specific problems found, listed for the curator. */
  readonly problems: string[]
  constructor(kind: LoadFailureKind, message: string, problems: string[] = []) {
    super(message)
    this.name = 'DataLoadError'
    this.kind = kind
    this.problems = problems
  }
}

/** Resolve the data file against Vite's base, so a subfolder deployment works. */
function dataUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  const sep = base.endsWith('/') ? '' : '/'
  // Cache-bust so replacing the JSON on the server is visible on a plain
  // refresh, rather than being masked by an HTTP cache.
  return `${base}${sep}${DATA_FILE}?t=${Date.now()}`
}

const REQUIRED_META_KEYS: (keyof Meta)[] = [
  'dosing_axis_order',
  'stage_tiers',
  'palette',
  'route_legend',
]

/**
 * Validate the shape we actually depend on. This is intentionally not a full
 * schema check: it verifies what the dashboard would crash or mislead on, and
 * lets anything else through so the format can grow without breaking the app.
 */
function validate(raw: unknown): Dataset {
  const problems: string[] = []

  if (typeof raw !== 'object' || raw === null) {
    throw new DataLoadError('invalid', 'The data file is not a JSON object.')
  }
  const doc = raw as Record<string, unknown>

  if (!('meta' in doc)) problems.push('The top-level "meta" block is missing.')
  if (!('entries' in doc)) problems.push('The top-level "entries" array is missing.')
  if (problems.length) {
    throw new DataLoadError(
      'invalid',
      'The data file does not have the expected structure.',
      problems,
    )
  }

  const meta = doc.meta as Meta
  if (typeof meta !== 'object' || meta === null) {
    problems.push('"meta" is not an object.')
  } else {
    for (const key of REQUIRED_META_KEYS) {
      if (!(key in meta)) problems.push(`meta.${key} is missing.`)
    }
    if (Array.isArray(meta.dosing_axis_order) && meta.dosing_axis_order.length === 0) {
      problems.push('meta.dosing_axis_order is empty, so the timeline has no axis.')
    }
    if (meta.stage_tiers && Object.keys(meta.stage_tiers).length === 0) {
      problems.push('meta.stage_tiers is empty, so rows have no colour or grouping.')
    }
  }

  const entries = doc.entries
  if (!Array.isArray(entries)) {
    problems.push('"entries" is not an array.')
  } else if (entries.length === 0) {
    problems.push('"entries" is empty. There is nothing to show.')
  }

  if (problems.length) {
    throw new DataLoadError('invalid', 'The data file is missing something essential.', problems)
  }

  // Per-entry checks. A single bad row should not blank the whole dashboard, so
  // these are reported but the rest of the file still renders. Only report the
  // first few, otherwise a systematically broken file produces a wall of text.
  const rowProblems: string[] = []
  const list = entries as Entry[]
  const seen = new Set<string>()
  list.forEach((e, i) => {
    const where = e?.name_full || e?.id || `entry ${i + 1}`
    if (!e || typeof e !== 'object') {
      rowProblems.push(`${where}: not an object.`)
      return
    }
    if (!e.id) rowProblems.push(`${where}: no id.`)
    else if (seen.has(e.id)) rowProblems.push(`${where}: duplicate id "${e.id}".`)
    else seen.add(e.id)
    if (!e.name_full) rowProblems.push(`${where}: no name_full.`)
    if (!e.stage) rowProblems.push(`${where}: no stage.`)
    if (!Array.isArray(e.frequencies)) rowProblems.push(`${where}: frequencies is not an array.`)
    if (!Array.isArray(e.routes)) rowProblems.push(`${where}: routes is not an array.`)
    if (!e.flags) rowProblems.push(`${where}: no flags block.`)
  })

  if (rowProblems.length) {
    throw new DataLoadError(
      'invalid',
      `${rowProblems.length} ${rowProblems.length === 1 ? 'entry has' : 'entries have'} a problem. Rebuild the JSON from hiv_curation.xlsx.`,
      rowProblems.slice(0, 12),
    )
  }

  // Entries whose stage is not in stage_tiers would render colourless. Report
  // rather than fail, and let the timeline fall back to the not-stated colour.
  const unknownStages = [...new Set(list.map((e) => e.stage))].filter(
    (s) => !(s in meta.stage_tiers),
  )
  if (unknownStages.length) {
    throw new DataLoadError(
      'invalid',
      'Some entries use a development stage that meta.stage_tiers does not define.',
      unknownStages.map((s) => `Stage "${s}" has no entry in meta.stage_tiers.`),
    )
  }

  return { meta, entries: list }
}

/**
 * Optional embedded payload, used only by the single-file review build.
 *
 * The normal deployment fetches the JSON at runtime so a curator can replace it
 * on the server. That requires the page to be served over http. For sending a
 * copy to someone who will just double-click it, make_single_file.py inlines
 * the data here instead, and the fetch is skipped entirely.
 */
declare global {
  interface Window {
    __LAPAL_DATA__?: unknown
  }
}

export async function loadDataset(signal?: AbortSignal): Promise<Dataset> {
  if (typeof window !== 'undefined' && window.__LAPAL_DATA__) {
    return validate(window.__LAPAL_DATA__)
  }

  let response: Response
  try {
    response = await fetch(dataUrl(), { cache: 'no-cache', signal })
  } catch (err) {
    if (signal?.aborted) throw err
    throw new DataLoadError(
      'network',
      `Could not reach ${DATA_FILE}. Check that it sits next to index.html on the server.`,
      [err instanceof Error ? err.message : String(err)],
    )
  }

  if (response.status === 404) {
    throw new DataLoadError(
      'not-found',
      `${DATA_FILE} was not found on the server.`,
      [
        'Run: python3 build_data.py hiv_curation.xlsx',
        'Then upload the file alongside index.html.',
      ],
    )
  }
  if (!response.ok) {
    throw new DataLoadError(
      'network',
      `The server returned ${response.status} ${response.statusText} for ${DATA_FILE}.`,
    )
  }

  let raw: unknown
  try {
    raw = await response.json()
  } catch (err) {
    throw new DataLoadError(
      'malformed',
      `${DATA_FILE} is not valid JSON. It may have been edited by hand or uploaded incompletely.`,
      [err instanceof Error ? err.message : String(err)],
    )
  }

  return validate(raw)
}
