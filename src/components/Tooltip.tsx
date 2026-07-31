/**
 * Per-entry detail panel, shown on hover and pinned on tap.
 *
 * Carries everything the row itself cannot: full name, indication, every route
 * and interval with its provenance, stage, highest phase, developers and drug
 * class.
 *
 * Nothing in here is interactive. The card tracks the cursor, so anything
 * clickable inside it cannot be reached: the mouse moves the card away as it
 * approaches. The link to LAPaL is a button on the row instead.
 */
import { useEffect, useState } from 'react'
import type { Entry, Meta } from '../types'
import { indicationBadge } from '../types'
import { stageVar } from '../theme'

export interface TooltipTarget {
  entry: Entry
  x: number
  y: number
  /** Pinned tooltips survive mouse-out and are dismissed by a click or Escape. */
  pinned: boolean
}

const W = 340
const MARGIN = 14

export function Tooltip({
  target,
  meta,
  onDismiss,
}: {
  target: TooltipTarget
  meta: Meta
  onDismiss: () => void
}) {
  const { entry } = target
  const [vw, setVw] = useState(() => window.innerWidth)
  const [vh, setVh] = useState(() => window.innerHeight)

  useEffect(() => {
    const onResize = () => {
      setVw(window.innerWidth)
      setVh(window.innerHeight)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (!target.pinned) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [target.pinned, onDismiss])

  // Flip to the other side of the cursor rather than running off the viewport.
  const left = target.x + W + MARGIN * 2 > vw ? Math.max(MARGIN, target.x - W - MARGIN) : target.x + MARGIN
  // Nudge up if the panel would fall off the bottom. Height is estimated
  // generously; being a little conservative is better than clipping content.
  const estHeight = 300
  const top = Math.max(MARGIN, Math.min(target.y + MARGIN, vh - estHeight - MARGIN))

  const badge = indicationBadge(entry)

  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 rounded-md border border-hairline bg-white p-4 shadow-lg"
      style={{ left, top, width: W }}
    >
      <div className="mb-2 flex items-start gap-2">
        <span
          aria-hidden
          className="mt-1.5 inline-block size-2.5 shrink-0 rounded-full"
          style={{ background: stageVar(entry.stage) }}
        />
        <h3 className="text-[15px] leading-snug font-semibold text-ink">
          {entry.name_full}
        </h3>
      </div>

      <dl className="space-y-1.5 text-[13px] leading-relaxed">
        <Field label="Indication" value={badge} />
        <Field label="Band" value={meta.record_bands[entry.band] ?? entry.band} />
        <Field
          label="Stage"
          value={`${entry.stage} · ${meta.stage_tiers[entry.stage]?.definition ?? ''}`}
        />
        {entry.highest_phase && <Field label="Highest phase" value={entry.highest_phase} />}
        <Field
          label="Route"
          value={
            entry.routes.length
              ? entry.routes.map((r, i) => `${r} (${entry.routes_full[i] ?? ''})`).join(', ')
              : 'Not recorded'
          }
        />
        <Field
          label="Interval"
          value={
            entry.frequencies.length
              ? entry.frequencies.map((f, i) => `${f} (${entry.frequencies_full[i] ?? ''})`).join(', ')
              : 'Not stated'
          }
        />
        <Field label="Interval source" value={entry.frequency_provenance} />
        {entry.drug_class && <Field label="Class" value={entry.drug_class} />}
        <Field
          label="Developer"
          value={entry.developers_full.length ? entry.developers_full.join('; ') : 'Not recorded'}
        />
      </dl>

    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[86px_1fr] gap-2">
      <dt className="text-[11px] tracking-wide text-ink-soft uppercase">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  )
}
