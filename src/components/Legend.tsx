/**
 * How to read the timeline.
 *
 * The legend describes what is ACTUALLY ON SCREEN, not the full vocabulary.
 * A key for a mark that appears nowhere is worse than no key at all: it tells
 * the reader to go looking for something that is not there. So each entry
 * below is conditional on the currently filtered set, and the legend shrinks
 * as the data is curated or filtered.
 *
 * Stage colours and definitions come from meta.stage_tiers; the notes come from
 * meta.encoding_notes, so the data file can speak for itself.
 *
 * Stage and indication sit behind "How to read this" rather than in the always
 * visible row. Both are already legible without the key, since stage names are
 * spelled out in the hover card and the indication is tagged Tx, Prev or Both
 * on every row, and keeping them out of the standing header is what stops the
 * page opening with more explanation than picture. The route and interval codes
 * stay visible, because those genuinely cannot be guessed.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Entry, Meta } from '../types'
import { phaseLabel } from '../types'
import { BAR_H, BAR_OPACITY, DOT_R, rowMarks } from '../encoding'
import { stageVar } from '../theme'
import { BandTag } from './BandTag'

export function Legend({
  entries,
  meta,
  /**
   * The dot, range-bar and not-stated-lane keys describe the timeline's marks
   * and mean nothing in the class grid, so they are suppressed there. Stage,
   * route and phase apply to both views.
   */
  showIntervalKeys = true,
  showBandKey = false,
}: {
  entries: Entry[]
  meta: Meta
  showIntervalKeys?: boolean
  /** Every view except the charts tags rows C or F/R; explain it wherever it shows. */
  showBandKey?: boolean
}) {
  const [open, setOpen] = useState(false)

  // What marks does the current view actually contain?
  const marks = entries.map((e) => rowMarks(e, meta))
  const present = {
    dot: showIntervalKeys && marks.some((m) => m.dotIndices.length > 0),
    range: showIntervalKeys && marks.some((m) => m.span !== null),
    notStated: showIntervalKeys && marks.some((m) => m.notStated),
  }
  const stagesPresent = Object.keys(meta.stage_tiers).filter((s) =>
    entries.some((e) => e.stage === s),
  )
  // In ramp order, and only the phases actually on screen, same rule as the
  // rest of this legend.
  const phasesPresent = (meta.phase_order ?? []).filter((ph) =>
    entries.some((e) => e.highest_phase === ph),
  )

  return (
    <div className="border-b border-hairline py-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {present.dot && (
            <MarkKey label="stated interval">
              <circle cx={11} cy={9} r={DOT_R} fill="var(--color-ink-soft)" />
            </MarkKey>
          )}
          {present.range && (
            <MarkKey label="range studied">
              <rect
                x={3}
                y={9 - BAR_H / 2}
                width={16}
                height={BAR_H}
                rx={BAR_H / 2}
                fill="var(--color-ink-soft)"
                opacity={BAR_OPACITY}
              />
              <circle cx={3} cy={9} r={DOT_R} fill="var(--color-ink-soft)" />
              <circle cx={19} cy={9} r={DOT_R} fill="var(--color-ink-soft)" />
            </MarkKey>
          )}
          {present.notStated && (
            <MarkKey label="not stated">
              <circle
                cx={11}
                cy={9}
                r={DOT_R}
                fill="var(--color-paper)"
                stroke="var(--color-ink-soft)"
                strokeWidth={1.6}
              />
            </MarkKey>
          )}
        </div>

        <span className="flex-1" />

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-[12px] text-accent underline underline-offset-4 hover:opacity-70"
          aria-expanded={open}
        >
          {open ? 'Hide notes on the encoding' : 'How to read this'}
        </button>
      </div>

      {/*
        The route codes and the interval codes are not self-explanatory, and
        putting them only in the hover card left them undefined for anyone
        reading the chart rather than probing it. Both keys are always visible.
      */}
      <div className="mt-3 space-y-1.5 border-t border-hairline pt-3">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px] text-ink-soft">
          <span className="text-[10px] font-semibold tracking-[0.14em] text-ink-soft uppercase">
            {meta.route_legend_label ?? 'Routes of administration'}
          </span>
          {Object.entries(meta.route_legend).map(([code, label]) => (
            <span key={code} className="whitespace-nowrap">
              <span
                className="rounded-sm border px-1 py-px font-mono text-[10px]"
                style={
                  meta.route_colours?.[code]
                    ? {
                        background: `color-mix(in srgb, ${meta.route_colours[code]} 14%, transparent)`,
                        borderColor: `color-mix(in srgb, ${meta.route_colours[code]} 45%, transparent)`,
                        color: 'var(--color-ink)',
                      }
                    : { borderColor: 'var(--color-hairline)', color: 'var(--color-ink-soft)' }
                }
              >
                {code}
              </span>{' '}
              <span className="text-ink">{label}</span>
            </span>
          ))}
        </p>

        {phasesPresent.length > 0 && (
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px] text-ink-soft">
            <span className="text-[10px] font-semibold tracking-[0.14em] text-ink-soft uppercase">
              Highest phase
            </span>
            <span className="flex flex-wrap items-center gap-1.5">
              {phasesPresent.map((ph) => (
                <span
                  key={ph}
                  title={`Most advanced trial on record: ${ph}`}
                  className="rounded-full px-1.5 py-px text-[9px] font-semibold tracking-[0.04em] whitespace-nowrap"
                  style={{ background: meta.phase_colours?.[ph], color: 'var(--color-ink)' }}
                >
                  {phaseLabel(meta, ph, true)}
                </span>
              ))}
            </span>
            <span>
              the most advanced clinical trial on record for that entry. Darker is further along.
              No chip means none is recorded.
            </span>
          </p>
        )}

        {showBandKey && (
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px] text-ink-soft">
            <span className="text-[10px] font-semibold tracking-[0.14em] text-ink-soft uppercase">
              Entry type
            </span>
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="flex items-center gap-1.5">
                <BandTag band="formulations" meta={meta} />
                <span className="text-ink">formulation or regimen</span>
              </span>
              <span className="flex items-center gap-1.5">
                <BandTag band="compounds" meta={meta} />
                <span className="text-ink">underlying compound</span>
              </span>
            </span>
          </p>
        )}

        {showIntervalKeys && meta.dosing_axis_note && (
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px] leading-relaxed text-ink-soft">
            <span className="text-[10px] font-semibold tracking-[0.14em] text-ink-soft uppercase">
              Dosing interval
            </span>
            <span className="max-w-4xl">{meta.dosing_axis_note}</span>
          </p>
        )}
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px] text-ink-soft">
            <span className="text-[10px] font-semibold tracking-[0.14em] text-ink-soft uppercase">
              Indication
            </span>
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block size-2.5 rounded-full"
                  style={{ background: 'var(--color-treatment)' }}
                />
                <span className="text-ink">Treatment, tagged Tx</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block size-2.5 rounded-full"
                  style={{ background: 'var(--color-prevention)' }}
                />
                <span className="text-ink">Prevention, tagged Prev</span>
              </span>
              <span className="text-ink">Entries for both are tagged Both and appear once.</span>
            </span>
          </p>

          {stagesPresent.length > 0 && (
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px] text-ink-soft">
              <span className="text-[10px] font-semibold tracking-[0.14em] text-ink-soft uppercase">
                Stage
              </span>
              <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {stagesPresent.map((stage) => (
                  <span key={stage} className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="inline-block size-2.5 rounded-full"
                      style={{ background: stageVar(stage) }}
                    />
                    <span className="text-ink">{stage}</span>
                    <span>{meta.stage_tiers[stage]?.definition}</span>
                  </span>
                ))}
              </span>
            </p>
          )}

        <ul className="max-w-3xl space-y-1.5 border-l-2 border-hairline pl-4">
          {meta.encoding_notes.map((note, i) => (
            <li key={i} className="text-[13px] leading-relaxed text-ink-soft">
              {note}
            </li>
          ))}
          {present.range && (
            <li className="text-[13px] leading-relaxed text-ink-soft">
              Where several intervals are studied but one in between is not recorded, the bar
              spans the full range and the missing interval shows as bar without a dot.
            </li>
          )}
          <li className="text-[13px] leading-relaxed text-ink-soft">
            This key lists only the marks present in the current selection, so it changes as you
            filter.
          </li>
        </ul>
        </div>
      )}
    </div>
  )
}

function MarkKey({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width={22} height={18} aria-hidden className="shrink-0">
        {children}
      </svg>
      <span className="text-[12px] text-ink-soft">{label}</span>
    </span>
  )
}
