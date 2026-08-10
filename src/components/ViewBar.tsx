/**
 * The reader's controls over their own view: what they have rearranged, what
 * they have hidden, and the export menu.
 *
 * Deliberately separate from the filter bar. Filters ask "which entries am I
 * interested in"; this asks "how do I want to present them".
 */
import { useEffect, useRef, useState } from 'react'
import type { Entry, Meta } from '../types'
import type { ViewState } from '../viewState'
import { isCustomOrder } from '../viewState'
import {
  downloadFigurePng,
  downloadPdf,
  downloadSlidePngs,
  slideCount,
  type ExportOptions,
} from '../export/renderPng'

export function ViewBar({
  view,
  entries,
  allEntries,
  meta,
  indicationLabel,
  accent,
  onResetOrder,
  onShowAll,
  onUnhide,
  mode = 'timeline',
}: {
  view: ViewState
  /** The arranged, visible entries: exactly what an export contains. */
  entries: Entry[]
  /** Everything that passes the filters, hidden rows included, so they can be named. */
  allEntries: Entry[]
  meta: Meta
  indicationLabel: string
  accent: string
  onResetOrder: () => void
  onShowAll: () => void
  onUnhide: (id: string) => void
  /** Which view is on screen; changes the hint and whether export is offered. */
  mode?: 'timeline' | 'agents' | 'grid' | 'charts'
}) {
  const [listOpen, setListOpen] = useState(false)
  const custom = isCustomOrder(view)
  // The grid rearranges classes rather than entries, so the reset control has to
  // watch both or a moved class row cannot be put back.
  const reordered = custom || view.classOrder.length > 0
  const hidden = view.hidden.size
  const hiddenEntries = allEntries.filter((e) => view.hidden.has(e.id))

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-hairline py-3">
      <p className="text-[12px] text-ink-soft">
        {custom ? (
          <>
            <span className="font-semibold text-ink">Custom order.</span> Grouping by stage is off;
            the coloured dot beside each name shows its stage.
          </>
        ) : mode === 'grid' ? (
          <>
            Drag a class by the grip at its left to move the row, or use the eye icon to hide the
            whole class. Chips have their own eye icon, and clicking one opens its LAPaL entry.
          </>
        ) : (
          <>
            Drag a row by the grip at its left to rearrange it, or use the eye icon to hide it.
            Clicking a row opens its LAPaL entry.
          </>
        )}
        {hidden > 0 && (
          <>
            {' '}
            {hidden} {hidden === 1 ? 'row is' : 'rows are'} hidden.
          </>
        )}
      </p>

      {reordered && (
        <button
          type="button"
          onClick={onResetOrder}
          className="text-[12px] text-accent underline underline-offset-4 hover:opacity-70"
        >
          Reset order
        </button>
      )}
      {hidden > 0 && (
        <>
          <button
            type="button"
            aria-expanded={listOpen}
            onClick={() => setListOpen((o) => !o)}
            className="text-[12px] text-accent underline underline-offset-4 hover:opacity-70"
          >
            {listOpen ? 'Hide the list' : `Which ${hidden} are hidden?`}
          </button>
          <button
            type="button"
            onClick={onShowAll}
            className="text-[12px] text-accent underline underline-offset-4 hover:opacity-70"
          >
            Show all {hidden}
          </button>
        </>
      )}

      <span className="flex-1" />

      <ExportMenu
        options={{
          entries,
          meta,
          view: mode === 'charts' ? 'charts' : mode,
          indicationLabel,
          accent,
          arranged: reordered,
          classOrder: view.classOrder,
          hiddenCount: hidden,
        }}
      />

      {listOpen && hiddenEntries.length > 0 && (
        <ul className="w-full space-y-1 border-l-2 border-hairline pt-1 pl-4">
          {hiddenEntries.map((e) => (
            <li key={e.id} className="flex items-baseline gap-3">
              <span className="text-[13px] text-ink-soft">{e.name_full}</span>
              <button
                type="button"
                onClick={() => onUnhide(e.id)}
                className="text-[11px] text-accent underline underline-offset-2 hover:opacity-70"
              >
                show again
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ExportMenu({ options }: { options: ExportOptions }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const slides = slideCount(options)
  const disabled = options.entries.length === 0

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const run = async (label: string, fn: () => Promise<unknown>, done: (r: unknown) => string) => {
    setBusy(label)
    setError(null)
    setNote(null)
    setOpen(false)
    try {
      setNote(done(await fn()))
      setTimeout(() => setNote(null), 6000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The export failed.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div ref={ref} className="relative flex items-center gap-3">
      {note && <span className="text-[12px] text-ink-soft">{note}</span>}
      {error && <span className="max-w-md text-[12px] text-flag">{error}</span>}

      <button
        type="button"
        aria-expanded={open}
        disabled={disabled || busy !== null}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-50"
        style={{
          borderColor: 'var(--color-accent)',
          background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
          color: 'var(--color-accent)',
        }}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M12 3v12M7 11l5 5 5-5M4 20h16" />
        </svg>
        {busy ?? 'Export'}
        <span className="opacity-60">{open ? '⌃' : '⌄'}</span>
      </button>

      {open && (
        <div className="absolute top-full right-0 z-30 mt-1 w-80 rounded-md border border-hairline bg-white p-1.5 shadow-lg">
          <Option
            title={slides === 1 ? 'Slide, one 16:9 PNG' : 'Slides, one PNG per slide'}
            detail={
              slides === 1
                ? 'A single 16:9 image. Drop straight onto a PowerPoint slide.'
                : `${slides} 16:9 images in a ZIP. Unzip and drop straight onto PowerPoint slides.`
            }
            recommended
            onClick={() =>
              run(
                'Exporting…',
                () => downloadSlidePngs(options),
                (n) => `ZIP with ${n} slide ${n === 1 ? 'image' : 'images'} downloaded.`,
              )
            }
          />
          <Option
            title="PDF"
            detail={`One document, ${slides} ${slides === 1 ? 'page' : 'pages'}, same 16:9 layout. Good for circulating or printing.`}
            onClick={() =>
              run(
                'Building PDF…',
                () => downloadPdf(options),
                (n) => `PDF with ${n} ${n === 1 ? 'page' : 'pages'} downloaded.`,
              )
            }
          />
          <Option
            title="Single tall PNG"
            detail={`All ${options.entries.length} rows in one image. Good for a report or a poster, too tall for a slide.`}
            onClick={() =>
              run('Exporting…', () => downloadFigurePng(options), () => 'Image downloaded.')
            }
          />
        </div>
      )}
    </div>
  )
}

function Option({
  title,
  detail,
  recommended,
  onClick,
}: {
  title: string
  detail: string
  recommended?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded px-2.5 py-2 text-left hover:bg-black/[0.04]"
    >
      <span className="flex items-baseline gap-2">
        <span className="text-[13px] font-semibold text-ink">{title}</span>
        {recommended && (
          <span className="text-[9px] font-semibold tracking-[0.1em] text-accent uppercase">
            recommended
          </span>
        )}
      </span>
      <span className="mt-0.5 block text-[11px] leading-snug text-ink-soft">{detail}</span>
    </button>
  )
}
