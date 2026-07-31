/**
 * What the user sees while the data loads, and when it fails to.
 *
 * The failure screen is written for a curator, not a developer: it names the
 * file, says what is wrong with it, and gives the command that regenerates it.
 */
import { DataLoadError, DATA_FILE } from '../data/load'

export function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <p className="text-sm tracking-wide text-ink-soft">Loading the dataset</p>
    </div>
  )
}

const REMEDY: Record<string, string> = {
  'not-found': 'The file is not on the server yet.',
  network: 'The file could not be fetched.',
  malformed: 'The file is not readable as JSON.',
  invalid: 'The file loaded, but does not contain what the dashboard needs.',
}

export function ErrorScreen({ error }: { error: Error }) {
  const isDataError = error instanceof DataLoadError
  const kind = isDataError ? error.kind : 'network'
  const problems = isDataError ? error.problems : []

  return (
    <div className="flex min-h-screen items-start justify-center px-6 py-24">
      <div className="w-full max-w-2xl">
        <p className="mb-3 text-xs font-semibold tracking-[0.14em] text-flag uppercase">
          Data not loaded
        </p>
        <h1 className="mb-4 text-2xl leading-snug font-semibold text-ink">
          {REMEDY[kind] ?? 'The dataset could not be loaded.'}
        </h1>
        <p className="mb-6 text-[15px] leading-relaxed text-ink-soft">{error.message}</p>

        {problems.length > 0 && (
          <ul className="mb-8 space-y-1.5 border-l-2 border-hairline pl-4">
            {problems.map((p, i) => (
              <li key={i} className="text-sm leading-relaxed text-ink-soft">
                {p}
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-hairline pt-6">
          <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-ink-soft uppercase">
            How to fix it
          </p>
          <p className="mb-3 text-sm leading-relaxed text-ink-soft">
            {DATA_FILE} is generated from the curation workbook. Rebuild it, then put it next
            to index.html on the server and refresh this page.
          </p>
          <code className="block overflow-x-auto rounded border border-hairline bg-white px-3 py-2 font-mono text-[13px] text-ink">
            python3 build_data.py hiv_curation.xlsx
          </code>
        </div>
      </div>
    </div>
  )
}
